import { createRenderEffect, splitProps } from "solid-js";

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
function resolveNodes(value) {
  if (value == null || value === false || value === true) return [];
  if (typeof value === "function" && !value.length) return resolveNodes(value());
  if (Array.isArray(value)) return value.flatMap(resolveNodes);
  if (value instanceof Node) return [value];
  return [document.createTextNode(String(value))];
}

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
