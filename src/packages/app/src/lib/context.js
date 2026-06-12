import {
  createComponent,
  createContext,
  createEffect,
  createMemo,
  createRenderEffect,
  createRoot,
  createSignal,
  getOwner,
  onCleanup,
  runWithOwner,
  Show,
  useContext
} from "solid-js";
import { makeEventListener } from "./primitives/event-listener.js";
import { dict as en } from "@/i18n/en.js";
import { dict as uiEn } from "@/i18n/ui/en.js";

// --- helper.js ---
export function createSimpleContext(input) {
  const ctx = createContext();
  return {
    provider: props => {
      const init = input.init(props);
      const gate = input.gate ?? true;
      if (!gate) {
        return createComponent(ctx.Provider, {
          value: init,
          get children() {
            return props.children;
          }
        });
      }

      // Access init.ready inside the memo to make it reactive for getter properties
      const isReady = createMemo(() => {
        const ready = init.ready;
        return ready === undefined || (typeof ready === "function" ? ready() : ready);
      });
      return createComponent(Show, {
        get when() {
          return isReady();
        },
        get children() {
          return createComponent(ctx.Provider, {
            value: init,
            get children() {
              return props.children;
            }
          });
        }
      });
    },
    use() {
      const value = useContext(ctx);
      if (!value) throw new Error(`${input.name} context must be used within a context provider`);
      return value;
    }
  };
}

// --- data.js ---
export const {
  use: useData,
  provider: DataProvider
} = createSimpleContext({
  name: "Data",
  init: props => {
    return {
      get store() {
        return props.data;
      },
      get directory() {
        return props.directory;
      },
      navigateToSession: props.onNavigateToSession,
      sessionHref: props.onSessionHref
    };
  }
});

// --- file.js ---
const fileCtx = createSimpleContext({
  name: "FileComponent",
  init: props => props.component
});
export const FileComponentProvider = fileCtx.provider;
export const useFileComponent = fileCtx.use;

// --- dialog.js ---
// Resolve a possibly-reactive value the way solid-js/web's insert() does:
// call accessors (here, the active dialog's memo) until a concrete value
// remains. Runs inside a render effect, so the reads stay tracked.
function resolveValue(value) {
  while (typeof value === "function") value = value();
  return value;
}

// Render `value` as the sole content of `el`, mirroring insert() semantics for
// the shapes the dialog stack can hold: nothing (null/undefined/boolean), a DOM
// node, a string/number, or an array of those.
function renderInto(el, value) {
  if (value == null || typeof value === "boolean") {
    el.replaceChildren();
    return;
  }
  if (Array.isArray(value)) {
    const nodes = [];
    for (const entry of value) {
      const resolved = resolveValue(entry);
      if (resolved == null || typeof resolved === "boolean") continue;
      nodes.push(resolved instanceof Node ? resolved : String(resolved));
    }
    el.replaceChildren(...nodes);
    return;
  }
  el.replaceChildren(value instanceof Node ? value : String(value));
}

const DialogContext = createContext();
function init() {
  const [active, setActive] = createSignal();
  const timer = {
    current: undefined
  };
  const lock = {
    value: false
  };
  onCleanup(() => {
    if (timer.current === undefined) return;
    clearTimeout(timer.current);
    timer.current = undefined;
  });
  const close = () => {
    const current = active();
    if (!current || lock.value) return;
    lock.value = true;
    current.onClose?.();
    current.setClosing(true);
    const id = current.id;
    if (timer.current !== undefined) {
      clearTimeout(timer.current);
      timer.current = undefined;
    }
    timer.current = setTimeout(() => {
      timer.current = undefined;
      current.dispose();
      if (active()?.id === id) setActive(undefined);
      lock.value = false;
    }, 100);
  };
  createEffect(() => {
    if (!active()) return;
    const onKeyDown = event => {
      if (event.key !== "Escape") return;
      close();
      event.preventDefault();
      event.stopPropagation();
    };
    makeEventListener(window, "keydown", onKeyDown, {
      capture: true
    });
  });
  const show = (element, owner, onClose) => {
    // Immediately dispose any existing dialog when showing a new one
    const current = active();
    if (current) {
      current.dispose();
      setActive(undefined);
    }
    if (timer.current !== undefined) {
      clearTimeout(timer.current);
      timer.current = undefined;
    }
    lock.value = false;
    const id = Math.random().toString(36).slice(2);
    let dispose;
    let setClosing;
    const node = runWithOwner(owner, () => createRoot(d => {
      dispose = d;
      const [closing, setClosingSignal] = createSignal(false);
      setClosing = setClosingSignal;
      // The shown element (a vanilla content panel, e.g. vendor Dialog/
      // ImagePreview) is rendered directly while it is not closing. The
      // overlay/backdrop and Escape handling are owned by this provider's
      // stack and capture-phase keydown listener, so no Kobalte Portal/Overlay
      // wrapper is needed. `equals: false` matches the compiled memo() wrapper's
      // semantics.
      return createMemo(() => closing() ? null : element(), undefined, {
        equals: false
      });
    }));
    if (!dispose || !setClosing) return;
    setActive({
      id,
      node,
      dispose,
      owner,
      onClose,
      setClosing
    });
  };
  return {
    get active() {
      return active();
    },
    close,
    show
  };
}
export function DialogProvider(props) {
  const ctx = init();
  return createComponent(DialogContext.Provider, {
    value: ctx,
    get children() {
      // Stack element that hosts the currently shown dialog. The render effect
      // replaces solid-js/web insert(): it tracks both the `active` signal (via
      // ctx.active) and the per-dialog closing memo, clearing or swapping the
      // stack contents whenever either changes.
      const stack = document.createElement("div");
      stack.setAttribute("data-component", "dialog-stack");
      createRenderEffect(() => {
        renderInto(stack, resolveValue(ctx.active?.node));
      });
      return [createMemo(() => props.children, undefined, {
        equals: false
      }), stack];
    }
  });
}
export function useDialog() {
  const ctx = useContext(DialogContext);
  const owner = getOwner();
  if (!owner) {
    throw new Error("useDialog must be used within a DialogProvider");
  }
  if (!ctx) {
    throw new Error("useDialog must be used within a DialogProvider");
  }
  return {
    get active() {
      return ctx.active;
    },
    show(element, onClose) {
      const base = ctx.active?.owner ?? owner;
      ctx.show(element, base, onClose);
    },
    close() {
      ctx.close();
    }
  };
}

// --- i18n.js ---
function resolveTemplate(text, params) {
  if (!params) return text;
  return text.replace(/{{\s*([^}]+?)\s*}}/g, (_, rawKey) => {
    const key = String(rawKey);
    const value = params[key];
    return value === undefined ? "" : String(value);
  });
}
// Provider-less default. vendor/ui/context/i18n.js re-exports this context, so
// vendor components resolve here too when no I18nProvider is mounted (storybook,
// tests) — merge the vendor ui.* dictionary so they still fall back to English
// strings instead of raw keys.
const fallbackDict = { ...en, ...uiEn };
const fallback = {
  locale: () => "en",
  t: (key, params) => {
    const value = fallbackDict[key] ?? String(key);
    return resolveTemplate(value, params);
  }
};
const I18nContext = createContext(fallback);
export function I18nProvider(props) {
  return createComponent(I18nContext.Provider, {
    get value() {
      return props.value;
    },
    get children() {
      return props.children;
    }
  });
}
export function useI18n() {
  return useContext(I18nContext);
}
