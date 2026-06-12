import { createRenderEffect, createSignal, splitProps } from "solid-js";
import { insert } from "solid-js/web";

// Vanilla port of the Kobalte Switch wrapper. Kobalte previously owned the
// switch behavior (controlled/uncontrolled state, aria wiring, the
// data-checked/data-disabled attributes the CSS keys off); this rebuilds the
// same observable surface by hand, mirroring the bs/switch.js + checkbox.js
// house pattern (real DOM, render effects for reactive state, a hidden
// checkbox input that owns focus/role).

function appendChildren(parent, children) {
  if (children == null || children === false || children === true) return;
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
    insert(parent, children);
    return;
  }
  parent.appendChild(document.createTextNode(String(children)));
}

// Object styles applied per property (compiled style() semantics); a plain
// setAttribute would stringify the object to "[object Object]".
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

// Rest props on the root: handlers bound once, attribute props re-applied in a
// render effect (they are often signal-backed getters), removed when falsy.
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
      if (value == null || value === false) el.removeAttribute(key);
      else if (value === true) el.setAttribute(key, "");
      else el.setAttribute(key, String(value));
    }
  });
}

export function Switch(props) {
  const [local, others] = splitProps(props, [
    "children",
    "class",
    "classList",
    "hideLabel",
    "description",
    "checked",
    "defaultChecked",
    "onChange",
    "disabled",
    "readOnly",
    "validationState",
    "name",
    "value",
    "style"
  ]);

  // Controlled when `checked` is supplied; otherwise track internal state
  // seeded from defaultChecked, exactly like Kobalte's createToggleState.
  const controlled = () => local.checked !== undefined;
  const [internal, setInternal] = createSignal(!!local.defaultChecked);
  const isChecked = () => (controlled() ? !!local.checked : internal());

  const root = document.createElement("div");
  root.setAttribute("data-component", "switch");
  if (local.class) root.classList.add(...String(local.class).split(/\s+/).filter(Boolean));
  if (local.classList) {
    for (const cls in local.classList) {
      if (!cls || !local.classList[cls]) continue;
      root.classList.add(...cls.split(/\s+/).filter(Boolean));
    }
  }
  if (local.style != null) applyStyle(root, local.style);
  applyRestProps(root, others);

  const input = document.createElement("input");
  input.type = "checkbox";
  input.setAttribute("role", "switch");
  input.setAttribute("data-slot", "switch-input");
  if (local.name != null) input.name = local.name;
  if (local.value != null) input.value = local.value;

  // Single commit path shared by the input's native change and the control's
  // pointer/keyboard toggle, mirroring Kobalte's context.toggle().
  const commit = next => {
    if (local.disabled || local.readOnly) return;
    if (!controlled()) setInternal(next);
    local.onChange?.(next);
  };
  const toggle = () => commit(!isChecked());

  input.addEventListener("change", () => {
    if (local.readOnly || local.disabled) {
      // Roll the DOM checkbox back; read-only/disabled never commit state.
      input.checked = isChecked();
      return;
    }
    commit(input.checked);
  });

  // Reactive state -> data attributes the CSS selects on, plus the input's
  // own checked/disabled/aria-checked, mirroring Kobalte's data wiring.
  createRenderEffect(() => {
    const checked = isChecked();
    const disabled = !!local.disabled;
    const readOnly = !!local.readOnly;
    const invalid = local.validationState === "invalid";
    root.toggleAttribute("data-checked", checked);
    root.toggleAttribute("data-disabled", disabled);
    root.toggleAttribute("data-readonly", readOnly);
    root.toggleAttribute("data-invalid", invalid);
    input.checked = checked;
    input.disabled = disabled;
    input.setAttribute("aria-checked", checked ? "true" : "false");
    if (readOnly) input.setAttribute("aria-readonly", "true");
    else input.removeAttribute("aria-readonly");
    if (invalid) input.setAttribute("aria-invalid", "true");
    else input.removeAttribute("aria-invalid");
  });
  root.appendChild(input);

  // Label/description are appended only when present (Solid Show semantics:
  // absent children/description simply do not mount the node).
  if (local.children != null && local.children !== false) {
    const label = document.createElement("label");
    label.setAttribute("data-slot", "switch-label");
    if (local.hideLabel) label.classList.add("sr-only");
    appendChildren(label, local.children);
    root.appendChild(label);
  }
  if (local.description != null && local.description !== false) {
    const desc = document.createElement("div");
    desc.setAttribute("data-slot", "switch-description");
    appendChildren(desc, local.description);
    root.appendChild(desc);
  }

  const error = document.createElement("div");
  error.setAttribute("data-slot", "switch-error");
  root.appendChild(error);

  const control = document.createElement("div");
  control.setAttribute("data-slot", "switch-control");
  control.setAttribute("aria-hidden", "true");
  // The input is visually clipped (see switch.css), so the visible control owns
  // the pointer/keyboard toggle, exactly like Kobalte's SwitchControl: click or
  // Space flips state and returns focus to the input.
  control.addEventListener("click", () => {
    toggle();
    input.focus();
  });
  control.addEventListener("keydown", e => {
    if (e.key === " " || e.key === "Spacebar") {
      e.preventDefault();
      toggle();
      input.focus();
    }
  });
  const thumb = document.createElement("div");
  thumb.setAttribute("data-slot", "switch-thumb");
  control.appendChild(thumb);
  root.appendChild(control);

  return root;
}
