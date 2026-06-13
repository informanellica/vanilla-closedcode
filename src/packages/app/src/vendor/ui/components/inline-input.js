import { createRenderEffect } from "../../../lib/reactivity.js";
import { splitProps } from "../../../lib/reactivity.js";

function applyStyle(el, style) {
  if (style == null) {
    el.removeAttribute("style");
    return;
  }
  if (typeof style === "string") {
    el.style.cssText = style;
    return;
  }
  el.removeAttribute("style");
  for (const [key, value] of Object.entries(style)) {
    if (value == null) continue;
    if (key.startsWith("--")) el.style.setProperty(key, String(value));
    else el.style[key] = value;
  }
}

export function InlineInput(props) {
  const [local, others] = splitProps(props, ["class", "width", "style"]);
  const style = () => {
    if (!local.style) return {
      width: local.width
    };
    if (typeof local.style === "string") {
      if (!local.width) return local.style;
      return `${local.style};width:${local.width}`;
    }
    if (!local.width) return local.style;
    return {
      ...local.style,
      width: local.width
    };
  };
  const el = document.createElement("input");
  el.dataset.component = "inline-input";

  // Solid's splitProps keeps getters live; mirror the compiled spread():
  // listeners once, everything else re-applied reactively.
  for (const key in others) {
    if (/^on[A-Z]/.test(key) && typeof others[key] === "function") {
      el.addEventListener(key.slice(2).toLowerCase(), others[key]);
    }
  }
  createRenderEffect(() => {
    el.className = local.class ?? "";
  });
  createRenderEffect(() => {
    applyStyle(el, style());
  });
  createRenderEffect(() => {
    for (const key in others) {
      if (/^on[A-Z]/.test(key)) continue;
      const value = others[key];
      if (key === "value") {
        const next = value == null ? "" : String(value);
        if (el.value !== next) el.value = next;
        continue;
      }
      if (key === "ref") {
        continue;
      }
      if (value == null || value === false) el.removeAttribute(key);
      else el.setAttribute(key, value === true ? "" : String(value));
    }
  });
  if (typeof others.ref === "function") others.ref(el);
  return el;
}
