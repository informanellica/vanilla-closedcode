import { insert } from "solid-js/web";
import { createComponent, createRenderEffect, createRoot, createUniqueId, getOwner, mergeProps, onCleanup, runWithOwner, splitProps } from "solid-js";
import { createStore } from "solid-js/store";
import { autoPosition } from "./floating.js";

// Build a detached element from compact HTML (no inter-element whitespace,
// matching the compiled Solid templates). Built fresh per call: no cloneNode.
function template(html) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;
  return wrapper.firstElementChild;
}

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

export function Tooltip(props) {
  // The previously-rendered trigger element (Kobalte wrapped the children in a
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

  // Show with the open delay (Kobalte default 700ms unless overridden).
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
  // closeDelay is forced to 0, matching the Kobalte wrapper.
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

  // The wrapping trigger div (Kobalte rendered `as: "div"` with display:contents
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

  // Watch the trigger subtree for expand/collapse of inner controls (Kobalte
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
  };
  const unmountContent = () => {
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

  if (owner) {
    onCleanup(() => {
      clearTimers();
      obs.disconnect();
      unmountContent();
    });
  }

  return triggerEl;
}
