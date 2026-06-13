import { createRenderEffect, splitProps } from "../../../lib/reactivity.js";

// Resolve Solid-style children: unwrap zero-arg accessors, flatten arrays,
// keep Nodes, stringify the rest. Called inside a render effect so reactive
// children stay live.
function resolveNodes(value) {
  if (value == null || value === false || value === true) return [];
  if (typeof value === "function" && !value.length) return resolveNodes(value());
  if (Array.isArray(value)) return value.flatMap(resolveNodes);
  if (value instanceof Node) return [value];
  return [document.createTextNode(String(value))];
}

// Re-position `nodes` directly before `anchor`, removing previous nodes that
// are no longer present. Nodes already in place are left untouched, mirroring
// the compiled insert()'s array reconciliation (which kept stable nodes — e.g.
// a focused editor — mounted across sibling updates).
function reconcileBefore(anchor, current, nodes) {
  const parent = anchor.parentNode;
  const stale = new Set(current);
  for (const node of nodes) stale.delete(node);
  for (const node of stale) node.remove();
  let ref = anchor;
  for (let i = nodes.length - 1; i >= 0; i--) {
    const node = nodes[i];
    if (node.parentNode !== parent || node.nextSibling !== ref) {
      parent.insertBefore(node, ref);
    }
    ref = node;
  }
}

// Append resolved children to `out`. A function item (memo / Show result)
// gets its own comment-anchored live region with a nested render effect, so
// an update to one slot never remounts sibling nodes.
function appendResolved(out, value) {
  if (value == null || value === false || value === true) return;
  if (Array.isArray(value)) {
    for (const item of value) appendResolved(out, item);
    return;
  }
  if (typeof value === "function" && !value.length) {
    const anchor = document.createComment("dock-surface-slot");
    let current = null;
    createRenderEffect(() => {
      const nodes = resolveNodes(value());
      if (current === null) {
        // First run happens while the parent's child list is still being
        // built, before the anchor is connected.
        out.push(...nodes, anchor);
      } else {
        reconcileBefore(anchor, current, nodes);
      }
      current = nodes;
    });
    return;
  }
  out.push(value instanceof Node ? value : document.createTextNode(String(value)));
}

function insertChildren(parent, read) {
  // Re-runs only if the children getter itself reads signals; the nested slot
  // effects created via appendResolved are owned by this effect and disposed
  // on re-run, so a full rebuild stays consistent.
  createRenderEffect(() => {
    const out = [];
    appendResolved(out, read());
    parent.replaceChildren(...out);
  });
}

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

function toggleClassKey(el, key, on) {
  for (const name of key.trim().split(/\s+/)) {
    if (name) el.classList.toggle(name, on);
  }
}

// Mirror the compiled classList(): toggle only keys whose truthiness changed,
// leaving classes managed elsewhere alone. Keys may contain several
// space-separated class names.
function bindClassList(el, read) {
  let prev = {};
  createRenderEffect(() => {
    const value = read() ?? {};
    for (const key of Object.keys(prev)) {
      if (!key || key === "undefined" || value[key]) continue;
      toggleClassKey(el, key, false);
    }
    const next = {};
    for (const key of Object.keys(value)) {
      if (!key || key === "undefined" || !value[key]) continue;
      if (!prev[key]) toggleClassKey(el, key, true);
      next[key] = true;
    }
    prev = next;
  });
}

// Spread the remaining props onto the element the way the compiled spread()
// did: listeners bound once (reading the current handler at dispatch time),
// ref wired first, then attributes re-applied reactively with a
// previous-value diff. `owned` attributes are controlled by the component
// itself and never overwritten from rest props (mergeProps override order).
function applyRest(el, rest, owned) {
  for (const key in rest) {
    if (!/^on[A-Z]/.test(key)) continue;
    const type = key.slice(2).toLowerCase();
    el.addEventListener(type, event => {
      const handler = rest[key];
      if (Array.isArray(handler)) handler[0](handler[1], event);
      else handler?.(event);
    });
  }
  if (typeof rest.ref === "function") rest.ref(el);
  else if ("ref" in rest) {
    try { rest.ref = el; } catch {}
  }
  const prev = {};
  createRenderEffect(() => {
    for (const key in rest) {
      if (key === "ref" || owned.has(key) || /^on[A-Z]/.test(key)) continue;
      const value = rest[key];
      if (value === prev[key]) continue;
      prev[key] = value;
      if (key === "style") {
        applyStyle(el, value);
        continue;
      }
      if (value == null || value === false) el.removeAttribute(key);
      else el.setAttribute(key, value === true ? "" : String(value));
    }
  });
}

function createSurface(tag, surface, props, extraSplitKeys = [], ownedAttrs = []) {
  const [split, rest] = splitProps(props, ["children", "class", "classList", ...extraSplitKeys]);
  const el = document.createElement(tag);
  el.setAttribute("data-dock-surface", surface);
  applyRest(el, rest, new Set(["data-dock-surface", ...ownedAttrs]));
  bindClassList(el, () => ({
    ...split.classList,
    [split.class ?? ""]: !!split.class
  }));
  insertChildren(el, () => split.children);
  return { el, split };
}

export function DockShell(props) {
  return createSurface("div", "shell", props).el;
}

export function DockShellForm(props) {
  return createSurface("form", "shell", props).el;
}

export function DockTray(props) {
  const { el, split } = createSurface("div", "tray", props, ["attach"], ["data-dock-attach"]);
  createRenderEffect(() => {
    el.setAttribute("data-dock-attach", split.attach || "none");
  });
  return el;
}
