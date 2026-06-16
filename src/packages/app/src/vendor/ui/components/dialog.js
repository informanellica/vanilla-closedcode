/** @file Vanilla Dialog content panel: a modal dialog body (header/title/close, description, body) with focus trap, scroll lock, and auto-focus, reimplemented without a third-party UI dependency. */
// Vanilla reimplementation of @kobalte/core's Dialog behavior (no external UI
// dependency). Derivative of @kobalte/core (MIT License,
// Copyright (c) 2024 jer3m01 <jer3m01@jer3m01.com>). See THIRD-PARTY-NOTICES.md.
import { insert } from "../../../lib/reactivity.js";
import { createMemo, createRenderEffect, onCleanup, onMount } from "../../../lib/reactivity.js";
import { useI18n } from "../context/i18n.js";
import { IconButton } from "./icon-button.js";

/**
 * Builds a detached element from a compact HTML string.
 * @param {string} html - HTML markup for a single root element.
 * @returns {Element} The first element child of the parsed markup.
 */
// Build a detached element from compact HTML (no inter-element whitespace,
// matching the compiled Solid templates).
function template(html) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;
  return wrapper.firstElementChild;
}

/**
 * Sets or removes an attribute, removing it when the value is nullish.
 * @param {Element} el - Target element.
 * @param {string} name - Attribute name.
 * @param {*} value - Attribute value; null/undefined removes the attribute.
 * @returns {void}
 */
// Mirror solid-js/web setAttribute semantics: nullish removes the attribute.
function setAttr(el, name, value) {
  if (value == null) el.removeAttribute(name);
  else el.setAttribute(name, value);
}

/**
 * Requests that the enclosing dialog stack close this panel by dispatching an
 * Escape keydown on window (the stack listens for it to close the active node).
 * @returns {void}
 */
// The vendor Dialog/ImagePreview are content panels shown inside the dialog
// stack (DialogProvider in @/lib/dialog.js). That provider owns the modal
// shell — Escape-to-close (capture-phase keydown listener on window) and the
// presence-gated mount/unmount of the active node. So the close button mirrors
// @/bs/dialog.js's requestClose: re-emit an Escape keydown on window, which the
// stack already listens for, instead of needing an upstream Dialog root context.
function requestClose() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })
  );
}

// Selector for tabbable elements, used by the focus trap (mirrors the focus
// scope the original Dialog.Content set up around this panel).
const FOCUSABLE =
  'a[href],area[href],input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),button:not([disabled]),iframe,object,embed,[tabindex]:not([tabindex="-1"]),[contenteditable]:not([contenteditable="false"])';

/**
 * Returns the visible, tabbable elements within a root.
 * @param {Element} root - Container to search within.
 * @returns {Array} The focusable, on-screen, non-hidden elements.
 */
function focusableWithin(root) {
  return Array.from(root.querySelectorAll(FOCUSABLE)).filter(
    el => el instanceof HTMLElement && el.offsetParent !== null && !el.hasAttribute("data-hidden")
  );
}

/**
 * Moves initial focus into the panel: to an [autofocus] element if present,
 * otherwise to the content element itself.
 * @param {HTMLElement} content - The dialog content element.
 * @returns {void}
 */
// Move initial focus into the panel: an [autofocus] element if present (the
// onOpenAutoFocus behavior the original version reproduced), otherwise the
// content element itself.
function autoFocus(content) {
  const autofocusEl = content.querySelector("[autofocus]");
  if (autofocusEl instanceof HTMLElement) {
    autofocusEl.focus();
    return;
  }
  content.focus();
}

/**
 * Installs a modal focus trap that cycles Tab/Shift+Tab within the panel while
 * mounted and restores focus to the previously-focused element on cleanup.
 * @param {HTMLElement} content - The dialog content element to trap focus within.
 * @returns {void}
 */
