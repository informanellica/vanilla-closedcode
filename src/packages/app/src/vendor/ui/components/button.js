/** @file Button component: a styled `<button>` with variant/size/icon support. */
import { insert } from "../../../lib/reactivity.js";
import { Icon } from "./icon.js";

/**
 * Appends Solid-style children (nodes, arrays, reactive accessors, or primitives) to a parent.
 * @param {Node} parent - Parent element to receive the children.
 * @param {*} children - Child value: a Node, array, function accessor, or primitive.
 * @returns {void}
 */
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
    insert(parent, children);
    return;
  }
  parent.appendChild(document.createTextNode(String(children)));
}

/**
 * Splits a props object into the requested keys and the remaining keys.
 * @param {Object} props - Source props object.
 * @param {Array} keys - Property names to extract into the first bucket.
 * @returns {Array} A two-element array: [picked props, rest props].
 */
function splitProps(props, keys) {
  const split = {};
  const rest = {};
  for (const key in props) {
    if (keys.includes(key)) {
      split[key] = props[key];
    } else {
      rest[key] = props[key];
    }
  }
  return [split, rest];
}

/**
 * Applies a Solid-style classList map to an element, toggling each class token.
 * @param {HTMLElement} el - Target element.
 * @param {Object} classList - Map of (possibly space-separated) class keys to truthy/falsy values.
 * @returns {void}
 */
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

/**
 * Applies remaining props to an element: binds on* handlers, sets known DOM
 * properties, and falls back to attributes (removing on null/false).
 * @param {HTMLElement} el - Target element.
 * @param {Object} rest - Remaining props excluding class/classList/children.
 * @returns {void}
 */
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
        // fallback to attribute
      }
    }
    if (value === false || value === null) {
      el.removeAttribute(key);
    } else {
      el.setAttribute(key, String(value));
    }
  }
}

/**
 * Button component. Renders a `<button type="button">` with data attributes for
 * variant/size, an optional leading icon, and the provided children as the label.
 * @param {Object} props - Component props.
 * @param {string} props.variant - Visual variant (data-variant); defaults to "secondary".
 * @param {string} props.size - Size variant (data-size); defaults to "normal".
 * @param {string} props.icon - Optional icon name rendered before the label.
 * @param {*} props.class - Class string(s) to add to the root.
 * @param {Object} props.classList - Solid-style class toggle map.
 * @param {*} props.children - Button label content.
 * @returns {HTMLButtonElement} The button element.
 */
export function Button(props) {
  const [split, rest] = splitProps(props, ["variant", "size", "icon", "class", "classList"]);
  const el = document.createElement("button");
  el.type = "button";
  el.setAttribute("data-component", "button");
  el.setAttribute("data-size", split.size || "normal");
  el.setAttribute("data-variant", split.variant || "secondary");
  if (split.icon) el.setAttribute("data-icon", String(split.icon));
  if (split.class) el.classList.add(...String(split.class).split(/\s+/).filter(Boolean));
  applyClassList(el, split.classList);
  applyRestProps(el, rest);

  if (split.icon) {
    appendChildren(el, Icon({ name: split.icon, size: "small" }));
  }
  appendChildren(el, props.children);
  return el;
}
