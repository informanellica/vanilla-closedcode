import { Icon } from "@/bs/icon.js";

const VARIANT_CLASS = {
  primary: "btn-primary",
  secondary: "btn-outline-secondary",
  ghost: "btn-link",
  critical: "btn-danger"
};

const SIZE_CLASS = {
  small: "btn-sm",
  large: "btn-lg"
};

function getClassList(classList, variantClass, sizeClass, extraClass) {
  const classes = { ...classList };
  classes.btn = true;
  classes[variantClass] = true;
  if (sizeClass) classes[sizeClass] = true;
  classes["d-inline-flex align-items-center gap-1"] = true;
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
    target.push(value);
    return;
  }
  target.push(document.createTextNode(String(value)));
}

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

  for (const key in props) {
    if (key !== "variant" && key !== "size" && key !== "icon" &&
        key !== "class" && key !== "classList" && key !== "children") {
      const value = props[key];
      if (/^on[A-Z]/.test(key) && typeof value === "function") {
        button.addEventListener(key.slice(2).toLowerCase(), value);
      } else if (value != null && value !== false) {
        button.setAttribute(key, value === true ? "" : String(value));
      }
    }
  }

  children.forEach(child => button.appendChild(child));

  return button;
}
