import { batch, createMemo, onCleanup, onMount } from "../../lib/reactivity.js";
import { createStore } from "../../lib/store.js";
import { makeEventListener } from "../../lib/primitives/event-listener.js";
import { same } from "@/utils/same.js";

/** @file Session-page helpers: tab bookkeeping (derived open/active/closable tabs), terminal focus, review-file opening, tab reordering, and resize-drag state. */

const emptyTabs = [];

/**
 * Build the storage/lookup key for a session from its directory and id.
 * @param {string} dir - Workspace directory.
 * @param {string} id - Session id (optional).
 * @returns {string} The combined session key (`<dir>/<id>` or just `<dir>`).
 */
export const getSessionKey = (dir, id) => `${dir ?? ""}${id ? `/${id}` : ""}`;

/**
 * Derive reactive views over the open tabs: which file tabs are open, the
 * resolved active tab, the active file tab (if any), and whether the active tab
 * is closable. Pseudo tabs "context" and "review" are handled specially.
 * @param {Object} input - `{ tabs, pathFromTab, normalizeTab, review, hasReview }` accessors/functions.
 * @returns {Object} `{ contextOpen, openedTabs, activeTab, activeFileTab, closableTab }` reactive memos.
 */
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
/**
 * Move keyboard focus into the terminal with the given id, focusing its
 * textarea when present and otherwise dispatching a pointerdown to wake it.
 * @param {string} id - Terminal identifier (matches `terminal-wrapper-<id>`).
 * @returns {boolean} True when a terminal element was found and focused.
 */
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

/**
 * Decide whether a keydown should redirect focus into the terminal: only for
 * "typing" keys, not bare modifiers or modified shortcuts.
 * @param {KeyboardEvent} event - The keydown event.
 * @returns {boolean} True when the key should focus the terminal.
 */
export const shouldFocusTerminalOnKeyDown = event => {
  if (skip.has(event.key)) return false;
  return !(event.ctrlKey || event.metaKey || event.altKey);
};
/**
 * Build a handler that opens a changed file from the review panel: switches to
 * the all-files view, loads the file (awaiting if async), then opens and
 * activates its tab, all batched.
 * @param {Object} input - `{ showAllFiles, loadFile, tabForPath, openTab, setActive }` functions.
 * @returns {Function} A `(path) => void` handler that opens the given review file.
 */
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
/**
 * Build a handler that opens a session file tab from a tab/path value:
 * normalizes it, opens the tab, loads the file, opens the review panel, and
 * activates the tab.
 * @param {Object} input - `{ normalizeTab, openTab, pathFromTab, loadFile, openReviewPanel, setActive }` functions.
 * @returns {Function} A `(value) => void` handler that opens the given session file tab.
 */
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
/**
 * Compute the destination index for a drag-reorder of tabs.
 * @param {Array} tabs - Current ordered tab list.
 * @param {string} from - The dragged tab.
 * @param {string} to - The drop-target tab.
 * @returns {number} The target index, or undefined when either tab is missing or unchanged.
 */
export const getTabReorderIndex = (tabs, from, to) => {
  const fromIndex = tabs.indexOf(from);
  const toIndex = tabs.indexOf(to);
  if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return undefined;
  return toIndex;
};
/**
 * Track transient "actively resizing" state for a drag handle: `active` is true
 * while dragging and is cleared on pointerup/cancel/blur or shortly after the
 * last `touch()`. Disables width transitions during a drag.
 * @returns {Object} `{ active, start, touch }` where `active` is an accessor, `start` marks dragging on, and `touch` keeps it alive for a short window.
 */
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