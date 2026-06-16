/** @file Vanilla ScrollView component: a scrollable viewport with a custom draggable scrollbar thumb, keyboard scroll navigation, and forwarded scroll/touch/pointer events. */
import { onMount, splitProps, mergeProps, createRenderEffect, createRoot, onCleanup } from "../../../lib/reactivity.js";
import { createResizeObserver } from "../../../lib/primitives/resize-observer.js";
import { createStore } from "../../../lib/store.js";
import { useI18n } from "../context/i18n.js";

/**
 * Map a keyboard event to a scroll intent, ignoring events with modifier keys.
 * @param {KeyboardEvent} event - The keydown event.
 * @returns {string} One of "page-down", "page-up", "home", "end", "up", "down", or undefined if no match.
 */
export const scrollKey = event => {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  switch (event.key) {
    case "PageDown":
      return "page-down";
    case "PageUp":
      return "page-up";
    case "Home":
      return "home";
    case "End":
      return "end";
    case "ArrowUp":
      return "up";
    case "ArrowDown":
      return "down";
  }
};

// Apply a Solid-style `style` prop (string or object) to an element, clearing
// any previously applied value first. Mirrors solid's web-renderer style handling.
/**
 * Apply a Solid-style `style` prop (string or object) to an element, clearing
 * any previously applied value first.
 * @param {HTMLElement} el - The element to mutate.
 * @param {(string|Object)} style - CSS text string, or a map of style properties (`--` custom props supported).
 * @returns {void}
 */
function applyStyle(el, style) {
  if (style == null) {
    el.removeAttribute("style");
    return;
  }
  if (typeof style === "string") {
    el.style.cssText = style;
    return;
  }
  el.removeAttribute("style");
  for (const key in style) {
    const value = style[key];
    if (value == null) continue;
    if (key.startsWith("--")) el.style.setProperty(key, String(value));
    else el.style[key] = value;
  }
}

/**
 * Scrollable viewport component with a custom scrollbar thumb. Renders children
 * inside a focusable viewport, computes and tracks a draggable thumb sized to
 * the scroll ratio (shown on hover/drag), supports keyboard scroll navigation
 * (Page/Home/End/Arrow), and forwards scroll/wheel/touch/pointer/click/keydown
 * events plus passthrough class/style/attributes to the root.
 * @param {Object} props - Component props.
 * @param {*} props.children - Content rendered inside the scrollable viewport.
 * @param {string} props.class - Additional CSS class names merged onto the root.
 * @param {(string|Object)} props.style - Inline style applied to the root.
 * @param {Function} props.viewportRef - Ref callback invoked with the viewport element on mount.
 * @param {string} props.orientation - Scroll orientation (defaults to "vertical").
 * @returns {HTMLElement} The scroll-view root element.
 */
