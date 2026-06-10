import { insert as _solidInsert } from "solid-js/web";
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

function pick(variant) {
  if (variant === "error") return "circle-ban-sign";
  if (variant === "warning") return "warning";
  if (variant === "success") return "circle-check";
  if (variant === "info") return "help";
}

function accentFor(variant) {
  if (variant === "error") return "var(--icon-critical-base)";
  if (variant === "warning") return "var(--icon-warning-active)";
  if (variant === "success") return "var(--icon-success-active)";
  if (variant === "info") return "var(--icon-info-active)";
}

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
