import { template as _$template } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { memo as _$memo } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
import {
  createContext,
  createEffect,
  createMemo,
  createRoot,
  createSignal,
  getOwner,
  onCleanup,
  runWithOwner,
  Show,
  useContext
} from "solid-js";
import { Dialog as Kobalte } from "@kobalte/core/dialog";
import { makeEventListener } from "@solid-primitives/event-listener";
import { dict as en } from "@/i18n/en.js";

// --- helper.js ---
export function createSimpleContext(input) {
  const ctx = createContext();
  return {
    provider: props => {
      const init = input.init(props);
      const gate = input.gate ?? true;
      if (!gate) {
        return _$createComponent(ctx.Provider, {
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
      return _$createComponent(Show, {
        get when() {
          return isReady();
        },
        get children() {
          return _$createComponent(ctx.Provider, {
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
var _tmpl$ = /*#__PURE__*/_$template(`<div data-component=dialog-stack>`);
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
      return _$createComponent(Kobalte, {
        modal: true,
        get open() {
          return !closing();
        },
        onOpenChange: open => {
          if (open) return;
          close();
        },
        get children() {
          return _$createComponent(Kobalte.Portal, {
            get children() {
              return [_$createComponent(Kobalte.Overlay, {
                "data-component": "dialog-overlay",
                onClick: close
              }), _$memo(() => element())];
            }
          });
        }
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
  return _$createComponent(DialogContext.Provider, {
    value: ctx,
    get children() {
      return [_$memo(() => props.children), (() => {
        var _el$ = _tmpl$();
        _$insert(_el$, () => ctx.active?.node);
        return _el$;
      })()];
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
const fallback = {
  locale: () => "en",
  t: (key, params) => {
    const value = en[key] ?? String(key);
    return resolveTemplate(value, params);
  }
};
const I18nContext = createContext(fallback);
export function I18nProvider(props) {
  return _$createComponent(I18nContext.Provider, {
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