export function ScrollView(props) {
  const i18n = useI18n();
  const merged = mergeProps({
    orientation: "vertical"
  }, props);
  const [local, events, rest] = splitProps(merged, ["class", "children", "viewportRef", "orientation", "style"], ["onScroll", "onWheel", "onTouchStart", "onTouchMove", "onTouchEnd", "onTouchCancel", "onPointerDown", "onClick", "onKeyDown"]);
  let rootRef;
  let viewportRef;
  let thumbRef;
  const [state, setState] = createStore({
    isHovered: false,
    isDragging: false,
    thumbHeight: 0,
    thumbTop: 0,
    showThumb: false
  });
  const isHovered = () => state.isHovered;
  const isDragging = () => state.isDragging;
  const thumbHeight = () => state.thumbHeight;
  const thumbTop = () => state.thumbTop;
  const showThumb = () => state.showThumb;
  const updateThumb = () => {
    if (!viewportRef) return;
    const {
      scrollTop,
      scrollHeight,
      clientHeight
    } = viewportRef;
    if (scrollHeight <= clientHeight || scrollHeight === 0) {
      setState("showThumb", false);
      return;
    }
    setState("showThumb", true);
    const trackPadding = 8;
    const trackHeight = clientHeight - trackPadding * 2;
    const minThumbHeight = 32;
    // Calculate raw thumb height based on ratio
    let height = clientHeight / scrollHeight * trackHeight;
    height = Math.max(height, minThumbHeight);
    const maxScrollTop = scrollHeight - clientHeight;
    const maxThumbTop = trackHeight - height;
    const top = maxScrollTop > 0 ? scrollTop / maxScrollTop * maxThumbTop : 0;

    // Ensure thumb stays within bounds (shouldn't be necessary due to math above, but good for safety)
    const boundedTop = trackPadding + Math.max(0, Math.min(top, maxThumbTop));
    setState("thumbHeight", height);
    setState("thumbTop", boundedTop);
  };
  onMount(() => {
    if (local.viewportRef) {
      local.viewportRef(viewportRef);
    }
    createResizeObserver([viewportRef, viewportRef.firstElementChild], updateThumb);
    updateThumb();
  });
  let startY = 0;
  let startScrollTop = 0;
  const onThumbPointerDown = e => {
    e.preventDefault();
    e.stopPropagation();
    setState("isDragging", true);
    startY = e.clientY;
    startScrollTop = viewportRef.scrollTop;
    thumbRef.setPointerCapture(e.pointerId);
    const onPointerMove = e => {
      const deltaY = e.clientY - startY;
      const {
        scrollHeight,
        clientHeight
      } = viewportRef;
      const maxScrollTop = scrollHeight - clientHeight;
      const maxThumbTop = clientHeight - thumbHeight();
      if (maxThumbTop > 0) {
        const scrollDelta = deltaY * (maxScrollTop / maxThumbTop);
        viewportRef.scrollTop = startScrollTop + scrollDelta;
      }
    };
    const onPointerUp = e => {
      setState("isDragging", false);
      thumbRef.releasePointerCapture(e.pointerId);
      thumbRef.removeEventListener("pointermove", onPointerMove);
      thumbRef.removeEventListener("pointerup", onPointerUp);
    };
    thumbRef.addEventListener("pointermove", onPointerMove);
    thumbRef.addEventListener("pointerup", onPointerUp);
  };

  // Keybinds implementation
  // We ensure the viewport has a tabindex so it can receive focus
  // We can also explicitly catch PageUp/Down if we want smooth scroll or specific behavior,
  // but native usually handles this perfectly. Let's explicitly ensure it behaves well.
  const onKeyDown = e => {
    // If user is focused on an input inside the scroll view, don't hijack keys
    if (document.activeElement && ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)) {
      return;
    }
    const next = scrollKey(e);
    if (!next) return;
    const scrollAmount = viewportRef.clientHeight * 0.8;
    const lineAmount = 40;
    switch (next) {
      case "page-down":
        e.preventDefault();
        viewportRef.scrollBy({
          top: scrollAmount,
          behavior: "smooth"
        });
        break;
      case "page-up":
        e.preventDefault();
        viewportRef.scrollBy({
          top: -scrollAmount,
          behavior: "smooth"
        });
        break;
      case "home":
        e.preventDefault();
        viewportRef.scrollTo({
          top: 0,
          behavior: "smooth"
        });
        break;
      case "end":
        e.preventDefault();
        viewportRef.scrollTo({
          top: viewportRef.scrollHeight,
          behavior: "smooth"
        });
        break;
      case "up":
        e.preventDefault();
        viewportRef.scrollBy({
          top: -lineAmount,
          behavior: "smooth"
        });
        break;
      case "down":
        e.preventDefault();
        viewportRef.scrollBy({
          top: lineAmount,
          behavior: "smooth"
        });
        break;
    }
  };

  // Static skeleton (compiled _tmpl$2):
  //   <div><div class=scroll-view__viewport tabindex=0 role=region></div></div>
  const root = document.createElement("div");
  const viewport = document.createElement("div");
  viewport.className = "scroll-view__viewport";
  viewport.setAttribute("tabindex", "0");
  viewport.setAttribute("role", "region");
  root.appendChild(viewport);

  // Hover tracking listeners attach once (these are direct addEventListener in
  // the compiled output, not delegated).
  root.addEventListener("pointerleave", () => setState("isHovered", false));
  root.addEventListener("pointerenter", () => setState("isHovered", true));

  // ref forwarding for rootRef (here rootRef is a local, so just assign it).
  rootRef = root;

  // Spread of mergeProps({ class, style }, rest) onto the root, skipChildren=true.
  // class/style come from getters so they stay live; `rest` are the remaining
  // passthrough props. Listeners in `rest` attach once; other attrs re-apply in
  // a render effect (mirroring the compiled spread()).
  for (const key in rest) {
    if (/^on[A-Z]/.test(key) && typeof rest[key] === "function") {
      root.addEventListener(key.slice(2).toLowerCase(), rest[key]);
    }
  }
  let prevClass;
  let prevStyleApplied;
  const prevRestAttrs = {};
  createRenderEffect(() => {
    // class: `scroll-view ${local.class || ""}` (trailing space preserved when
    // empty, exactly like the template literal in the compiled getter).
    const nextClass = `scroll-view ${local.class || ""}`;
    if (nextClass !== prevClass) {
      root.className = prevClass = nextClass;
    }
    // style getter (string or object).
    const nextStyle = local.style;
    if (nextStyle !== prevStyleApplied) {
      prevStyleApplied = nextStyle;
      applyStyle(root, nextStyle);
    }
    // Remaining passthrough attributes (non-event), re-applied reactively.
    for (const key in rest) {
      if (key === "children" || key === "ref" || /^on[A-Z]/.test(key)) continue;
      const value = rest[key];
      if (value === prevRestAttrs[key]) continue;
      prevRestAttrs[key] = value;
      if (value == null || value === false) root.removeAttribute(key);
      else root.setAttribute(key, value === true ? "" : String(value));
    }
  });

  // Viewport listeners. The compiled output delegated keydown/click/pointerdown
  // (document-level, bubble phase) and used addEventListener for touch*/wheel;
  // all are equivalent to bubble-phase listeners attached directly here.
  viewport.addEventListener("keydown", e => {
    onKeyDown(e);
    if (typeof events.onKeyDown === "function") events.onKeyDown(e);
  });
  if (typeof events.onClick === "function") viewport.addEventListener("click", events.onClick);
  if (typeof events.onPointerDown === "function") viewport.addEventListener("pointerdown", events.onPointerDown);
  if (typeof events.onTouchCancel === "function") viewport.addEventListener("touchcancel", events.onTouchCancel);
  if (typeof events.onTouchEnd === "function") viewport.addEventListener("touchend", events.onTouchEnd);
  if (typeof events.onTouchMove === "function") viewport.addEventListener("touchmove", events.onTouchMove);
  if (typeof events.onTouchStart === "function") viewport.addEventListener("touchstart", events.onTouchStart);
  if (typeof events.onWheel === "function") viewport.addEventListener("wheel", events.onWheel);
  viewport.addEventListener("scroll", e => {
    updateThumb();
    if (typeof events.onScroll === "function") events.onScroll(e);
  });

  // viewportRef ref forwarding (local).
  viewportRef = viewport;

  // Live children inserted into the viewport (compiled inserted
  // `() => local.children`). Track the accessor and re-render into the viewport
  // when it changes. Children are the only
  // content of the viewport, so a full reconcile via replaceChildren matches the
  // single dynamic insert in the compiled output.
  let prevChildren;
  createRenderEffect(() => {
    const next = local.children;
    if (next === prevChildren) return;
    prevChildren = next;
    insertChildren(viewport, next);
  });

  // aria-label effect on the viewport (live across language switch).
  let prevAria;
  createRenderEffect(() => {
    const next = i18n.t("ui.scrollView.ariaLabel");
    if (next !== prevAria) viewport.setAttribute("aria-label", prevAria = next);
  });

  // <Show when={showThumb()}>: the thumb only mounts while visible. Built in its
  // own reactive root so unmount disposes its effect, matching solid's <Show>.
  // It is the second child of the root (after the viewport), inserted before a
  // trailing anchor like the compiled insert of the Show into the root.
  const thumbAnchor = document.createComment("");
  root.appendChild(thumbAnchor);
  let thumbNode = null;
  let thumbDispose = null;
  const buildThumb = () => {
    // <div class=scroll-view__thumb style=z-index:100>
    const thumb = document.createElement("div");
    thumb.className = "scroll-view__thumb";
    thumb.style.cssText = "z-index:100";
    thumb.addEventListener("pointerdown", onThumbPointerDown);
    thumbRef = thumb;
    // Change-guarded data-visible / data-dragging / height / transform, exactly
    // like the compiled effect() with its prev-value cache.
    let prevVisible;
    let prevDragging;
    let prevHeight;
    let prevTransform;
    createRenderEffect(() => {
      const nextVisible = isHovered() || isDragging();
      const nextDragging = isDragging();
      const nextHeight = `${thumbHeight()}px`;
      const nextTransform = `translateY(${thumbTop()}px)`;
      if (nextVisible !== prevVisible) thumb.setAttribute("data-visible", prevVisible = nextVisible);
      if (nextDragging !== prevDragging) thumb.setAttribute("data-dragging", prevDragging = nextDragging);
      if (nextHeight !== prevHeight) thumb.style.setProperty("height", prevHeight = nextHeight);
      if (nextTransform !== prevTransform) thumb.style.setProperty("transform", prevTransform = nextTransform);
    });
    return thumb;
  };
  let prevShow;
  createRenderEffect(() => {
    const show = showThumb();
    if (show === prevShow) return;
    prevShow = show;
    if (thumbNode) {
      thumbNode.remove();
      thumbNode = null;
      thumbRef = undefined;
    }
    if (thumbDispose) {
      thumbDispose();
      thumbDispose = null;
    }
    if (show) {
      thumbNode = createRoot(dispose => {
        thumbDispose = dispose;
        return buildThumb();
      });
      root.insertBefore(thumbNode, thumbAnchor);
    }
  });
  onCleanup(() => {
    if (thumbDispose) thumbDispose();
  });

  return root;
}

