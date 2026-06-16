/** @file Hover/focus tooltip component and a keybind-labelled variant (vanilla reimplementation). */

import { insert, onCleanup } from "../lib/reactivity.js";

/**
 * Builds the inline CSS positioning the tooltip popover relative to its trigger.
 * @param {string} placement - One of "top", "bottom", "left", "right",
 *   "top-start", "bottom-start". Unknown values fall back to "top".
 * @returns {string} A CSS text string for the popover's `style` attribute.
 */
const placementStyle = (placement) => {
  switch (placement) {
    case "bottom":
      return "position:absolute;top:100%;left:50%;transform:translateX(-50%);margin-top:4px;";
    case "left":
      return "position:absolute;right:100%;top:50%;transform:translateY(-50%);margin-right:4px;";
    case "right":
      return "position:absolute;left:100%;top:50%;transform:translateY(-50%);margin-left:4px;";
    // *-start variants are left-aligned (no centering translate) so a tooltip on
    // a trigger near the viewport's left edge extends rightward instead of
    // overflowing left and being clipped by an ancestor's overflow.
    case "top-start":
      return "position:absolute;bottom:100%;left:0;margin-bottom:4px;";
    case "bottom-start":
      return "position:absolute;top:100%;left:0;margin-top:4px;";
    case "top":
    default:
      return "position:absolute;bottom:100%;left:50%;transform:translateX(-50%);margin-bottom:4px;";
  }
};

/**
 * Wraps its children in a trigger element that shows a tooltip popover on
 * hover/focus. The popover is created lazily and removed when closed; it also
 * closes on any ancestor scroll.
 * @param {Object} props - Component props. Recognized keys: `children`
 *   (trigger content; string, Node, function, or array), `value` (tooltip
 *   content; string or Node), `placement` (see placementStyle; default "top"),
 *   `forceOpen` (boolean; keeps the tooltip permanently shown), `inactive`
 *   (boolean; returns children unwrapped with no tooltip), `class` (CSS classes
 *   on the trigger), `contentClass` (CSS classes on the popover), and
 *   `contentStyle` (extra inline style appended to the popover).
 * @returns {*} The trigger element, or the raw `children` when `inactive`.
 */
export function Tooltip(props) {
  const inert = { open: false };
  const id = "tooltip-" + Math.random().toString(36).slice(2);
  let popEl = null;

  const isOpen = () => !!props.forceOpen || inert.open;
  const syncPopover = () => {
    if (isOpen()) {
      if (!popEl) {
        popEl = renderContent();
        if (popEl) {
          triggerEl.appendChild(popEl);
        }
      }
      triggerEl.setAttribute("aria-describedby", id);
    } else {
      triggerEl.removeAttribute("aria-describedby");
      if (popEl) {
        popEl.remove();
        popEl = null;
      }
    }
  };
  // pointerleave does NOT fire when the trigger scrolls out from under a
  // stationary pointer (browser behavior), so inside a scrolling pane (e.g. the
  // chat) a hover-opened tooltip would linger and float over the content. Close
  // it on any scroll. Capture phase on window catches scrolls in any ancestor
  // (scroll events don't bubble).
  let scrollHandler = null;
  const armScrollClose = () => {
    if (scrollHandler || props.forceOpen) return;
    scrollHandler = () => close();
    window.addEventListener("scroll", scrollHandler, true);
  };
  const disarmScrollClose = () => {
    if (!scrollHandler) return;
    window.removeEventListener("scroll", scrollHandler, true);
    scrollHandler = null;
  };
  const open = () => {
    inert.open = true;
    syncPopover();
    armScrollClose();
  };
  const close = () => {
    inert.open = false;
    syncPopover();
    disarmScrollClose();
  };
  // Detaching the trigger while open would otherwise leak the window listener.
  onCleanup(disarmScrollClose);

  if (props.inactive) {
    return props.children;
  }

  const triggerEl = document.createElement("div");
  triggerEl.setAttribute("data-component", "tooltip-trigger");
  triggerEl.style.position = "relative";
  triggerEl.style.display = "contents";
  if (props.class) {
    triggerEl.className = props.class;
  }
  triggerEl.addEventListener("pointerenter", open);
  triggerEl.addEventListener("pointerleave", close);
  triggerEl.addEventListener("focusin", open);
  triggerEl.addEventListener("focusout", close);

  const renderContent = () => {
    if (!isOpen()) return null;
    const popEl = document.createElement("div");
    popEl.setAttribute("data-component", "tooltip");
    popEl.setAttribute("role", "tooltip");
    popEl.id = id;
    popEl.setAttribute("data-placement", props.placement ?? "top");
    popEl.setAttribute("data-force-open", props.forceOpen ? "true" : "false");

    if (props.contentClass) {
      popEl.classList.add(...props.contentClass.split(/\s+/).filter(Boolean));
    }
    popEl.setAttribute(
      "style",
      placementStyle(props.placement) +
        "z-index:1080;width:max-content;max-width:320px;pointer-events:none;" +
        (props.contentStyle ?? ""),
    );

    if (typeof props.value === "string") {
      popEl.textContent = props.value;
    } else if (props.value instanceof Node) {
      popEl.appendChild(props.value.cloneNode(true));
    }

    return popEl;
  };

  if (typeof props.children === "string") {
    triggerEl.textContent = props.children;
  } else if (props.children instanceof Node) {
    // Do NOT cloneNode: cloning drops addEventListener handlers, which made
    // buttons wrapped in tooltips (e.g. the model-popover "+" button) dead.
    triggerEl.appendChild(props.children);
  } else if (typeof props.children === "function" || Array.isArray(props.children)) {
    // Component/accessor children (e.g. the model-selector popover trigger):
    // there was no branch for these, so the child silently vanished. Let
    // solid-js/web insert() render and track them.
    insert(triggerEl, props.children);
  }

  syncPopover();

  return triggerEl;
}

/**
 * A Tooltip whose content is a title text plus a styled keybind badge. Forwards
 * all other props to {@link Tooltip}.
 * @param {Object} props - Component props. Recognized keys: `title` (tooltip
 *   text; string or Node), `keybind` (shortcut label rendered in a badge;
 *   string or Node), plus any prop accepted by {@link Tooltip} (e.g.
 *   `children`, `placement`, `forceOpen`).
 * @returns {*} The Tooltip element produced with the composed content.
 */
export function TooltipKeybind(props) {
  const container = document.createElement("span");
  container.setAttribute("data-slot", "tooltip-keybind");

  const titleSpan = document.createElement("span");
  if (typeof props.title === "string") {
    titleSpan.textContent = props.title;
  } else if (props.title instanceof Node) {
    titleSpan.appendChild(props.title.cloneNode(true));
  }
  container.appendChild(titleSpan);

  const keybindSpan = document.createElement("span");
  keybindSpan.setAttribute(
    "class",
    "badge text-bg-secondary rounded ms-2",
  );
  keybindSpan.setAttribute("data-slot", "tooltip-keybind-key");
  if (typeof props.keybind === "string") {
    keybindSpan.textContent = props.keybind;
  } else if (props.keybind instanceof Node) {
    keybindSpan.appendChild(props.keybind.cloneNode(true));
  }
  container.appendChild(keybindSpan);

  return Tooltip({
    ...props,
    value: container,
  });
}
