/** @file Bootstrap-styled IconButton component: a button (or custom element) with an optional leading icon and reactive attribute/style props. */
import { createRenderEffect } from "../lib/reactivity.js";
import { Icon } from "@/bs/icon.js";

/**
 * Build a space-joined className from a base classList plus variant/size/extra classes.
 * @param {Object} classList - Base record of className to boolean toggles.
 * @param {string} variantClass - Bootstrap variant class to enable (e.g. "btn-outline-secondary").
 * @param {string} sizeClass - Bootstrap size class to enable (e.g. "btn-sm").
 * @param {string} extraClass - Optional additional class to enable.
 * @returns {string} The space-joined list of enabled class names.
 */
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

/**
 * Apply a style value to an element, supporting null (remove), a CSS string, or
 * a per-property object (including custom properties).
 *
 * Object styles applied per property (compiled style() semantics); a plain
 * setAttribute would stringify the object to "[object Object]" and clear the
 * inline style (e.g. the dock chevron's rotate transform) instead.
 * @param {HTMLElement} el - Element whose style to set.
 * @param {*} style - null/undefined to clear, a CSS text string, or a record of style properties.
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

/**
 * Append a child value to a target node, recursively resolving functions and
 * arrays and coercing primitives to text nodes (skips null/booleans).
 * @param {Node} target - Parent node to append into.
 * @param {*} value - Child value: function, array, Node, primitive, or null/boolean.
 */
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

/**
 * Bootstrap-styled icon button. Renders a button (or a custom element/component
 * via `as`) with an optional leading icon. Icon name and attribute props (e.g.
 * disabled, aria-label) may be reactive getters and are re-applied in effects;
 * `on*` props are bound as event listeners and `ref` is forwarded.
 * @param {Object} props - Component props.
 * @param {string} props.as - Tag name or a component function to render as the element (default "button").
 * @param {string} props.icon - Icon name to render (may be a reactive getter).
 * @param {string} props.variant - Visual variant ("ghost", or a Bootstrap color used as btn-outline-*).
 * @param {string} props.size - "large" or "normal"/other; controls button and icon sizing.
 * @param {string} props.iconSize - Explicit icon size override.
 * @param {string} props.class - Extra class to add.
 * @param {Object} props.classList - Base className-to-boolean record.
 * @param {*} props.children - Child content appended after the icon.
 * @param {Function} props.ref - Ref callback or property to receive the created element.
 * @returns {HTMLElement} The constructed button element.
 */
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
  createRenderEffect(() => {
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
  createRenderEffect(() => {
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

  // Solid ref forwarding (popover anchors measure via ref).
  if (typeof props.ref === "function") props.ref(element);
  else if ("ref" in props) { try { props.ref = element; } catch {} }

  return element;
}
