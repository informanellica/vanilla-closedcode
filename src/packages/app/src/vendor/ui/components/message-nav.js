import { createComponent, createMemo, createRenderEffect, mapArray, mergeProps, splitProps } from "../../../lib/reactivity.js";
import { DiffChanges } from "./diff-changes.js";
import { Tooltip } from "./tooltip.js";
import { useI18n } from "../context/i18n.js";

// Mirror solid-js/web setAttribute semantics: nullish removes the attribute.
function setAttr(el, name, value) {
  if (value == null) el.removeAttribute(name);
  else el.setAttribute(name, value);
}

// Resolve Solid-style values: unwrap zero-arg accessors (component results),
// flatten arrays, keep Nodes, stringify the rest.
function resolveNodes(value) {
  if (value == null || value === false || value === true) return [];
  if (typeof value === "function" && !value.length) return resolveNodes(value());
  if (Array.isArray(value)) return value.flatMap(resolveNodes);
  if (value instanceof Node) return [value];
  return [document.createTextNode(String(value))];
}

// Mirror compiled insert(parent, value, marker): keep the resolved nodes
// placed right before the marker, re-resolving inside a render effect so
// reactive accessors stay live. Unchanged results leave the DOM untouched.
function renderBefore(parent, marker, read) {
  let current = [];
  createRenderEffect(() => {
    const nodes = resolveNodes(read());
    let same = nodes.length === current.length;
    for (let i = 0; same && i < nodes.length; i++) same = nodes[i] === current[i];
    if (same) return;
    for (const node of current) {
      if (!nodes.includes(node) && node.parentNode === parent) parent.removeChild(node);
    }
    for (const node of nodes) parent.insertBefore(node, marker);
    current = nodes;
  });
}

// Keyed list sync: rows already in position are left untouched (append-only
// updates never re-attach existing rows), dropped rows are removed, the rest
// are moved into place.
function syncList(parent, nodes) {
  const keep = new Set(nodes);
  let child = parent.firstChild;
  while (child) {
    const next = child.nextSibling;
    if (!keep.has(child)) parent.removeChild(child);
    child = next;
  }
  let cursor = parent.firstChild;
  for (const node of nodes) {
    if (node === cursor) {
      cursor = cursor.nextSibling;
      continue;
    }
    parent.insertBefore(node, cursor);
  }
}

function toggleClasses(el, names, on) {
  for (const cls of names.trim().split(/\s+/)) {
    if (cls) el.classList.toggle(cls, on);
  }
}

// Style/classList are content-diffed like the compiled spread helpers; both
// accept the previous snapshot and return the next one.
function applyStyle(el, value, prev) {
  if (typeof value === "string") {
    if (value !== prev) el.style.cssText = value;
    return value;
  }
  if (typeof prev === "string") {
    el.style.cssText = "";
    prev = undefined;
  }
  const prevObj = prev || {};
  const nextObj = value || {};
  for (const name of Object.keys(prevObj)) {
    if (!(name in nextObj)) el.style.removeProperty(name);
  }
  for (const name of Object.keys(nextObj)) {
    if (nextObj[name] !== prevObj[name]) el.style.setProperty(name, nextObj[name]);
  }
  return { ...nextObj };
}

function applyClassList(el, value, prev) {
  const prevObj = prev || {};
  const nextObj = value || {};
  for (const name of Object.keys(prevObj)) {
    if (!name || name in nextObj || !prevObj[name]) continue;
    toggleClasses(el, name, false);
  }
  for (const name of Object.keys(nextObj)) {
    const on = !!nextObj[name];
    if (!name || on === !!prevObj[name]) continue;
    toggleClasses(el, name, on);
  }
  return { ...nextObj };
}

// Apply one spread prop, mirroring the compiled spread()'s assignProp order:
// style/classList are always diffed, everything else is identity-skipped.
function assignProp(el, key, value, prev, listeners) {
  if (key === "style") return applyStyle(el, value, prev);
  if (key === "classList") return applyClassList(el, value, prev);
  if (value === prev) return prev;
  if (key === "ref") {
    if (typeof value === "function") value(el);
    return value;
  }
  if (key.startsWith("on") && key.length > 2) {
    const name = key.startsWith("on:") ? key.slice(3) : key.slice(2).toLowerCase();
    const existing = listeners.get(key);
    if (existing) el.removeEventListener(name, existing);
    let handler;
    if (typeof value === "function") handler = value;
    else if (Array.isArray(value)) handler = event => value[0](value[1], event);
    if (handler) {
      el.addEventListener(name, handler);
      listeners.set(key, handler);
    } else {
      listeners.delete(key);
    }
    return value;
  }
  if (key === "class" || key === "className") {
    if (value == null) el.removeAttribute("class");
    else el.className = value;
    return value;
  }
  setAttr(el, key, value);
  return value;
}

