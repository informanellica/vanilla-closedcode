import { template as _$template } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { memo as _$memo } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<div data-component=dialog-stack>`);
import { createContext, createEffect, createRoot, createSignal, getOwner, onCleanup, runWithOwner, useContext } from "solid-js";
import { Dialog as Kobalte } from "@kobalte/core/dialog";
import { makeEventListener } from "@solid-primitives/event-listener";
const Context = createContext();
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
  return _$createComponent(Context.Provider, {
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
  const ctx = useContext(Context);
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