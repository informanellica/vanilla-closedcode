/** @file Vanilla (dependency-free) reimplementation of @kobalte/core's Tooltip: a hover/focus-triggered tooltip that portals its content to <body> and keeps it positioned against the trigger. */
// Vanilla reimplementation of @kobalte/core's Tooltip behavior (no external UI
// dependency). Derivative of @kobalte/core (MIT License,
// Copyright (c) 2024 jer3m01 <jer3m01@jer3m01.com>). See THIRD-PARTY-NOTICES.md.
import { insert } from "../../../lib/reactivity.js";
import { createComponent, createRenderEffect, createRoot, createUniqueId, getOwner, mergeProps, onCleanup, runWithOwner, splitProps } from "../../../lib/reactivity.js";
import { createStore } from "../../../lib/store.js";
import { autoPosition } from "./floating.js";

/**
 * Build a detached element from a compact HTML string (no inter-element
 * whitespace, matching the compiled Solid templates). A fresh element is built
 * per call; no cloneNode is used.
 * @param {string} html - HTML markup whose first element is returned.
 * @returns {Element} The first element parsed from the HTML.
 */
function template(html) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;
  return wrapper.firstElementChild;
}

/**
 * Tooltip whose content is a title paired with a keyboard-shortcut chip; a thin
 * wrapper over Tooltip that renders the title/keybind reactively into the
 * tooltip body.
 * @param {Object} props - Component props (extra props pass through to Tooltip).
 * @param {*} props.title - The tooltip title content (string, Node, or accessor).
 * @param {*} props.keybind - The keybinding content rendered as a chip.
 * @returns {HTMLElement} The Tooltip trigger element.
 */
export function TooltipKeybind(props) {
  const [local, others] = splitProps(props, ["title", "keybind"]);
  return createComponent(Tooltip, mergeProps(others, {
    get value() {
      // Fresh nodes per read, like the compiled template factory: the getter
      // runs again whenever the tooltip content remounts.
      const root = template(`<div data-slot="tooltip-keybind"><span></span><span data-slot="tooltip-keybind-key"></span></div>`);
      const titleEl = root.firstElementChild;
      const keybindEl = titleEl.nextElementSibling;
      // title/keybind are arbitrary (possibly reactive) children rendered
      // inside the tooltip content, so they go through solid's insert() to
      // stay live (established exception).
      insert(titleEl, () => local.title);
      insert(keybindEl, () => local.keybind);
      return root;
    }
  }));
}

/**
 * Hover/focus-triggered tooltip. Wraps `children` in a trigger element and, while
 * open, portals a positioned content node (its `value`) to `<body>`. Handles open
 * and close delays, suppression while an inner control is expanded, scroll-close,
 * and disconnect cleanup so portaled content never orphans. When `inactive` is set,
 * the children are returned verbatim with no tooltip machinery.
 * @param {Object} props - Component props (unlisted props pass through).
 * @param {*} props.children - The trigger content (string, Node, or accessor).
 * @param {string} props.class - CSS class applied to the trigger wrapper.
 * @param {string} props.contentClass - CSS class(es) applied to the floating content node.
 * @param {*} props.contentStyle - Inline style (string or object) applied to the content node.
 * @param {boolean} props.inactive - When true, render children with no tooltip behavior.
 * @param {boolean} props.forceOpen - Keep the tooltip permanently open (ignores hover/scroll close).
 * @param {boolean} props.ignoreSafeArea - Forwarded positioning flag.
 * @param {*} props.value - The tooltip content (string, Node, or reactive accessor).
 * @param {string} props.placement - Preferred placement (e.g. "top") for autoPosition.
 * @param {number} props.gutter - Gap in pixels between trigger and content (default 4).
 * @param {*} props.shift - Shift option forwarded to autoPosition.
 * @param {*} props.overlap - Overlap option forwarded to autoPosition.
 * @param {number} props.openDelay - Delay in ms before opening on hover/focus (default 700).
 * @param {number} props.closeDelay - Close delay (forced to 0 to match the original wrapper).
 * @returns {*} The trigger element, or the raw children when `inactive`.
 */