// Reactive spread for the root <ul>, mirroring compiled spread(el, props,
// false, true): re-run on any prop change and diff per key against the
// previous snapshot; "children" is skipped.
function spreadProps(el, props) {
  const prev = {};
  const listeners = new Map();
  createRenderEffect(() => {
    for (const key of Object.keys(prev)) {
      if (key === "children" || key in props) continue;
      assignProp(el, key, null, prev[key], listeners);
      delete prev[key];
    }
    for (const key of Object.keys(props)) {
      if (key === "children") continue;
      prev[key] = assignProp(el, key, props[key], prev[key], listeners);
    }
  });
}

export function MessageNav(props) {
  const i18n = useI18n();
  const [local, others] = splitProps(props, ["messages", "current", "size", "onMessageSelect", "getLabel"]);

  const buildRow = message => {
    const handleClick = () => local.onMessageSelect(message);
    const handleKeyPress = event => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      local.onMessageSelect(message);
    };

    const buildTick = () => {
      const tick = document.createElement("div");
      tick.setAttribute("data-slot", "message-nav-tick-button");
      tick.setAttribute("role", "button");
      tick.setAttribute("tabindex", "0");
      const line = document.createElement("div");
      line.setAttribute("data-slot", "message-nav-tick-line");
      tick.appendChild(line);
      tick.addEventListener("keydown", handleKeyPress);
      tick.addEventListener("click", handleClick);
      createRenderEffect(() => setAttr(tick, "data-active", message.id === local.current?.id || undefined));
      return tick;
    };

    const buildButton = () => {
      const button = document.createElement("button");
      button.setAttribute("data-slot", "message-nav-message-button");
      const preview = document.createElement("div");
      preview.setAttribute("data-slot", "message-nav-title-preview");
      button.appendChild(preview);
      button.addEventListener("keydown", handleKeyPress);
      button.addEventListener("click", handleClick);
      // DiffChanges sits before the title preview; its result is a reactive
      // accessor, so resolve it through a live insert-before-marker effect.
      const diff = createComponent(DiffChanges, {
        get changes() {
          return message.summary?.diffs ?? [];
        },
        variant: "bars"
      });
      renderBefore(button, preview, () => diff);
      // Show(label) with i18n fallback: the label stays live, and the
      // translated placeholder is only tracked while the label is falsy.
      createRenderEffect(() => {
        const label = local.getLabel?.(message) ?? message.summary?.title;
        preview.replaceChildren(...resolveNodes(label ? label : i18n.t("ui.messageNav.newMessage")));
      });
      createRenderEffect(() => setAttr(preview, "data-active", message.id === local.current?.id || undefined));
      return button;
    };

    const item = document.createElement("li");
    item.setAttribute("data-slot", "message-nav-item");
    // Switch(size) per row: children rebuild only when the matched branch
    // changes; data-active and labels update in place via nested effects.
    const branch = createMemo(() => local.size === "compact" ? "compact" : local.size === "normal" ? "normal" : "");
    createRenderEffect(() => {
      const kind = branch();
      if (kind === "compact") item.replaceChildren(buildTick());
      else if (kind === "normal") item.replaceChildren(buildButton());
      else item.replaceChildren();
    });
    return item;
  };

  // Fresh <ul> per call, like the compiled template closure: the compact
  // tooltip trigger and the normal branch each build their own instance.
  const content = () => {
    const root = document.createElement("ul");
    root.setAttribute("role", "list");
    root.setAttribute("data-component", "message-nav");
    spreadProps(root, mergeProps({
      get ["data-size"]() {
        return local.size;
      }
    }, others));
    // For(messages), keyed by reference: rows for unchanged messages are
    // reused (and their effects kept) across list updates.
    const rows = mapArray(() => local.messages, buildRow);
    createRenderEffect(() => syncList(root, rows()));
    return root;
  };

  // Top-level Switch(size): compact wraps the nav in a Tooltip whose body is
  // a fresh normal-size MessageNav over the same (merged) props.
  return createMemo(() => {
    if (local.size === "compact") {
      return createComponent(Tooltip, {
        openDelay: 0,
        placement: "right-start",
        gutter: -40,
        shift: -10,
        overlap: true,
        contentClass: "message-nav-tooltip",
        get value() {
          const wrap = document.createElement("div");
          wrap.setAttribute("data-slot", "message-nav-tooltip-content");
          const nested = createComponent(MessageNav, mergeProps(props, {
            size: "normal",
            "class": ""
          }));
          createRenderEffect(() => wrap.replaceChildren(...resolveNodes(nested)));
          return wrap;
        },
        get children() {
          return content();
        }
      });
    }
    if (local.size === "normal") return content();
    return undefined;
  });
}
