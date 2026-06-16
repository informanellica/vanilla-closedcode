/** @file Vanilla ResizeHandle component: a draggable divider that resizes an adjacent pane via mouse drag, with clamping and optional collapse-on-threshold. */
import { createRenderEffect, splitProps } from "../../../lib/reactivity.js";

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
  for (const [key, value] of Object.entries(style)) {
    if (value == null) continue;
    if (key.startsWith("--")) el.style.setProperty(key, String(value));
    else el.style[key] = value;
  }
}

// Resolve Solid-style children: unwrap zero-arg accessors, flatten arrays,
// keep Nodes, stringify the rest.
/**
 * Resolve a possibly-reactive value into an array of DOM nodes: zero-arg
 * accessors are unwrapped, arrays flattened, Nodes kept, and other values
 * stringified into text nodes.
 * @param {*} value - The value to resolve (accessor function, array, Node, or primitive).
 * @returns {Array} The flattened array of resolved DOM nodes.
 */
function resolveNodes(value) {
  if (value == null || value === false || value === true) return [];
  if (typeof value === "function" && !value.length) return resolveNodes(value());
  if (Array.isArray(value)) return value.flatMap(resolveNodes);
  if (value instanceof Node) return [value];
  return [document.createTextNode(String(value))];
}

/**
 * Draggable resize handle component. On mousedown it tracks pointer movement
 * along the configured axis, computes a new clamped size, and emits it via
 * onResize; on release it optionally collapses the pane when the final size
 * falls below a threshold. Forwards passthrough props/attributes/listeners.
 * @param {Object} props - Component props.
 * @param {string} props.direction - Drag axis, "horizontal" or "vertical".
 * @param {string} props.edge - Which edge resizes, "start" or "end" (defaults by direction).
 * @param {number} props.size - The current pane size used as the drag baseline.
 * @param {number} props.min - Minimum allowed size (clamp lower bound).
 * @param {number} props.max - Maximum allowed size (clamp upper bound).
 * @param {Function} props.onResize - Called with the new clamped size during dragging.
 * @param {Function} props.onCollapse - Called when the pane is dragged below collapseThreshold.
 * @param {number} props.collapseThreshold - Size below which onCollapse fires on release.
 * @param {string} props.class - Additional CSS class names for the handle.
 * @param {Object} props.classList - Solid-style class toggle map for the handle.
 * @returns {HTMLElement} The resize-handle element.
 */
export function ResizeHandle(props) {
  const [local, rest] = splitProps(props, ["direction", "edge", "size", "min", "max", "onResize", "onCollapse", "collapseThreshold", "class", "classList"]);
  const handleMouseDown = e => {
    e.preventDefault();
    const edge = local.edge ?? (local.direction === "vertical" ? "start" : "end");
    const start = local.direction === "horizontal" ? e.clientX : e.clientY;
    const startSize = local.size;
    let current = startSize;
    document.body.style.userSelect = "none";
    document.body.style.overflow = "hidden";
    const onMouseMove = moveEvent => {
      const pos = local.direction === "horizontal" ? moveEvent.clientX : moveEvent.clientY;
      const delta = local.direction === "vertical" ? edge === "end" ? pos - start : start - pos : edge === "start" ? start - pos : pos - start;
      current = startSize + delta;
      const clamped = Math.min(local.max, Math.max(local.min, current));
      local.onResize(clamped);
    };
    const onMouseUp = () => {
      document.body.style.userSelect = "";
      document.body.style.overflow = "";
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      const threshold = local.collapseThreshold ?? 0;
      if (local.onCollapse && threshold > 0 && current < threshold) {
        local.onCollapse();
      }
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  };

  const el = document.createElement("div");
  el.setAttribute("data-component", "resize-handle");
  el.addEventListener("mousedown", handleMouseDown);

  // Mirror the compiled spread(mergeProps(rest, overrides)): splitProps keeps
  // rest's getters live; listeners attach once, everything else re-applies
  // reactively. Keys owned by the overrides are skipped (overrides win).
  for (const key in rest) {
    if (key === "onMouseDown") continue; // overridden by the local handler
    if (/^on[A-Z]/.test(key) && typeof rest[key] === "function") {
      el.addEventListener(key.slice(2).toLowerCase(), rest[key]);
    }
  }
  createRenderEffect(() => {
    const direction = local.direction;
    if (direction == null) el.removeAttribute("data-direction");
    else el.setAttribute("data-direction", direction);
  });
  createRenderEffect(() => {
    el.setAttribute("data-edge", local.edge ?? (local.direction === "vertical" ? "start" : "end"));
  });
  createRenderEffect(() => {
    // classList semantics: every truthy entry contributes its key as classes,
    // plus the plain `class` prop merged in (as the compiled output did).
    const classes = [];
    const list = local.classList;
    if (list) {
      for (const key of Object.keys(list)) {
        if (key && list[key]) classes.push(key);
      }
    }
    if (local.class) classes.push(local.class);
    el.className = classes.join(" ");
  });
  createRenderEffect(() => {
    for (const key in rest) {
      if (/^on[A-Z]/.test(key)) continue;
      if (key === "ref" || key === "children") continue;
      if (key === "data-component" || key === "data-direction" || key === "data-edge") continue;
      const value = rest[key];
      if (key === "style") {
        applyStyle(el, value);
        continue;
      }
      if (value == null || value === false) el.removeAttribute(key);
      else el.setAttribute(key, value === true ? "" : String(value));
    }
  });
  if ("children" in rest) {
    createRenderEffect(() => {
      el.replaceChildren(...resolveNodes(rest.children));
    });
  }
  if (typeof rest.ref === "function") rest.ref(el);
  return el;
}