export function Tooltip(props) {
  // The previously-rendered trigger element (the original wrapped the children in a
  // <div data-component="tooltip-trigger">). Captured for hover/focus + the
  // expand/block heuristics below.
  let triggerEl;
  // Owner captured at construction so deferred work (timers, the portal render)
  // runs inside the caller's reactive scope even when fired from a DOM event
  // handler where Solid's owner is null.
  const owner = getOwner();
  const id = createUniqueId();
  const [state, setState] = createStore({
    open: false,
    block: false,
    expand: false
  });
  const [local, others] = splitProps(props, [
    "children", "class", "contentClass", "contentStyle", "inactive", "forceOpen",
    "ignoreSafeArea", "value", "placement", "gutter", "shift", "overlap", "openDelay", "closeDelay"
  ]);

  // Inactive passthrough: render the children verbatim, no tooltip machinery.
  if (local.inactive) {
    return local.children;
  }

  const isOpen = () => !!local.forceOpen || state.open;
  let openTimer = 0;
  let closeTimer = 0;
  const clearTimers = () => {
    clearTimeout(openTimer);
    clearTimeout(closeTimer);
    openTimer = 0;
    closeTimer = 0;
  };

  const close = () => setState("open", false);
  const inside = () => {
    const active = document.activeElement;
    if (!triggerEl || !active) return false;
    return triggerEl.contains(active);
  };
  // The trigger may itself wrap an expandable control (e.g. a popover trigger):
  // while that child is expanded we suppress the tooltip so it doesn't sit on
  // top of the opened panel.
  /**
   * Release the tooltip's "blocked" state, unless the trigger is still hovered,
   * focused within, or wraps an expanded control.
   * @param {boolean} expand - Whether an inner control is currently expanded (defaults to the tracked expand state).
   * @returns {void}
   */
  const drop = (expand = state.expand) => {
    if (expand) return;
    if (triggerEl?.matches(":hover")) return;
    if (inside()) return;
    setState("block", false);
  };
  const sync = () => {
    const expand = !!triggerEl?.querySelector('[aria-expanded="true"], [data-expanded]');
    setState("expand", expand);
    if (expand) {
      setState("block", true);
      close();
      return;
    }
    drop(expand);
  };
  const arm = () => {
    setState("block", true);
    close();
  };

  // Show with the open delay (original default 700ms unless overridden).
  /**
   * Schedule the tooltip to open after the configured open delay, unless it is
   * blocked or forced open. A zero/negative delay opens immediately.
   * @returns {void}
   */
  const requestOpen = () => {
    if (local.forceOpen) return;
    if (state.block) return;
    clearTimeout(closeTimer);
    closeTimer = 0;
    const delay = local.openDelay ?? 700;
    if (delay <= 0) {
      setState("open", true);
      return;
    }
    if (openTimer) return;
    openTimer = setTimeout(() => {
      openTimer = 0;
      if (!state.block) setState("open", true);
    }, delay);
  };
  // closeDelay is forced to 0, matching the original wrapper.
  const requestClose = () => {
    clearTimeout(openTimer);
    openTimer = 0;
    if (!inside()) close();
    drop();
  };
  const leave = () => {
    if (!inside()) close();
    drop();
  };

  // The wrapping trigger div (the original rendered `as: "div"` with display:contents
  // semantics via class). data-component preserved for styling/test hooks.
  triggerEl = document.createElement("div");
  triggerEl.setAttribute("data-component", "tooltip-trigger");
  createRenderEffect(() => {
    const cls = local.class;
    triggerEl.className = cls == null ? "" : String(cls);
  });

  triggerEl.addEventListener("pointerenter", requestOpen);
  triggerEl.addEventListener("pointerleave", leave);
  triggerEl.addEventListener("focusin", requestOpen);
  triggerEl.addEventListener("pointerdown", arm, true);
  triggerEl.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    arm();
  }, true);
  triggerEl.addEventListener("focusout", () => requestAnimationFrame(() => requestClose()));

  // Children: mirror bs/tooltip — strings/Nodes appended directly (no
  // cloneNode, which would drop listeners), component/accessor children go
  // through insert() so they stay reactive.
  const children = local.children;
  if (typeof children === "string") {
    triggerEl.textContent = children;
  } else if (children instanceof Node) {
    triggerEl.appendChild(children);
  } else if (children != null) {
    insert(triggerEl, () => local.children);
  }

  // Watch the trigger subtree for expand/collapse of inner controls (the original
  // relied on its own state; we observe the DOM the way the old wrapper did).
  const obs = new MutationObserver(sync);
  obs.observe(triggerEl, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["aria-expanded", "data-expanded"]
  });
  sync();

  // Build the floating tooltip content node (portaled to <body>).
  /**
   * Build the floating tooltip content node (fixed-positioned, portaled to
   * `<body>`), applying placement, optional content class/style, and inserting
   * the reactive `value` so it stays live.
   * @returns {HTMLElement} The tooltip content `<div>` element.
   */
  const renderContent = () => {
    const popEl = document.createElement("div");
    popEl.setAttribute("data-component", "tooltip");
    popEl.setAttribute("role", "tooltip");
    popEl.id = id;
    popEl.setAttribute("data-placement", local.placement ?? "top");
    if (local.forceOpen) popEl.setAttribute("data-force-open", "true");
    if (local.contentClass) {
      popEl.classList.add(...String(local.contentClass).split(/\s+/).filter(Boolean));
    }
    popEl.style.position = "fixed";
    popEl.style.zIndex = "1080";
    popEl.style.width = "max-content";
    popEl.style.maxWidth = "320px";
    popEl.style.pointerEvents = "none";
    if (local.contentStyle && typeof local.contentStyle === "string") {
      popEl.setAttribute("style", popEl.getAttribute("style") + local.contentStyle);
    } else if (local.contentStyle && typeof local.contentStyle === "object") {
      for (const key in local.contentStyle) popEl.style[key] = local.contentStyle[key];
    }
    // `value` may be a reactive/component child — keep it live through insert().
    insert(popEl, () => local.value);
    return popEl;
  };

  // Presence: mount the content into <body> only while open, and keep it
  // positioned against the trigger (placement + gutter + flip), mirroring the
  // bs/dropdown-menu floating technique via the shared helper. Each mount gets
  // its own reactive root (disposed on close) so the value getter's render
  // effects don't leak across open/close cycles.
  let stopPosition = null;
  let disposeContent = null;
  let contentEl = null;
  // pointerleave does NOT fire when the trigger scrolls out from under a
  // stationary pointer, so a hover-opened tooltip lingers and floats over the
  // scrolling content (e.g. the chat message copy/revert tooltips). Close on any
  // scroll; capture phase on window catches scrolls in any ancestor pane.
  let onScrollClose = null;
  // Backstop observer: while the content is portaled to <body>, the only thing
  // tying it to the trigger is this code. If the trigger is removed from the
  // document by an ancestor re-render (a list row swapped, a panel torn down)
  // rather than by our owner disposing, no pointerleave/onCleanup fires and the
  // portaled node would orphan in <body> — accumulating one stuck tooltip per
  // re-render. Watch for the trigger's disconnect and force an unmount. Only
  // active while mounted, so it costs nothing in the common (closed) case.
  const disconnectObs = new MutationObserver(() => {
    if (!triggerEl.isConnected) unmountContent();
  });
  /**
   * Mount the content node into `<body>` inside its own reactive root, start
   * positioning it against the trigger, and arm the scroll-close and trigger
   * disconnect observers. No-op if already mounted.
   * @returns {void}
   */
  const mountContent = () => {
    if (contentEl) return;
    const build = () => createRoot((dispose) => {
      contentEl = renderContent();
      document.body.appendChild(contentEl);
      stopPosition = autoPosition(triggerEl, contentEl, {
        placement: local.placement ?? "top",
        gutter: local.gutter ?? 4,
        shift: local.shift,
        overlap: local.overlap
      });
      disposeContent = dispose;
    });
    // Restore the caller's owner so context (i18n, etc.) read inside `value`
    // resolves, even when mountContent runs from a DOM event handler.
    if (owner) runWithOwner(owner, build);
    else build();
    disconnectObs.observe(document.body, { childList: true, subtree: true });
    if (!local.forceOpen && !onScrollClose) {
      onScrollClose = () => close();
      window.addEventListener("scroll", onScrollClose, true);
    }
  };
  const unmountContent = () => {
    if (onScrollClose) {
      window.removeEventListener("scroll", onScrollClose, true);
      onScrollClose = null;
    }
    disconnectObs.disconnect();
    if (stopPosition) {
      stopPosition();
      stopPosition = null;
    }
    if (disposeContent) {
      disposeContent();
      disposeContent = null;
    }
    if (contentEl) {
      contentEl.remove();
      contentEl = null;
    }
  };

  createRenderEffect(() => {
    if (isOpen()) {
      triggerEl.setAttribute("aria-describedby", id);
      mountContent();
    } else {
      triggerEl.removeAttribute("aria-describedby");
      unmountContent();
    }
  });

  // Always register cleanup (a no-op when there is no owner): unmountContent()
  // must run on disposal so the <body>-portaled content is removed. Gating this
  // on `owner` left the portaled node orphaned whenever the owner disposed while
  // the tooltip was open (the disconnect observer above is the further backstop
  // for trigger removals that don't go through owner disposal at all).
  onCleanup(() => {
    clearTimers();
    obs.disconnect();
    unmountContent();
  });

  return triggerEl;
}
