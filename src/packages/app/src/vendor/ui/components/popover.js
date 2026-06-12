import { insert as _solidInsert } from "solid-js/web";
import { createComponent, createEffect, createMemo, mergeProps, splitProps } from "solid-js";
import { createStore } from "solid-js/store";
import { makeEventListener } from "@/lib/primitives/event-listener.js";
import { Popover as Kobalte } from "@kobalte/core/popover";
import { useI18n } from "../context/i18n.js";
import { IconButton } from "./icon-button.js";

// Build a detached element from compact HTML (no inter-element whitespace,
// matching the compiled Solid templates).
function template(html) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;
  return wrapper.firstElementChild;
}

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

  // Kobalte Popover.Content is presence-gated (its result is a reactive
  // accessor that only resolves while the popover is open), so its regions
  // must go through solid's insert() to stay live; a one-shot appendChild
  // would freeze them (established exception).
  const content = () => createComponent(Kobalte.Content, {
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
      // Runs once per Content mount (it reads no signals directly). The memos
      // below reproduce the compiled Show regions; Kobalte's own child
      // insertion resolves them reactively, keeping stable siblings (the body
      // div) mounted across header/description updates.

      // Show(title), non-keyed: the header (title + close button) is rebuilt
      // only when the title's truthiness flips, not on every title change;
      // the title text itself stays live through the children getter.
      const hasTitle = createMemo(() => !!local.title);
      const headerRegion = createMemo(() => {
        if (!hasTitle()) return undefined;
        const header = template(`<div data-slot="popover-header"></div>`);
        _solidInsert(header, createComponent(Kobalte.Title, {
          "data-slot": "popover-title",
          get children() {
            return local.title;
          }
        }), null);
        _solidInsert(header, createComponent(Kobalte.CloseButton, {
          "data-slot": "popover-close-button",
          as: IconButton,
          icon: "close",
          variant: "ghost",
          get ["aria-label"]() {
            return i18n.t("ui.common.close");
          }
        }), null);
        return header;
      });

      // Show(description).
      const hasDescription = createMemo(() => !!local.description);
      const descriptionRegion = createMemo(() => hasDescription()
        ? createComponent(Kobalte.Description, {
          "data-slot": "popover-description",
          get children() {
            return local.description;
          }
        })
        : undefined);

      const body = template(`<div data-slot="popover-body"></div>`);
      _solidInsert(body, () => local.children);

      return [headerRegion, descriptionRegion, body];
    }
  });
  return createComponent(Kobalte, mergeProps({
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
      // Show(portal ?? true) with fallback, non-keyed: portal vs inline
      // content is decided by truthiness; each flip re-creates the Content,
      // matching the compiled Show.
      const usePortal = createMemo(() => !!(local.portal ?? true));
      const contentRegion = createMemo(() => usePortal()
        ? createComponent(Kobalte.Portal, {
          get children() {
            return content();
          }
        })
        : content());
      return [createComponent(Kobalte.Trigger, mergeProps({
        ref: el => setState("triggerRef", el),
        get as() {
          return local.triggerAs ?? "div";
        },
        "data-slot": "popover-trigger"
      }, () => local.triggerProps, {
        get children() {
          return local.trigger;
        }
      })), contentRegion];
    }
  }));
}