// Keep Tab focus cycling inside the panel while it is mounted (modal focus
// trap), restoring focus to the previously-focused element on unmount.
function installFocusTrap(content) {
  const previouslyFocused = document.activeElement;
  const onKeyDown = event => {
    if (event.key !== "Tab") return;
    const items = focusableWithin(content);
    if (items.length === 0) {
      event.preventDefault();
      content.focus();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const activeEl = document.activeElement;
    if (event.shiftKey) {
      if (activeEl === first || !content.contains(activeEl)) {
        event.preventDefault();
        last.focus();
      }
    } else if (activeEl === last || !content.contains(activeEl)) {
      event.preventDefault();
      first.focus();
    }
  };
  content.addEventListener("keydown", onKeyDown);
  onCleanup(() => {
    content.removeEventListener("keydown", onKeyDown);
    if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
  });
}

/**
 * Locks body scroll while the panel is mounted, restoring the prior overflow on cleanup.
 * @returns {void}
 */
// Lock body scroll while the panel is mounted (the preventScroll behavior the
// original version provided), restoring the prior overflow on unmount.
function installScrollLock() {
  if (typeof document === "undefined") return;
  const body = document.body;
  const prevOverflow = body.style.overflow;
  body.style.overflow = "hidden";
  onCleanup(() => {
    body.style.overflow = prevOverflow;
  });
}

/**
 * Dialog component. Renders a modal dialog content panel with an optional header
 * (title plus a default close button or a caller-supplied action), an optional
 * description, and a body holding the children. Installs scroll lock, a focus
 * trap, and auto-focus while mounted; size/fit/transition map to data attributes.
 * @param {Object} props - Component props.
 * @param {*} props.title - Optional dialog title content.
 * @param {*} props.action - Optional header action that replaces the default close button.
 * @param {*} props.description - Optional dialog description content.
 * @param {*} props.children - Dialog body content.
 * @param {boolean} props.fit - When true, sizes the dialog to its content (data-fit).
 * @param {string} props.size - Size variant (data-size); defaults to "normal".
 * @param {boolean} props.transition - When true, enables the dialog transition (data-transition).
 * @param {*} props.class - Class string(s) merged onto the content element.
 * @param {Object} props.classList - Solid-style class toggle map.
 * @returns {HTMLElement} The dialog root element.
 */
export function Dialog(props) {
  const i18n = useI18n();
  const root = template(`<div data-component="dialog"><div data-slot="dialog-container"></div></div>`);
  const container = root.querySelector('[data-slot="dialog-container"]');

  const content = template(`<div data-slot="dialog-content" tabindex="-1"></div>`);
  content.setAttribute("role", "dialog");
  content.setAttribute("aria-modal", "true");

  // data-no-header mirrors the original getter: present (empty string) only
  // when there is neither a title nor an action.
  createRenderEffect(() => {
    const noHeader = !props.title && !props.action ? "" : undefined;
    setAttr(content, "data-no-header", noHeader);
  });

  // classList: merge props.classList with props.class, change-guarded so an
  // unchanged class is never re-toggled.
  const prevClassList = new Set();
  createRenderEffect(() => {
    const next = { ...props.classList, [props.class ?? ""]: !!props.class };
    const desired = new Set();
    for (const key in next) {
      if (!key || !next[key]) continue;
      for (const token of key.split(/\s+/).filter(Boolean)) desired.add(token);
    }
    for (const token of prevClassList) {
      if (!desired.has(token)) content.classList.remove(token);
    }
    for (const token of desired) {
      if (!prevClassList.has(token)) content.classList.add(token);
    }
    prevClassList.clear();
    for (const token of desired) prevClassList.add(token);
  });

  // Header region. Show(title || action), non-keyed: the header is rebuilt
  // only when the condition's truthiness flips, not on every title/action
  // change. The title text and action stay live via insert().
  const hasHeader = createMemo(() => !!(props.title || props.action));
  insert(content, createMemo(() => {
    if (!hasHeader()) return undefined;
    const header = template(`<div data-slot="dialog-header"></div>`);

    // Show(title): mount the title only while a title exists; the text itself
    // stays live through the accessor.
    const hasTitle = createMemo(() => !!props.title);
    insert(header, createMemo(() => {
      if (!hasTitle()) return undefined;
      const titleEl = template(`<div data-slot="dialog-title"></div>`);
      content.setAttribute("aria-labelledby", (titleEl.id ||= `dialog-title-${Math.random().toString(36).slice(2)}`));
      insert(titleEl, () => props.title);
      onCleanup(() => content.removeAttribute("aria-labelledby"));
      return titleEl;
    }), null);

    // Switch/Match: a caller-provided action replaces the default close button.
    // The truthiness memo keeps falsy-to-falsy action changes from rebuilding
    // the close button.
    const hasAction = createMemo(() => !!props.action);
    insert(header, createMemo(() => hasAction()
      ? props.action
      : IconButton({
        "data-slot": "dialog-close-button",
        icon: "close",
        variant: "ghost",
        "aria-label": i18n.t("ui.common.close"),
        onClick: requestClose
      })), null);
    return header;
  }), null);

  // Show(description).
  const hasDescription = createMemo(() => !!props.description);
  insert(content, createMemo(() => {
    if (!hasDescription()) return undefined;
    const descriptionEl = template(`<div data-slot="dialog-description"></div>`);
    descriptionEl.style.marginLeft = "-4px";
    content.setAttribute("aria-describedby", (descriptionEl.id ||= `dialog-desc-${Math.random().toString(36).slice(2)}`));
    insert(descriptionEl, () => props.description);
    onCleanup(() => content.removeAttribute("aria-describedby"));
    return descriptionEl;
  }), null);

  const body = template(`<div data-slot="dialog-body"></div>`);
  insert(body, () => props.children);
  content.appendChild(body);

  container.appendChild(content);

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

  // Modal shell behavior the original Dialog.Content used to provide: lock body
  // scroll, trap + auto-focus, restore focus on unmount. The stack mounts/
  // unmounts this node, so onMount/onCleanup bracket the panel's lifetime.
  installScrollLock();
  installFocusTrap(content);
  onMount(() => autoFocus(content));

  return root;
}
