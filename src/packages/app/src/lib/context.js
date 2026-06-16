/** @file Renderer-wide Solid contexts: a generic `createSimpleContext` helper plus the Data, FileComponent, Dialog stack, and i18n providers/hooks used across the desktop app. */
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
} from "./reactivity.js";
import { makeEventListener } from "./primitives/event-listener.js";
import { dict as en } from "@/i18n/en.js";
import { dict as uiEn } from "@/i18n/ui/en.js";

// --- helper.js ---
/**
 * Build a small Solid context wrapper with a provider component and a `use`
 * accessor. The provider runs `input.init(props)` once to produce the context
 * value and, when gated, only renders its children after the value reports
 * `ready`.
 * @param {Object} input - Context config: `name` (label used in error text), `init` (Function returning the context value from props), and optional `gate` (boolean controlling whether to defer rendering until `ready`).
 * @returns {Object} An object with `provider` (component) and `use` (Function returning the context value or throwing if missing).
 */
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

      // Read init.ready inside the memo so the gate stays reactive even when
      // `ready` is exposed as a getter property on the init object.
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
/**
 * Data context exposing the shared session store, working directory, and
 * session-navigation callbacks.
 * `useData` returns the value; `DataProvider` supplies it from its props
 * (`data`, `directory`, `onNavigateToSession`, `onSessionHref`).
 */
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
/**
 * Context carrying the active file-rendering component so descendants can
 * render file contents without importing it directly.
 */
const fileCtx = createSimpleContext({
  name: "FileComponent",
  init: props => props.component
});
/** Provider supplying the file component (from its `component` prop) to descendants. */
export const FileComponentProvider = fileCtx.provider;
/**
 * Access the file-rendering component from context.
 * @returns {*} The provided file component.
 */
export const useFileComponent = fileCtx.use;

// --- dialog.js ---
// Resolve a possibly-reactive value the way solid-js/web's insert() does:
// call accessors (here, the active dialog's memo) until a concrete value
// remains. Runs inside a render effect, so the reads stay tracked.
/**
 * Unwrap a possibly-reactive value by invoking accessor functions until a
 * non-function value remains.
 * @param {*} value - A concrete value or a (possibly nested) accessor function.
 * @returns {*} The resolved concrete value.
 */
function resolveValue(value) {
  while (typeof value === "function") value = value();
  return value;
}

// Render `value` as the sole content of `el`, mirroring insert() semantics for
// the shapes the dialog stack can hold: nothing (null/undefined/boolean), a DOM
// node, a string/number, or an array of those.
/**
 * Replace the children of `el` with the rendered form of `value`, mirroring
 * solid-js/web `insert()` for the value shapes the dialog stack can hold.
 * @param {HTMLElement} el - Container element whose children are replaced.
 * @param {*} value - Content to render: null/undefined/boolean (cleared), a DOM Node, a string/number, or an array of those.
 * @returns {void}
 */
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
/**
 * Create the dialog-stack controller backing the DialogProvider: tracks the
 * single active dialog, wires capture-phase Escape-to-close, and exposes
 * `show`/`close` with a brief closing animation window.
 * @returns {Object} Controller with a reactive `active` getter, `close()`, and `show(element, owner, onClose)`.
 */
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
      // stack and capture-phase keydown listener, so no upstream Portal/Overlay
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
/**
 * Provider component that hosts the dialog stack and exposes the dialog
 * controller to descendants via context.
 * @param {Object} props - Component props; `children` is rendered alongside the dialog-stack host element.
 * @returns {*} The rendered provider node (children plus the dialog-stack host).
 */
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
/**
 * Hook returning a handle to the dialog stack from within a DialogProvider.
 * Throws if used outside a provider or reactive owner.
 * @returns {Object} Handle with a reactive `active` getter, `show(element, onClose)`, and `close()`.
 */
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
/**
 * Interpolate `{{name}}` placeholders in a translation string with values from
 * `params`; unknown keys become empty strings.
 * @param {string} text - Template string possibly containing `{{name}}` placeholders.
 * @param {Object} params - Map of placeholder names to substitution values.
 * @returns {string} The interpolated string (the input unchanged when `params` is absent).
 */
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
/**
 * Provider supplying the active i18n instance (locale accessor + `t`
 * translator) to descendants.
 * @param {Object} props - Component props; `value` is the i18n instance to provide and `children` is rendered within it.
 * @returns {*} The rendered provider node.
 */
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
/**
 * Hook returning the current i18n instance, falling back to the English
 * provider-less default when no I18nProvider is mounted.
 * @returns {Object} The i18n instance with `locale()` and `t(key, params)`.
 */
export function useI18n() {
  return useContext(I18nContext);
}
