/** @file Avatar component: renders an image avatar or a grapheme-based text fallback. */
import { insert } from "../../../lib/reactivity.js";
const segmenter = typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : undefined;

/**
 * Returns the first grapheme cluster (or code point) of a string.
 * @param {string} value - Source string to read the leading character from.
 * @returns {string} The first grapheme/character, or an empty string when the input is falsy.
 */
function first(value) {
  if (!value) return "";
  if (!segmenter) return Array.from(value)[0] ?? "";
  return segmenter.segment(value)[Symbol.iterator]().next().value?.segment ?? Array.from(value)[0] ?? "";
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
        // fallback
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
 * Applies an inline style object to an element via setProperty.
 * @param {HTMLElement} el - Target element.
 * @param {Object} style - Map of CSS property names to values; null/undefined values are skipped.
 * @returns {void}
 */
function applyStyle(el, style) {
  if (!style || typeof style !== "object") return;
  for (const key in style) {
    if (style[key] == null) continue;
    el.style.setProperty(key, String(style[key]));
  }
}

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
 * Avatar component. Renders an `<img>` when `src` is provided, otherwise a text
 * fallback (the first grapheme of `fallback`) with optional background/foreground colors.
 * @param {Object} props - Component props.
 * @param {string} props.fallback - Text whose first grapheme is shown when no image is given.
 * @param {string} props.src - Image source URL; when present an image avatar is rendered.
 * @param {string} props.background - CSS color for the fallback background (--avatar-bg).
 * @param {string} props.foreground - CSS color for the fallback text (--avatar-fg).
 * @param {string} props.size - Size variant written to data-size (defaults to "normal").
 * @param {*} props.class - Class string(s) to add to the root.
 * @param {Object} props.classList - Solid-style class toggle map.
 * @param {Object} props.style - Inline style object.
 * @returns {HTMLElement} The avatar `<div>` element.
 */
export function Avatar(props) {
  const [split, rest] = splitProps(props, ["fallback", "src", "background", "foreground", "size", "class", "classList", "style"]);
  const src = split.src;
  const el = document.createElement("div");
  el.setAttribute("data-component", "avatar");
  el.setAttribute("data-size", split.size || "normal");
  if (src) el.setAttribute("data-has-image", "");
  else el.removeAttribute("data-has-image");
  if (split.class) el.classList.add(...String(split.class).split(/\s+/).filter(Boolean));
  applyClassList(el, split.classList);
  applyRestProps(el, rest);
  applyStyle(el, typeof split.style === "object" ? split.style : {});

  if (!src && split.background) el.style.setProperty("--avatar-bg", split.background);
  if (!src && split.foreground) el.style.setProperty("--avatar-fg", split.foreground);

  if (src) {
    const img = document.createElement("img");
    img.setAttribute("data-slot", "avatar-image");
    img.draggable = false;
    img.src = src;
    el.appendChild(img);
  } else {
    el.textContent = first(split.fallback);
  }

  return el;
}
