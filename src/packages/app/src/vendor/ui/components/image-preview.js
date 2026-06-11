import { insert as _solidInsert } from "solid-js/web";
import { createComponent, createRenderEffect } from "solid-js";
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

export function ImagePreview(props) {
  const i18n = useI18n();
  const root = template(`<div data-component="image-preview"><div data-slot="image-preview-container"></div></div>`);
  const container = root.querySelector('[data-slot="image-preview-container"]');

  // Kobalte Dialog.Content is presence-gated (its result is a reactive
  // accessor that only resolves while the dialog is open), so it must go
  // through solid's insert() to stay live; a one-shot appendChild would
  // freeze it.
  _solidInsert(container, createComponent(Kobalte.Content, {
    "data-slot": "image-preview-content",
    get children() {
      const header = template(`<div data-slot="image-preview-header"></div>`);
      _solidInsert(header, createComponent(Kobalte.CloseButton, {
        "data-slot": "image-preview-close",
        as: IconButton,
        icon: "close",
        variant: "ghost",
        get ["aria-label"]() {
          return i18n.t("ui.common.close");
        }
      }));
      const body = template(`<div data-slot="image-preview-body"><img data-slot="image-preview-image"></div>`);
      const img = body.querySelector('[data-slot="image-preview-image"]');
      // Change-guarded like the compiled effect, so e.g. an unchanged src
      // never re-triggers the image loading algorithm. The alt fallback reads
      // i18n.t inside the effect so it follows live language switches.
      let prevSrc;
      let prevAlt;
      createRenderEffect(() => {
        const src = props.src;
        const alt = props.alt ?? i18n.t("ui.imagePreview.alt");
        if (src !== prevSrc) setAttr(img, "src", prevSrc = src);
        if (alt !== prevAlt) setAttr(img, "alt", prevAlt = alt);
      });
      return [header, body];
    }
  }));
  return root;
}
