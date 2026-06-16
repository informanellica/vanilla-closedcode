// Vanilla reimplementation of an @kobalte/core Dialog-based image preview (no
// external UI dependency). Derivative of @kobalte/core (MIT License,
// Copyright (c) 2024 jer3m01 <jer3m01@jer3m01.com>). See THIRD-PARTY-NOTICES.md.
import { createRenderEffect, onCleanup, onMount } from "../../../lib/reactivity.js";
import { useI18n } from "../context/i18n.js";
import { IconButton } from "./icon-button.js";

/** @file Vanilla ImagePreview dialog component: shows an image with a close button inside the dialog stack. Derivative of @kobalte/core. */
// Build a detached element from compact HTML (no inter-element whitespace,
// matching the compiled Solid templates).
/**
 * Build a detached element from a compact HTML string and return its first child.
 *
 * @param {string} html - The HTML markup to parse.
 * @returns {Element} The first element parsed from the markup.
 */
function template(html) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;
  return wrapper.firstElementChild;
}

// Mirror solid-js/web setAttribute semantics: nullish removes the attribute.
/**
 * Set or remove an attribute on an element; a nullish value removes it.
 *
 * @param {Element} el - The target element.
 * @param {string} name - The attribute name.
 * @param {*} value - The attribute value; nullish removes the attribute.
 * @returns {void}
 */
function setAttr(el, name, value) {
  if (value == null) el.removeAttribute(name);
  else el.setAttribute(name, value);
}

// Like the dialog panel, the image preview is shown inside the dialog stack
// (DialogProvider in @/lib/dialog.js), which owns Escape-to-close. The close
// button re-emits an Escape keydown on window (mirroring @/bs/dialog.js's
// requestClose) so the stack tears the preview down.
/**
 * Request the dialog stack to close the preview by dispatching an Escape keydown
 * on window (the dialog stack owns Escape-to-close).
 *
 * @returns {void}
 */
function requestClose() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })
  );
}

/**
 * Render an image preview dialog: a modal container with a header (close button)
 * and an image whose src/alt track props reactively. The alt text falls back to
 * a live-translated i18n string, the panel is focused on mount, and focus is
 * restored on unmount.
 *
 * @param {Object} props - Component props.
 * @param {string} props.src - The image source URL.
 * @param {string} props.alt - Alt text for the image; defaults to a localized string.
 * @returns {HTMLDivElement} The preview root element.
 */
export function ImagePreview(props) {
  const i18n = useI18n();
  const root = template(`<div data-component="image-preview"><div data-slot="image-preview-container"></div></div>`);
  const container = root.querySelector('[data-slot="image-preview-container"]');

  const content = template(`<div data-slot="image-preview-content" tabindex="-1"></div>`);
  content.setAttribute("role", "dialog");
  content.setAttribute("aria-modal", "true");

  const header = template(`<div data-slot="image-preview-header"></div>`);
  // The alt fallback reads i18n.t live so it follows language switches; reuse it
  // for the close button's aria-label too (was the original CloseButton's children).
  const closeBtn = IconButton({
    "data-slot": "image-preview-close",
    icon: "close",
    variant: "ghost",
    "aria-label": i18n.t("ui.common.close"),
    onClick: requestClose
  });
  header.appendChild(closeBtn);

  const body = template(`<div data-slot="image-preview-body"><img data-slot="image-preview-image"></div>`);
  const img = body.querySelector('[data-slot="image-preview-image"]');

  // Change-guarded like the compiled effect, so e.g. an unchanged src never
  // re-triggers the image loading algorithm. The alt fallback reads i18n.t
  // inside the effect so it follows live language switches.
  let prevSrc;
  let prevAlt;
  createRenderEffect(() => {
    const src = props.src;
    const alt = props.alt ?? i18n.t("ui.imagePreview.alt");
    if (src !== prevSrc) setAttr(img, "src", prevSrc = src);
    if (alt !== prevAlt) setAttr(img, "alt", prevAlt = alt);
  });

  content.appendChild(header);
  content.appendChild(body);
  container.appendChild(content);

  // Focus the panel on mount, restore on unmount (matching the focus scope the
  // original Dialog.Content provided around the preview).
  const previouslyFocused = typeof document !== "undefined" ? document.activeElement : null;
  onMount(() => content.focus());
  onCleanup(() => {
    if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
  });

  return root;
}
