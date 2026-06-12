import { insert as _solidInsert } from "solid-js/web";
import { createComponent, createMemo, createRenderEffect } from "solid-js";
import { Dialog as Kobalte } from "@kobalte/core/dialog";
import { useI18n } from "../context/i18n.js";
import { IconButton } from "./icon-button.js";

// Build a detached element from compact HTML (no inter-element whitespace,
// matching the compiled Solid templates).
function template(html) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;
  return wrapper.firstElementChild;
}

// Mirror solid-js/web setAttribute semantics: nullish removes the attribute.
function setAttr(el, name, value) {
  if (value == null) el.removeAttribute(name);
  else el.setAttribute(name, value);
}

export function Dialog(props) {
  const i18n = useI18n();
  const root = template(`<div data-component="dialog"><div data-slot="dialog-container"></div></div>`);
  const container = root.querySelector('[data-slot="dialog-container"]');

  // Kobalte Dialog.Content is presence-gated (its result is a reactive
  // accessor that only resolves while the dialog is open), so it must go
  // through solid's insert() to stay live; a one-shot appendChild would
  // freeze it (established exception).
  _solidInsert(container, createComponent(Kobalte.Content, {
    "data-slot": "dialog-content",
    get ["data-no-header"]() {
      return !props.title && !props.action ? "" : undefined;
    },
    get classList() {
      return {
        ...props.classList,
        [props.class ?? ""]: !!props.class
      };
    },
    onOpenAutoFocus: e => {
      const target = e.currentTarget;
      const autofocusEl = target?.querySelector("[autofocus]");
      if (autofocusEl) {
        e.preventDefault();
        autofocusEl.focus();
      }
    },
    get children() {
      // Runs once per Content mount (it reads no signals directly). The memos
      // below reproduce the compiled Show/Switch regions; Kobalte's own child
      // insertion resolves them reactively, keeping stable siblings (the body
      // div) mounted across header/description updates.

      // Show(title || action), non-keyed: the header is rebuilt only when the
      // condition's truthiness flips, not on every title/action change.
      const hasHeader = createMemo(() => !!(props.title || props.action));
      const headerRegion = createMemo(() => {
        if (!hasHeader()) return undefined;
        const header = template(`<div data-slot="dialog-header"></div>`);
        // Show(title): mount the Kobalte title only while a title exists; the
        // title text itself stays live through the children getter.
        const hasTitle = createMemo(() => !!props.title);
        _solidInsert(header, createMemo(() => hasTitle()
          ? createComponent(Kobalte.Title, {
            "data-slot": "dialog-title",
            get children() {
              return props.title;
            }
          })
          : undefined), null);
        // Switch/Match: a caller-provided action replaces the default close
        // button. The truthiness memo keeps falsy-to-falsy action changes
        // from rebuilding the close button, matching the compiled Switch.
        const hasAction = createMemo(() => !!props.action);
        _solidInsert(header, createMemo(() => hasAction()
          ? props.action
          : createComponent(Kobalte.CloseButton, {
            "data-slot": "dialog-close-button",
            as: IconButton,
            icon: "close",
            variant: "ghost",
            get ["aria-label"]() {
              return i18n.t("ui.common.close");
            }
          })), null);
        return header;
      });

      // Show(description).
      const hasDescription = createMemo(() => !!props.description);
      const descriptionRegion = createMemo(() => hasDescription()
        ? createComponent(Kobalte.Description, {
          "data-slot": "dialog-description",
          style: {
            "margin-left": "-4px"
          },
          get children() {
            return props.description;
          }
        })
        : undefined);

      const body = template(`<div data-slot="dialog-body"></div>`);
      _solidInsert(body, () => props.children);

      return [headerRegion, descriptionRegion, body];
    }
  }));

  // Change-guarded data attributes on the dialog root, like the compiled
  // effect(): an unchanged value never re-touches the attribute.
  let prevFit;
  let prevSize;
  let prevTransition;
  createRenderEffect(() => {
    const fit = props.fit ? true : undefined;
    const size = props.size || "normal";
    const transition = props.transition ? true : undefined;
    if (fit !== prevFit) setAttr(root, "data-fit", prevFit = fit);
    if (size !== prevSize) setAttr(root, "data-size", prevSize = size);
    if (transition !== prevTransition) setAttr(root, "data-transition", prevTransition = transition);
  });
  return root;
}
