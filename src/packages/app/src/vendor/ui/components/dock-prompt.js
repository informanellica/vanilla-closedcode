import { createComponent, createRenderEffect } from "solid-js";
import { DockShell, DockTray } from "./dock-surface.js";

// Resolve Solid-style children: unwrap zero-arg accessors, flatten arrays,
// keep Nodes, stringify the rest. Re-run inside a render effect so reactive
// children stay live.
function resolveNodes(value) {
  if (value == null || value === false || value === true) return [];
  if (typeof value === "function" && !value.length) return resolveNodes(value());
  if (Array.isArray(value)) return value.flatMap(resolveNodes);
  if (value instanceof Node) return [value];
  return [document.createTextNode(String(value))];
}
function renderInto(parent, read) {
  createRenderEffect(() => {
    parent.replaceChildren(...resolveNodes(read()));
  });
}

export function DockPrompt(props) {
  const slot = name => `${props.kind}-${name}`;
  const el = document.createElement("div");
  el.dataset.component = "dock-prompt";
  // The compiled version delegated keydown; a capture listener on the root is
  // the equivalent for handlers that must see descendants' keys first.
  el.addEventListener("keydown", event => props.onKeyDown?.(event), true);
  if (typeof props.ref === "function") props.ref(el);
  else if ("ref" in props) { try { props.ref = el; } catch {} }

  const header = document.createElement("div");
  renderInto(header, () => props.header);
  const content = document.createElement("div");
  renderInto(content, () => props.children);
  createRenderEffect(() => {
    header.setAttribute("data-slot", slot("header"));
    content.setAttribute("data-slot", slot("content"));
  });

  el.appendChild(createComponent(DockShell, {
    get ["data-slot"]() { return slot("body"); },
    get children() { return [header, content]; }
  }));
  el.appendChild(createComponent(DockTray, {
    get ["data-slot"]() { return slot("footer"); },
    get children() { return props.footer; }
  }));
  createRenderEffect(() => {
    el.setAttribute("data-kind", props.kind);
  });
  return el;
}
