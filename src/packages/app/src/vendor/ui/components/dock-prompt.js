/** @file DockPrompt component: a dock-surface prompt frame with header, content, and footer slots wrapped in a DockShell/DockTray. */
import { createComponent, createRenderEffect } from "../../../lib/reactivity.js";
import { DockShell, DockTray } from "./dock-surface.js";

/**
 * Resolves a Solid-style child value into a flat array of DOM nodes: unwraps
 * zero-arg accessors, flattens arrays, keeps Nodes, and stringifies the rest.
 * @param {*} value - Child value to resolve.
 * @returns {Array} The resolved DOM nodes (empty for nullish/boolean values).
 */
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
/**
 * Reactively renders a child accessor's resolved nodes into a parent, replacing
 * its content whenever the accessor changes.
 * @param {Node} parent - Parent element whose children are replaced.
 * @param {Function} read - Accessor returning the child value to render.
 * @returns {void}
 */
function renderInto(parent, read) {
  createRenderEffect(() => {
    parent.replaceChildren(...resolveNodes(read()));
  });
}

/**
 * DockPrompt component. Builds a prompt frame whose header/content/footer slots
 * are named from `kind`, forwards keydown (capture phase) to onKeyDown, and lays
 * the header and content inside a DockShell with the footer in a DockTray.
 * @param {Object} props - Component props.
 * @param {string} props.kind - Prefix used to name the data-slot attributes and data-kind.
 * @param {Function} props.onKeyDown - Capture-phase keydown handler for the prompt and its descendants.
 * @param {Function} props.ref - Ref callback (or assignable ref) receiving the root element.
 * @param {*} props.header - Header slot content.
 * @param {*} props.children - Main content slot.
 * @param {*} props.footer - Footer slot content.
 * @returns {HTMLElement} The dock-prompt root element.
 */
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
