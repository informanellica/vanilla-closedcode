import { insert } from "solid-js/web";
import { createComponent, createRenderEffect, createRoot, getOwner, onCleanup, runWithOwner, splitProps } from "solid-js";
import { createStore } from "solid-js/store";
import { autoPosition } from "./floating.js";

// Apply a Solid-style classList ({ "a b": true, c: false }) onto an element.
function applyClassList(el, classList) {
  if (!classList) return;
  for (const cls in classList) {
    if (!cls) continue;
    const tokens = cls.split(/\s+/).filter(Boolean);
    if (!tokens.length) continue;
    if (classList[cls]) el.classList.add(...tokens);
    else el.classList.remove(...tokens);
  }
}

export function HoverCard(props) {
  const owner = getOwner();
  const [local, rest] = splitProps(props, [
    "trigger", "mount", "class", "classList", "children",
    "open", "defaultOpen", "openDelay", "closeDelay", "placement", "gutter", "shift", "onOpenChange"
  ]);
  const [state, setState] = createStore({
    contentRef: undefined,
    uncontrolledOpen: local.defaultOpen ?? false
  });

  const controlled = () => local.open !== undefined;
  const opened = () => (controlled() ? local.open ?? false : state.uncontrolledOpen);
  const onOpenChange = (next) => {
    if (local.onOpenChange) local.onOpenChange(next);
    if (controlled()) return;
    setState("uncontrolledOpen", next);
  };

  let openTimer = 0;
  let closeTimer = 0;
  const requestOpen = () => {
    clearTimeout(closeTimer);
    closeTimer = 0;
    const delay = local.openDelay ?? 700;
    if (delay <= 0) {
      onOpenChange(true);
      return;
    }
    if (openTimer) return;
    openTimer = setTimeout(() => {
      openTimer = 0;
      onOpenChange(true);
    }, delay);
  };
  const requestClose = () => {
    clearTimeout(openTimer);
    openTimer = 0;
    const delay = local.closeDelay ?? 300;
    if (delay <= 0) {
      onOpenChange(false);
      return;
    }
    if (closeTimer) return;
    closeTimer = setTimeout(() => {
      closeTimer = 0;
      onOpenChange(false);
    }, delay);
  };

  // ----- Trigger -----
  const triggerEl = document.createElement("div");
  triggerEl.setAttribute("data-slot", "hover-card-trigger");
  triggerEl.tabIndex = -1;
  triggerEl.addEventListener("pointerenter", requestOpen);
  triggerEl.addEventListener("pointerleave", requestClose);
  triggerEl.addEventListener("focusin", requestOpen);
  triggerEl.addEventListener("focusout", requestClose);
  const trigger = local.trigger;
  if (trigger instanceof Node) triggerEl.appendChild(trigger);
  else if (typeof trigger === "string") triggerEl.textContent = trigger;
  else if (trigger != null) insert(triggerEl, () => local.trigger);

  // ----- Content -----
  const buildContent = () => {
    const contentEl = document.createElement("div");
    contentEl.setAttribute("data-component", "hover-card-content");
    contentEl.style.position = "fixed";
    if (local.class) contentEl.classList.add(...String(local.class).split(/\s+/).filter(Boolean));
    createRenderEffect(() => applyClassList(contentEl, local.classList));
    // Keep the card open while the pointer is over it (matches the original
    // safe-area / hover-bridge behavior at a basic level).
    contentEl.addEventListener("pointerenter", () => {
      clearTimeout(closeTimer);
      closeTimer = 0;
    });
    contentEl.addEventListener("pointerleave", requestClose);
    const body = document.createElement("div");
    body.setAttribute("data-slot", "hover-card-body");
    insert(body, () => local.children);
    contentEl.appendChild(body);
    return contentEl;
  };

  // ----- Presence -----
  let stopPosition = null;
  let disposeContent = null;
  const mountTarget = () => local.mount ?? document.body;
  const mountContent = () => {
    if (state.contentRef) return;
    const build = () => createRoot((dispose) => {
      const contentEl = buildContent();
      setState("contentRef", contentEl);
      mountTarget().appendChild(contentEl);
      stopPosition = autoPosition(triggerEl, contentEl, {
        placement: local.placement ?? "bottom",
        gutter: local.gutter ?? 4,
        shift: local.shift
      });
      disposeContent = dispose;
    });
    if (owner) runWithOwner(owner, build);
    else build();
  };
  const unmountContent = () => {
    if (stopPosition) {
      stopPosition();
      stopPosition = null;
    }
    const el = state.contentRef;
    setState("contentRef", undefined);
    if (disposeContent) {
      disposeContent();
      disposeContent = null;
    }
    if (el) el.remove();
  };

  createRenderEffect(() => {
    if (opened()) mountContent();
    else unmountContent();
  });

  if (owner) {
    onCleanup(() => {
      clearTimeout(openTimer);
      clearTimeout(closeTimer);
      unmountContent();
    });
  }

  return triggerEl;
}
