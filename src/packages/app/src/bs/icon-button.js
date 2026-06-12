import { createRenderEffect as _solidRenderEffect } from "solid-js";
import { Icon } from "@/bs/icon.js";

function getClassList(classList, variantClass, sizeClass, extraClass) {
  const classes = { ...classList };
  classes.btn = true;
  classes["d-inline-flex"] = true;
  classes["align-items-center"] = true;
  classes["justify-content-center"] = true;
  classes[variantClass] = true;
  classes[sizeClass] = true;
  if (extraClass) classes[extraClass] = true;
  return Object.keys(classes).filter(k => !!classes[k]).join(" ");
}

// Object styles applied per property (compiled style() semantics); a plain
// setAttribute would stringify the object to "[object Object]" and clear the
// inline style (e.g. the dock chevron's rotate transform) instead.
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

function appendChildValue(target, value) {
  if (typeof value === "function") {
    appendChildValue(target, value());
    return;
  }
  if (value == null || value === false || value === true) return;
  if (Array.isArray(value)) {
    value.forEach(item => appendChildValue(target, item));
    return;
  }
  if (value instanceof Node) {
    target.appendChild(value);
    return;
  }
  target.appendChild(document.createTextNode(String(value)));
}

export function IconButton(props) {
  const as = props.as || "button";

  let element;
  if (typeof as === "string") {
    element = document.createElement(as);
  } else {
    element = as(props);
    if (!(element instanceof Node)) {
      element = document.createElement("button");
    }
  }

  element.dataset.component = "icon-button";
  element.dataset.size = props.size || "normal";
  element.dataset.variant = props.variant || "secondary";

  const variant = props.variant || "secondary";
  const variantClass = variant === "ghost" ? "btn-link" : `btn-outline-${variant}`;
  const sizeClass = props.size === "large" ? "btn-lg" : "btn-sm";

  element.className = getClassList(props.classList || {}, variantClass, sizeClass, props.class);

  // props.icon can be a getter (e.g. send ⇄ stop); track it instead of reading once.
  let iconEl = null;
  _solidRenderEffect(() => {
    const name = props.icon;
    element.dataset.icon = name ?? "";
    const next = name ? Icon({ name, size: props.iconSize ?? (props.size === "large" ? "normal" : "small") }) : null;
    if (iconEl) iconEl.remove();
    if (next) element.insertBefore(next, element.firstChild);
    iconEl = next;
  });

  appendChildValue(element, props.children);

  const STATIC_KEYS = ["icon", "variant", "size", "iconSize", "as", "class", "classList", "children", "ref"];
  for (const key in props) {
    if (STATIC_KEYS.includes(key)) continue;
    const value = props[key];
    if (/^on[A-Z]/.test(key) && typeof value === "function") {
      element.addEventListener(key.slice(2).toLowerCase(), value);
    }
  }

  // Attribute props (disabled, aria-label, tabIndex, …) are often getters backed
  // by signals; re-apply them in an effect so e.g. disabled releases once the
  // prompt has text. Reading them once froze the submit button disabled forever.
  _solidRenderEffect(() => {
    for (const key in props) {
      if (STATIC_KEYS.includes(key) || /^on[A-Z]/.test(key)) continue;
      const value = props[key];
      if (key === "style") {
        applyStyle(element, value);
        continue;
      }
      if (value == null || value === false) element.removeAttribute(key);
      else element.setAttribute(key, value === true ? "" : String(value));
    }
  });

  // Solid ref forwarding (Kobalte anchors measure via ref).
  if (typeof props.ref === "function") props.ref(element);
  else if ("ref" in props) { try { props.ref = element; } catch {} }

  return element;
}
