/** @file IconButton component: a <button> that renders an Icon, with variant/size data attributes and reactive children. */
import { insert } from "../../../lib/reactivity.js";
import { Icon } from "./icon.js";

/**
 * Split a props object into the selected keys and the remaining rest props.
 *
 * @param {Object} props - The source props object.
 * @param {Array} keys - Key names to extract into the first result.
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
 * Apply a Solid-style classList ({ "a b": true, c: false }) onto an element,
 * splitting space-separated multi-class keys into individual tokens.
 *
 * @param {Element} el - The target element.
 * @param {Object} classList - Map of class-token strings to boolean enable flags.
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
 * Apply leftover props to an element: wire on* handlers as DOM properties,
 * set known DOM properties directly, and otherwise reflect to attributes
 * (removing them for false/null values). Skips class, classList, and children.
 *
 * @param {Element} el - The target element.
 * @param {Object} rest - The remaining props (after class/classList/children removed).
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
 * Render an icon-only button as a <button data-component="icon-button">.
 *
 * The icon glyph is determined by props.icon; remaining props (aria-*, handlers,
 * etc.) are applied to the button element.
 *
 * @param {Object} props - Component props.
 * @param {string} props.icon - Name of the icon to render inside the button.
 * @param {string} props.variant - Visual variant (data-variant); defaults to "secondary".
 * @param {string} props.size - Button size (data-size); defaults to "normal".
 * @param {string} props.iconSize - Icon size override; defaults based on size.
 * @param {string} props.class - Space-separated class names applied to the button.
 * @param {Object} props.classList - Solid-style classList map applied to the button.
 * @returns {HTMLButtonElement} The constructed icon button element.
 */
export function IconButton(props) {
  const [split, rest] = splitProps(props, ["variant", "size", "iconSize", "class", "classList"]);
  const el = document.createElement("button");
  el.type = "button";
  el.setAttribute("data-component", "icon-button");
  el.setAttribute("data-icon", props.icon);
  el.setAttribute("data-size", split.size || "normal");
  el.setAttribute("data-variant", split.variant || "secondary");
  if (split.class) el.classList.add(...String(split.class).split(/\s+/).filter(Boolean));
  applyClassList(el, split.classList);
  applyRestProps(el, rest);
  appendChildren(el, Icon({ name: props.icon, size: split.iconSize ?? (split.size === "large" ? "normal" : "small") }));
  return el;
}

/**
 * Append children to a parent element, handling arrays, Nodes, reactive
 * accessor functions (routed through insert() to stay live), and primitives
 * (appended as text). Nullish/false children are skipped.
 *
 * @param {Node} parent - The parent element to append into.
 * @param {*} children - The child content: Node, array, function, primitive, or nullish.
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
