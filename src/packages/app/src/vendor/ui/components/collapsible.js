import { Collapsible as Kobalte } from "@kobalte/core/collapsible";
import { createComponent, createRenderEffect, mergeProps, splitProps } from "solid-js";
import { Icon } from "./icon.js";

// Thin Kobalte wrappers: tag each part with a data attribute and fold the
// `class` prop into `classList` (live via splitProps getters). Defaults come
// first in mergeProps so caller-supplied props still win, exactly like the
// compiled output.
function CollapsibleRoot(props) {
  const [local, others] = splitProps(props, ["class", "classList", "variant"]);
  return createComponent(Kobalte, mergeProps({
    "data-component": "collapsible",
    get ["data-variant"]() {
      return local.variant || "normal";
    },
    get classList() {
      return {
        ...local.classList,
        [local.class ?? ""]: !!local.class
      };
    }
  }, others));
}
function CollapsibleTrigger(props) {
  return createComponent(Kobalte.Trigger, mergeProps({
    "data-slot": "collapsible-trigger"
  }, props));
}
function CollapsibleContent(props) {
  return createComponent(Kobalte.Content, mergeProps({
    "data-slot": "collapsible-content"
  }, props));
}

// Apply a Solid-style `style` prop (string or object) to an element.
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

// classList keys may hold several space-separated class names (Solid allows
// `{"a b": true}`); toggle each one.
function toggleClassKey(el, key, value) {
  for (const name of key.trim().split(/\s+/)) {
    if (name) el.classList.toggle(name, value);
  }
}

function CollapsibleArrow(props) {
  const el = document.createElement("div");
  el.setAttribute("data-slot", "collapsible-arrow");
  const iconWrap = document.createElement("span");
  iconWrap.setAttribute("data-slot", "collapsible-arrow-icon");
  el.appendChild(iconWrap);
  iconWrap.appendChild(createComponent(Icon, {
    name: "chevron-down",
    size: "small"
  }));

  // Mirror the compiled spread(): listeners and ref attach once, everything
  // else re-applies reactively. `children` is skipped (skipChildren was true).
  const rest = props || {};
  for (const key in rest) {
    if (/^on[A-Z]/.test(key) && typeof rest[key] === "function") {
      el.addEventListener(key.slice(2).toLowerCase(), rest[key]);
    }
  }
  let prevClassList;
  createRenderEffect(() => {
    for (const key in rest) {
      if (key === "children" || key === "ref" || /^on[A-Z]/.test(key)) continue;
      const value = rest[key];
      if (key === "class" || key === "className") {
        el.className = value ?? "";
      } else if (key === "classList") {
        const next = value || {};
        for (const name of Object.keys(prevClassList || {})) {
          if (!(name in next)) toggleClassKey(el, name, false);
        }
        for (const name of Object.keys(next)) toggleClassKey(el, name, !!next[name]);
        prevClassList = next;
      } else if (key === "style") {
        applyStyle(el, value);
      } else if (value == null || value === false) {
        el.removeAttribute(key);
      } else {
        el.setAttribute(key, value === true ? "" : String(value));
      }
    }
  });
  if (typeof rest.ref === "function") rest.ref(el);
  return el;
}
export const Collapsible = Object.assign(CollapsibleRoot, {
  Arrow: CollapsibleArrow,
  Trigger: CollapsibleTrigger,
  Content: CollapsibleContent
});
