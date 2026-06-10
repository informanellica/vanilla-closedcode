import { Icon } from "./icon.js";

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
