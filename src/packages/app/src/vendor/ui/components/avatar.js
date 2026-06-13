import { insert } from "../../../lib/reactivity.js";
const segmenter = typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : undefined;

function first(value) {
  if (!value) return "";
  if (!segmenter) return Array.from(value)[0] ?? "";
  return segmenter.segment(value)[Symbol.iterator]().next().value?.segment ?? Array.from(value)[0] ?? "";
}

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
    if (value === false || value === null) {
      el.removeAttribute(key);
    } else {
      el.setAttribute(key, String(value));
    }
  }
}

function applyStyle(el, style) {
  if (!style || typeof style !== "object") return;
  for (const key in style) {
    if (style[key] == null) continue;
    el.style.setProperty(key, String(style[key]));
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
    insert(parent, children);
    return;
  }
  parent.appendChild(document.createTextNode(String(children)));
}

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