// Insert a Solid children value into a parent, replacing existing content.
// Handles nodes, arrays, primitives and (reactive) function children. A
// function child is wrapped in a render effect so nested reactivity keeps
// working, mirroring solid's web-renderer insert().
/**
 * Replace a parent's content with a Solid-style children value.
 * @param {Node} parent - The parent node to clear and re-populate.
 * @param {*} value - The children value (Node, array, function, primitive, or nullish).
 * @returns {void}
 */
function insertChildren(parent, value) {
  parent.replaceChildren();
  appendValue(parent, value);
}

/**
 * Recursively append a Solid-style value to a parent: arrays are flattened,
 * Nodes appended directly, function children wrapped in a render effect (so
 * nested reactivity re-renders the inserted nodes), and other values stringified.
 * @param {Node} parent - The parent node to append into.
 * @param {*} value - The value to append (Node, array, function, primitive, or nullish).
 * @returns {void}
 */
function appendValue(parent, value) {
  if (value == null || value === false || value === true) return;
  if (Array.isArray(value)) {
    for (const item of value) appendValue(parent, item);
    return;
  }
  if (value instanceof Node) {
    parent.appendChild(value);
    return;
  }
  if (typeof value === "function") {
    let current = null;
    createRenderEffect(() => {
      const resolved = value();
      const host = document.createElement("span");
      appendValue(host, resolved);
      const nodes = Array.from(host.childNodes);
      if (current) {
        for (const node of current) node.remove();
      }
      current = nodes;
      for (const node of nodes) parent.appendChild(node);
    });
    return;
  }
  parent.appendChild(document.createTextNode(String(value)));
}
