import { createRenderEffect } from "solid-js";
import { insert as _solidInsert } from "solid-js/web";
import { Icon } from "./icon.js";

// Getter-preserving split (Solid's splitProps semantics): copying values
// would evaluate signal-backed getters once and freeze them (the documented
// frozen-props pitfall).
function splitProps(props, keys) {
  const split = {};
  const rest = {};
  for (const key of Object.keys(props)) {
    const desc = Object.getOwnPropertyDescriptor(props, key);
    if (keys.includes(key)) Object.defineProperty(split, key, desc);
    else Object.defineProperty(rest, key, desc);
  }
  return [split, rest];
}

function appendChildren(parent, children) {
  if (children == null || children === false) return;
  if (Array.isArray(children)) {
    for (const child of children) appendChildren(parent, child);
    return;
  }
  if (children instanceof Node) {
    parent.appendChild(children);
    return;
  }
  if (typeof children === "function") {
    // Reactive child (Solid Show/For/components return accessors): let
    // solid-js/web insert() track it so updates re-render instead of freezing.
    _solidInsert(parent, children);
    return;
  }
  parent.appendChild(document.createTextNode(String(children)));
}

function applyClassList(el, classList) {
  if (!classList) return;
  for (const cls in classList) {
    if (!cls) continue;
    // Solid's classList contract allows space-separated multi-class keys;
    // DOMTokenList.add/remove reject tokens containing spaces.
    const tokens = cls.split(/\s+/).filter(Boolean);
    if (!tokens.length) continue;
    if (classList[cls]) el.classList.add(...tokens);
    else el.classList.remove(...tokens);
  }
}

// Object styles applied per property (compiled style() semantics); a plain
// setAttribute would stringify the object to "[object Object]" and clear the
// inline style instead.
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

// Handlers are bound once; attribute props (data-state, style, aria-*, …)
// are often signal-backed getters and are re-applied inside a render effect,
// removed when they turn null/undefined/false.
function applyRestProps(el, rest) {
  for (const key in rest) {
    if (key === "class" || key === "classList" || key === "children") continue;
    const value = rest[key];
    if (key.startsWith("on") && typeof value === "function") {
      el[key.toLowerCase()] = value;
    }
  }
  const prev = {};
  createRenderEffect(() => {
    for (const key in rest) {
      if (key === "class" || key === "classList" || key === "children") continue;
      if (key.startsWith("on") && typeof rest[key] === "function") continue;
      const value = rest[key];
      if (value === prev[key]) continue;
      prev[key] = value;
      if (key === "style") {
        applyStyle(el, value);
        continue;
      }
      if (value !== undefined && key in el && !key.includes("-")) {
        try {
          el[key] = value;
          continue;
        } catch {
          // fall through to the attribute path
        }
      }
      if (value == null || value === false) el.removeAttribute(key);
      else el.setAttribute(key, String(value));
    }
  });
}

export function Checkbox(props) {
  const [local, others] = splitProps(props, ["children", "class", "classList", "label", "hideLabel", "description", "icon", "checked", "indeterminate", "disabled", "readOnly"]);
  const root = document.createElement("label");
  root.setAttribute("data-component", "checkbox");
  if (local.class) root.classList.add(...String(local.class).split(/\s+/).filter(Boolean));
  applyClassList(root, local.classList);
  applyRestProps(root, others);

  const input = document.createElement("input");
  input.type = "checkbox";
  input.setAttribute("data-slot", "checkbox-checkbox-input");
  root.appendChild(input);

  // State props are live getters (e.g. a todo's status signal); track them and
  // expose the Kobalte-style data attributes checkbox.css selects on
  // ([data-checked] / [data-indeterminate] / [data-disabled] / [data-readonly]).
  createRenderEffect(() => {
    const checked = !!local.checked;
    const indeterminate = !!local.indeterminate;
    const disabled = !!local.disabled;
    const readOnly = !!local.readOnly;
    root.toggleAttribute("data-checked", checked);
    root.toggleAttribute("data-indeterminate", indeterminate);
    root.toggleAttribute("data-disabled", disabled);
    root.toggleAttribute("data-readonly", readOnly);
    input.checked = checked;
    input.indeterminate = indeterminate;
    input.disabled = disabled;
  });

  const control = document.createElement("span");
  control.setAttribute("data-slot", "checkbox-checkbox-control");
  const indicator = document.createElement("span");
  indicator.setAttribute("data-slot", "checkbox-checkbox-indicator");
  // icon is often a signal-backed getter (e.g. an in-progress marker that
  // follows item status); re-resolve it in a render effect instead of reading
  // it once. The default check mark node is cached and re-attached.
  let fallbackIcon;
  createRenderEffect(() => {
    const icon = local.icon;
    indicator.replaceChildren();
    appendChildren(indicator, icon || (fallbackIcon ??= Icon({ name: "check" })));
  });
  control.appendChild(indicator);
  root.appendChild(control);

  const content = document.createElement("div");
  content.setAttribute("data-slot", "checkbox-checkbox-content");
  // Children are evaluated exactly once (Solid component semantics) — the
  // previous code read the getter several times, creating extra instances.
  const children = local.children;
  if (children != null && children !== false) {
    const label = document.createElement("span");
    label.setAttribute("data-slot", "checkbox-checkbox-label");
    if (local.hideLabel) label.classList.add("sr-only");
    appendChildren(label, children);
    content.appendChild(label);
  }
  const description = local.description;
  if (description != null && description !== false) {
    const desc = document.createElement("div");
    desc.setAttribute("data-slot", "checkbox-checkbox-description");
    appendChildren(desc, description);
    content.appendChild(desc);
  }
  const error = document.createElement("div");
  error.setAttribute("data-slot", "checkbox-checkbox-error");
  content.appendChild(error);
  root.appendChild(content);

  return root;
}
