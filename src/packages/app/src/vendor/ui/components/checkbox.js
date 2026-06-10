import { Icon } from "./icon.js";

function splitProps(props, keys) {
  const split = {};
  const rest = {};
  for (const key in props) {
    if (keys.includes(key)) split[key] = props[key];
    else rest[key] = props[key];
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
    appendChildren(parent, children());
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

function applyRestProps(el, rest) {
  for (const key in rest) {
    if (key === "class" || key === "classList" || key === "children") continue;
    const value = rest[key];
    if (key.startsWith("on") && typeof value === "function") {
      el[key.toLowerCase()] = value;
      continue;
    }
    if (value === undefined) continue;
    if (key in el && !key.includes("-")) {
      try {
        el[key] = value;
        continue;
      } catch {
        // fallback
      }
    }
    if (value === false || value === null) el.removeAttribute(key);
    else el.setAttribute(key, String(value));
  }
}

export function Checkbox(props) {
  const [local, others] = splitProps(props, ["children", "class", "classList", "label", "hideLabel", "description", "icon"]);
  const root = document.createElement("label");
  root.setAttribute("data-component", "checkbox");
  if (local.class) root.classList.add(...String(local.class).split(/\s+/).filter(Boolean));
  applyClassList(root, local.classList);
  applyRestProps(root, others);

  const input = document.createElement("input");
  input.type = "checkbox";
  input.setAttribute("data-slot", "checkbox-checkbox-input");
  root.appendChild(input);

  const control = document.createElement("span");
  control.setAttribute("data-slot", "checkbox-checkbox-control");
  const indicator = document.createElement("span");
  indicator.setAttribute("data-slot", "checkbox-checkbox-indicator");
  appendChildren(indicator, local.icon || Icon({ name: "check" }));
  control.appendChild(indicator);
  root.appendChild(control);

  const content = document.createElement("div");
  content.setAttribute("data-slot", "checkbox-checkbox-content");
  if (props.children) {
    const label = document.createElement("span");
    label.setAttribute("data-slot", "checkbox-checkbox-label");
    if (local.hideLabel) label.classList.add("sr-only");
    appendChildren(label, props.children);
    content.appendChild(label);
  }
  if (local.description) {
    const desc = document.createElement("div");
    desc.setAttribute("data-slot", "checkbox-checkbox-description");
    appendChildren(desc, local.description);
    content.appendChild(desc);
  }
  const error = document.createElement("div");
  error.setAttribute("data-slot", "checkbox-checkbox-error");
  content.appendChild(error);
  root.appendChild(content);

  return root;
}
