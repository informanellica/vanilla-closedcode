/** @file Card component family: Card container plus CardTitle, CardDescription, and CardActions slots. */
import { insert } from "../../../lib/reactivity.js";
import { Icon } from "./icon.js";

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
    if (keys.includes(key)) split[key] = props[key];
    else rest[key] = props[key];
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
    if (value === false || value === null) el.removeAttribute(key);
    else el.setAttribute(key, String(value));
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
 * Maps a card variant to its default title icon name.
 * @param {string} variant - Card variant ("error", "warning", "success", "info").
 * @returns {string} The icon name for the variant, or undefined for others.
 */
function pick(variant) {
  if (variant === "error") return "circle-ban-sign";
  if (variant === "warning") return "warning";
  if (variant === "success") return "circle-check";
  if (variant === "info") return "help";
}

/**
 * Maps a card variant to its CSS accent color custom property value.
 * @param {string} variant - Card variant ("error", "warning", "success", "info").
 * @returns {string} A CSS var() expression for the accent color, or undefined for others.
 */
function accentFor(variant) {
  if (variant === "error") return "var(--icon-critical-base)";
  if (variant === "warning") return "var(--icon-warning-active)";
  if (variant === "success") return "var(--icon-success-active)";
  if (variant === "info") return "var(--icon-info-active)";
}

/**
 * Card component. Renders a `<div>` container with a variant data attribute and
 * a derived accent color (--card-accent), accepting a string or object style.
 * @param {Object} props - Component props.
 * @param {string} props.variant - Card variant (data-variant); defaults to "normal".
 * @param {*} props.style - Inline style as a string or object.
 * @param {*} props.class - Class string(s) to add to the root.
 * @param {Object} props.classList - Solid-style class toggle map.
 * @param {*} props.children - Card content.
 * @returns {HTMLElement} The card `<div>` element.
 */
export function Card(props) {
  const [split, rest] = splitProps(props, ["variant", "style", "class", "classList"]);
  const el = document.createElement("div");
  const variant = split.variant ?? "normal";
  el.setAttribute("data-component", "card");
  el.setAttribute("data-variant", variant);
  if (split.class) el.classList.add(...String(split.class).split(/\s+/).filter(Boolean));
  applyClassList(el, split.classList);
  applyRestProps(el, rest);
  const accent = accentFor(variant);
  if (split.style) {
    if (typeof split.style === "string") {
      el.setAttribute("style", `${split.style}${accent ? `;--card-accent:${accent};` : ""}`);
    } else if (typeof split.style === "object") {
      for (const key in split.style) el.style.setProperty(key, String(split.style[key]));
      if (accent) el.style.setProperty("--card-accent", accent);
    }
  } else if (accent) {
    el.style.setProperty("--card-accent", accent);
  }
  appendChildren(el, props.children);
  return el;
}

/**
 * CardTitle component. Renders the card title slot with an optional leading icon
 * (explicit name, or a default derived from the variant; pass false/null to omit).
 * @param {Object} props - Component props.
 * @param {string} props.variant - Variant used to choose the default icon; defaults to "normal".
 * @param {*} props.icon - Icon name, or false/null to suppress the icon.
 * @param {*} props.class - Class string(s) to add to the root.
 * @param {Object} props.classList - Solid-style class toggle map.
 * @param {*} props.children - Title content.
 * @returns {HTMLElement} The card-title `<div>` element.
 */
export function CardTitle(props) {
  const [split, rest] = splitProps(props, ["variant", "icon", "class", "classList", "children"]);
  const el = document.createElement("div");
  const variant = split.variant ?? "normal";
  const iconName = split.icon === false || split.icon === null ? null : typeof split.icon === "string" ? split.icon : pick(variant);
  el.setAttribute("data-slot", "card-title");
  if (split.class) el.classList.add(...String(split.class).split(/\s+/).filter(Boolean));
  applyClassList(el, split.classList);
  applyRestProps(el, rest);
  if (iconName) {
    const iconEl = document.createElement("span");
    iconEl.setAttribute("data-slot", "card-title-icon");
    appendChildren(iconEl, Icon({ name: iconName, size: "small" }));
    el.appendChild(iconEl);
  }
  appendChildren(el, split.children);
  return el;
}

/**
 * CardDescription component. Renders the card description slot.
 * @param {Object} props - Component props.
 * @param {*} props.class - Class string(s) to add to the root.
 * @param {Object} props.classList - Solid-style class toggle map.
 * @param {*} props.children - Description content.
 * @returns {HTMLElement} The card-description `<div>` element.
 */
export function CardDescription(props) {
  const [split, rest] = splitProps(props, ["class", "classList", "children"]);
  const el = document.createElement("div");
  el.setAttribute("data-slot", "card-description");
  if (split.class) el.classList.add(...String(split.class).split(/\s+/).filter(Boolean));
  applyClassList(el, split.classList);
  applyRestProps(el, rest);
  appendChildren(el, split.children);
  return el;
}

/**
 * CardActions component. Renders the card actions slot (e.g. a row of buttons).
 * @param {Object} props - Component props.
 * @param {*} props.class - Class string(s) to add to the root.
 * @param {Object} props.classList - Solid-style class toggle map.
 * @param {*} props.children - Action content.
 * @returns {HTMLElement} The card-actions `<div>` element.
 */
export function CardActions(props) {
  const [split, rest] = splitProps(props, ["class", "classList", "children"]);
  const el = document.createElement("div");
  el.setAttribute("data-slot", "card-actions");
  if (split.class) el.classList.add(...String(split.class).split(/\s+/).filter(Boolean));
  applyClassList(el, split.classList);
  applyRestProps(el, rest);
  appendChildren(el, split.children);
  return el;
}
