import { template as _$template } from "solid-js/web";
import { mergeProps as _$mergeProps } from "solid-js/web";
import { memo as _$memo } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<div data-slot=popover-header>`),
  _tmpl$2 = /*#__PURE__*/_$template(`<div data-slot=popover-body>`);
import { Popover as Kobalte } from "@kobalte/core/popover";
import { Show, createEffect, splitProps } from "solid-js";
import { createStore } from "solid-js/store";
import { makeEventListener } from "@solid-primitives/event-listener";
import { useI18n } from "../context/i18n.js";
import { IconButton } from "./icon-button.js";
export function Popover(props) {
  const i18n = useI18n();
  const [local, rest] = splitProps(props, ["trigger", "triggerAs", "triggerProps", "title", "description", "class", "classList", "style", "children", "portal", "open", "defaultOpen", "onOpenChange", "modal"]);
  const [state, setState] = createStore({
    contentRef: undefined,
    triggerRef: undefined,
    dismiss: null,
    uncontrolledOpen: local.defaultOpen ?? false
  });
  const controlled = () => local.open !== undefined;
  const opened = () => {
    if (controlled()) return local.open ?? false;
    return state.uncontrolledOpen;
  };
  const onOpenChange = next => {
    if (next) setState("dismiss", null);
    if (local.onOpenChange) local.onOpenChange(next);
    if (controlled()) return;
    setState("uncontrolledOpen", next);
  };
  createEffect(() => {
    if (!opened()) return;
    const inside = node => {
      if (!node) return false;
      const content = state.contentRef;
      if (content && content.contains(node)) return true;
      const trigger = state.triggerRef;
      if (trigger && trigger.contains(node)) return true;
      return false;
    };
    const close = reason => {
      setState("dismiss", reason);
      onOpenChange(false);
    };
    const onKeyDown = event => {
      if (event.key !== "Escape") return;
      close("escape");
      event.preventDefault();
      event.stopPropagation();
    };
    const onPointerDown = event => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (inside(target)) return;
      close("outside");
    };
    const onFocusIn = event => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (inside(target)) return;
      close("outside");
    };
    makeEventListener(window, "keydown", onKeyDown, {
      capture: true
    });
    makeEventListener(window, "pointerdown", onPointerDown, {
      capture: true
    });
    makeEventListener(window, "focusin", onFocusIn, {
      capture: true
    });
  });
  const content = () => _$createComponent(Kobalte.Content, {
    ref: el => setState("contentRef", el),
    "data-component": "popover-content",
    get classList() {
      return {
        ...local.classList,
        [local.class ?? ""]: !!local.class
      };
    },
    get style() {
      return local.style;
    },
    onCloseAutoFocus: event => {
      if (state.dismiss === "outside") event.preventDefault();
      setState("dismiss", null);
    },
    get children() {
      return [_$createComponent(Show, {
        get when() {
          return local.title;
        },
        get children() {
          var _el$ = _tmpl$();
          _$insert(_el$, _$createComponent(Kobalte.Title, {
            "data-slot": "popover-title",
            get children() {
              return local.title;
            }
          }), null);
          _$insert(_el$, _$createComponent(Kobalte.CloseButton, {
            "data-slot": "popover-close-button",
            as: IconButton,
            icon: "close",
            variant: "ghost",
            get ["aria-label"]() {
              return i18n.t("ui.common.close");
            }
          }), null);
          return _el$;
        }
      }), _$createComponent(Show, {
        get when() {
          return local.description;
        },
        get children() {
          return _$createComponent(Kobalte.Description, {
            "data-slot": "popover-description",
            get children() {
              return local.description;
            }
          });
        }
      }), (() => {
        var _el$2 = _tmpl$2();
        _$insert(_el$2, () => local.children);
        return _el$2;
      })()];
    }
  });
  return _$createComponent(Kobalte, _$mergeProps({
    gutter: 4
  }, rest, {
    get open() {
      return opened();
    },
    onOpenChange: onOpenChange,
    get modal() {
      return local.modal ?? false;
    },
    get children() {
      return [_$createComponent(Kobalte.Trigger, _$mergeProps({
        ref: el => setState("triggerRef", el),
        get as() {
          return local.triggerAs ?? "div";
        },
        "data-slot": "popover-trigger"
      }, () => local.triggerProps, {
        get children() {
          return local.trigger;
        }
      })), _$createComponent(Show, {
        get when() {
          return local.portal ?? true;
        },
        get fallback() {
          return content();
        },
        get children() {
          return _$createComponent(Kobalte.Portal, {
            get children() {
              return content();
            }
          });
        }
      })];
    }
  }));
}