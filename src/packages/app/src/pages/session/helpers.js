import { batch, createMemo, onCleanup, onMount } from "../../lib/reactivity.js";
import { createStore } from "../../lib/store.js";
import { makeEventListener } from "../../lib/primitives/event-listener.js";
import { same } from "@/utils/same.js";
const emptyTabs = [];
export const getSessionKey = (dir, id) => `${dir ?? ""}${id ? `/${id}` : ""}`;
export const createSessionTabs = input => {
  const review = input.review ?? (() => false);
  const hasReview = input.hasReview ?? (() => false);
  const contextOpen = createMemo(() => input.tabs().active() === "context" || input.tabs().all().includes("context"));
  const openedTabs = createMemo(() => {
    const seen = new Set();
    return input.tabs().all().flatMap(tab => {
      if (tab === "context" || tab === "review") return [];
      const value = input.pathFromTab(tab) ? input.normalizeTab(tab) : tab;
      if (seen.has(value)) return [];
      seen.add(value);
      return [value];
    });
  }, emptyTabs, {
    equals: same
  });
  const activeTab = createMemo(() => {
    const active = input.tabs().active();
    if (active === "context") return active;
    if (active === "review" && review()) return active;
    if (active && input.pathFromTab(active)) return input.normalizeTab(active);
    const first = openedTabs()[0];
    if (first) return first;
    if (contextOpen()) return "context";
    if (review() && hasReview()) return "review";
    return "empty";
  });
  const activeFileTab = createMemo(() => {
    const active = activeTab();
    if (!openedTabs().includes(active)) return;
    return active;
  });
  const closableTab = createMemo(() => {
    const active = activeTab();
    if (active === "context") return active;
    if (!openedTabs().includes(active)) return;
    return active;
  });
  return {
    contextOpen,
    openedTabs,
    activeTab,
    activeFileTab,
    closableTab
  };
};
export const focusTerminalById = id => {
  const wrapper = document.getElementById(`terminal-wrapper-${id}`);
  const terminal = wrapper?.querySelector('[data-component="terminal"]');
  if (!(terminal instanceof HTMLElement)) return false;
  const textarea = terminal.querySelector("textarea");
  if (textarea instanceof HTMLTextAreaElement) {
    textarea.focus();
    return true;
  }
  terminal.focus();
  terminal.dispatchEvent(typeof PointerEvent === "function" ? new PointerEvent("pointerdown", {
    bubbles: true,
    cancelable: true
  }) : new MouseEvent("pointerdown", {
    bubbles: true,
    cancelable: true
  }));
  return true;
};
const skip = new Set(["Alt", "Control", "Meta", "Shift"]);
export const shouldFocusTerminalOnKeyDown = event => {
  if (skip.has(event.key)) return false;
  return !(event.ctrlKey || event.metaKey || event.altKey);
};
export const createOpenReviewFile = input => {
  return path => {
    batch(() => {
      input.showAllFiles();
      const maybePromise = input.loadFile(path);
      const open = () => {
        const tab = input.tabForPath(path);
        input.openTab(tab);
        input.setActive(tab);
      };
      if (maybePromise instanceof Promise) void maybePromise.then(open);else open();
    });
  };
};
export const createOpenSessionFileTab = input => {
  return value => {
    const next = input.normalizeTab(value);
    input.openTab(next);
    const path = input.pathFromTab(next);
    if (!path) return;
    input.loadFile(path);
    input.openReviewPanel();
    input.setActive(next);
  };
};
export const getTabReorderIndex = (tabs, from, to) => {
  const fromIndex = tabs.indexOf(from);
  const toIndex = tabs.indexOf(to);
  if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return undefined;
  return toIndex;
};
export const createSizing = () => {
  const [state, setState] = createStore({
    active: false
  });
  let t;
  const stop = () => {
    if (t !== undefined) {
      clearTimeout(t);
      t = undefined;
    }
    setState("active", false);
  };
  const start = () => {
    if (t !== undefined) {
      clearTimeout(t);
      t = undefined;
    }
    setState("active", true);
  };
  onMount(() => {
    makeEventListener(window, "pointerup", stop);
    makeEventListener(window, "pointercancel", stop);
    makeEventListener(window, "blur", stop);
  });
  onCleanup(() => {
    if (t !== undefined) clearTimeout(t);
  });
  return {
    active: () => state.active,
    start,
    touch() {
      start();
      t = window.setTimeout(stop, 120);
    }
  };
};