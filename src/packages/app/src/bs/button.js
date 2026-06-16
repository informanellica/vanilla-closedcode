/**
 * @file Button component: a vanilla reimplementation of the Bootstrap-styled
 * button, mapping variant/size props to Bootstrap classes and forwarding the
 * rest as reactive attributes/event listeners.
 */
import { createRenderEffect } from "../lib/reactivity.js";
import { Icon } from "@/bs/icon.js";

/** Maps a logical button variant to its Bootstrap class. */
const VARIANT_CLASS = {
  primary: "btn-primary",
  secondary: "btn-outline-secondary",
  ghost: "btn-link",
  critical: "btn-danger"
};

/** Maps a logical button size to its Bootstrap class. */
const SIZE_CLASS = {
  small: "btn-sm",
  large: "btn-lg"
};

/**
 * Build the button's className from a classList map plus variant/size/extra
 * classes, keeping the base `btn` and layout classes.
 * @param {Object} classList - Map of class name to boolean (truthy = include).
 * @param {string} variantClass - The resolved variant class.
 * @param {string} sizeClass - The resolved size class (may be empty).
 * @param {string} extraClass - Additional class string to append.
 * @returns {string} The space-joined className.
 */
function getClassList(classList, variantClass, sizeClass, extraClass) {
  const classes = { ...classList };
  classes.btn = true;
  classes[variantClass] = true;
  if (sizeClass) classes[sizeClass] = true;
  classes["d-inline-flex align-items-center gap-1"] = true;
  if (extraClass) classes[extraClass] = true;
  return Object.keys(classes).filter(k => !!classes[k]).join(" ");
}

/**
 * Recursively flatten a children value into an array of DOM nodes (functions
 * are invoked, arrays flattened, nullish/boolean skipped, primitives wrapped in
 * text nodes).
 * @param {Array} target - Array that collected child nodes are pushed onto.
 * @param {*} value - Child value (node, array, function, primitive, or nullish).
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
    target.push(value);
    return;
  }
  target.push(document.createTextNode(String(value)));
}

/**
 * Bootstrap-styled button component. Renders a `<button type="button">` with an
 * optional leading icon, applies variant/size classes, attaches `on*` event
 * handlers, and reactively re-applies the remaining attribute props (which may
 * be signal-backed, e.g. `disabled`). Supports Solid-style `ref` forwarding.
 * @param {Object} props - Component props.
 * @param {string} props.variant - Visual variant (primary/secondary/ghost/critical).
 * @param {string} props.size - Size (small/large/normal).
 * @param {string} props.icon - Optional icon name rendered before the children.
 * @param {string} props.class - Extra class string.
 * @param {Object} props.classList - Class-name-to-boolean map.
 * @param {*} props.children - Button content.
 * @param {Function} props.ref - Optional ref callback receiving the element.
 * @returns {HTMLButtonElement} The button element.
 */
export function Button(props) {
  const button = document.createElement("button");

  button.type = "button";
  button.dataset.component = "button";
  button.dataset.size = props.size || "normal";
  button.dataset.variant = props.variant || "secondary";
  if (props.icon) button.dataset.icon = props.icon;

  const variantClass = VARIANT_CLASS[props.variant] || VARIANT_CLASS.secondary;
  const sizeClass = SIZE_CLASS[props.size] || "";

  button.className = getClassList(props.classList || {}, variantClass, sizeClass, props.class);

  const children = [];

  if (props.icon) {
    const iconEl = Icon({ name: props.icon, size: "small" });
    children.push(iconEl);
  }

  appendChildValue(children, props.children);

  const STATIC_KEYS = ["variant", "size", "icon", "class", "classList", "children", "ref"];
  for (const key in props) {
    if (STATIC_KEYS.includes(key)) continue;
    const value = props[key];
    if (/^on[A-Z]/.test(key) && typeof value === "function") {
      button.addEventListener(key.slice(2).toLowerCase(), value);
    }
  }

  // Attribute props (disabled, aria-*, …) are often signal-backed getters;
  // re-apply them in an effect instead of reading them once at creation.
  createRenderEffect(() => {
    for (const key in props) {
      if (STATIC_KEYS.includes(key) || /^on[A-Z]/.test(key)) continue;
      const value = props[key];
      if (value == null || value === false) button.removeAttribute(key);
      else button.setAttribute(key, value === true ? "" : String(value));
    }
  });

  children.forEach(child => button.appendChild(child));

  // Solid ref forwarding: the popover trigger measures its anchor via
  // ref — without this the popover renders at the viewport origin (top-left).
  if (typeof props.ref === "function") props.ref(button);
  else if ("ref" in props) { try { props.ref = button; } catch {} }
  return button;
}
