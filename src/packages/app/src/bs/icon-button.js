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
  element.dataset.icon = props.icon;
  element.dataset.size = props.size || "normal";
  element.dataset.variant = props.variant || "secondary";

  const variant = props.variant || "secondary";
  const variantClass = variant === "ghost" ? "btn-link" : `btn-outline-${variant}`;
  const sizeClass = props.size === "large" ? "btn-lg" : "btn-sm";

  element.className = getClassList(props.classList || {}, variantClass, sizeClass, props.class);

  if (props.icon) {
    const iconEl = Icon({ name: props.icon, size: props.iconSize ?? (props.size === "large" ? "normal" : "small") });
    element.appendChild(iconEl);
  }

  appendChildValue(element, props.children);

  for (const key in props) {
    if (key !== "icon" && key !== "variant" && key !== "size" &&
        key !== "iconSize" && key !== "as" && key !== "class" && key !== "classList") {
      const value = props[key];
      if (/^on[A-Z]/.test(key) && typeof value === "function") {
        element.addEventListener(key.slice(2).toLowerCase(), value);
      } else if (value != null && value !== false) {
        element.setAttribute(key, value === true ? "" : String(value));
      }
    }
  }

  return element;
}
