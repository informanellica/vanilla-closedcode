import { createMemo, createRenderEffect, mergeProps, onCleanup, splitProps } from "solid-js";
import { pipe, groupBy, entries, map } from "remeda";

// Vanilla port of the Kobalte Select wrapper. Kobalte previously owned the
// listbox (trigger + portaled positioned content + arrow/typeahead/Esc
// navigation, highlight tracking, grouping). This mirrors the bs/select.js
// house technique: a native `<select>` element, which provides the full
// listbox a11y surface for free — keyboard arrow navigation, type-ahead,
// Escape-to-close, screen-reader semantics, and native option grouping via
// <optgroup>. The exported compound API (options/current/value/label/groupBy/
// onSelect/onHighlight/onOpenChange/placeholder/trigger*) is preserved exactly.

function applyClassList(el, classList) {
  if (!classList) return;
  for (const cls in classList) {
    if (!cls || !classList[cls]) continue;
    const tokens = cls.split(/\s+/).filter(Boolean);
    if (tokens.length) el.classList.add(...tokens);
  }
}

function applyStyle(el, style) {
  if (style == null) return;
  if (typeof style === "string") {
    el.style.cssText = style;
    return;
  }
  for (const [key, value] of Object.entries(style)) {
    if (value == null) continue;
    if (key.startsWith("--")) el.style.setProperty(key, String(value));
    else el.style[key] = value;
  }
}

// Forward arbitrary rest/trigger props onto the select element (handlers bound
// directly, attributes set; mirrors bs/select's spread()).
function applyProps(el, props) {
  if (!props) return;
  for (const key in props) {
    const value = props[key];
    if (key === "style" && value && typeof value === "object") {
      Object.assign(el.style, value);
    } else if (key === "classList" && value && typeof value === "object") {
      applyClassList(el, value);
    } else if (key.startsWith("on") && typeof value === "function") {
      el.addEventListener(key.toLowerCase().slice(2), value);
    } else if (value === undefined) {
      continue;
    } else if (key in el && !key.includes("-")) {
      try {
        el[key] = value;
      } catch {
        el.setAttribute(key, String(value));
      }
    } else if (value === false || value === null) {
      el.removeAttribute(key);
    } else {
      el.setAttribute(key, value === true ? "" : String(value));
    }
  }
}

function createOptionElement(item, keyFor, labelFor, move) {
  const opt = document.createElement("option");
  opt.setAttribute("data-slot", "select-select-item");
  opt.addEventListener("pointerenter", () => move(item));
  const key = keyFor(item);
  opt.value = typeof key === "string" ? key : String(key ?? "");
  opt.textContent = labelFor(item);
  return opt;
}

export function Select(props) {
  const [local, others] = splitProps(props, ["class", "classList", "placeholder", "options", "current", "value", "label", "groupBy", "valueClass", "onSelect", "onHighlight", "onOpenChange", "children", "triggerStyle", "triggerVariant", "triggerProps", "size", "variant", "disabled"]);

  // Highlight tracking (onHighlight returns an optional cleanup), identical to
  // the Kobalte wrapper's move()/stop() bookkeeping.
  const state = { key: undefined, cleanup: undefined };
  const stop = () => {
    state.cleanup?.();
    state.cleanup = undefined;
    state.key = undefined;
  };
  const keyFor = item => (local.value ? local.value(item) : item);
  const labelFor = item => (local.children ? local.children(item) : local.label ? local.label(item) : item);
  const move = item => {
    if (!local.onHighlight) return;
    if (item === undefined || item === null) {
      stop();
      return;
    }
    const key = keyFor(item);
    if (state.key === key) return;
    state.cleanup?.();
    state.cleanup = local.onHighlight(item);
    state.key = key;
  };
  onCleanup(stop);

  const grouped = createMemo(() =>
    pipe(local.options ?? [], groupBy(x => (local.groupBy ? local.groupBy(x) : "")), entries(), map(([category, options]) => ({ category, options }))));

  const flatOptions = () => local.options ?? [];
  const currentKey = () => (local.current === undefined || local.current === null ? undefined : keyFor(local.current));
  const hasPlaceholderOption = () => currentKey() === undefined && !!local.placeholder;
  const hasGroups = () => !!local.groupBy && grouped().some(g => g.category !== "");

  const el = document.createElement("select");
  el.setAttribute("data-component", "select");
  el.setAttribute("data-slot", "select-select-trigger");

  applyProps(el, mergeProps(others, local.triggerProps));
  if (local.triggerStyle != null) applyStyle(el, local.triggerStyle);

  // class / classList re-applied reactively (variant-driven trigger styling).
  createRenderEffect(() => {
    el.setAttribute("data-trigger-style", local.triggerVariant ?? "");
    el.setAttribute("data-size", local.size || "normal");
    el.setAttribute("data-variant", local.variant || "secondary");
  });
  applyClassList(el, {
    ...local.classList,
    [local.valueClass ?? ""]: !!local.valueClass,
    [local.class ?? ""]: !!local.class
  });

  // onChange: resolve the chosen option (accounting for a leading placeholder
  // option) and emit onSelect, exactly like bs/select.
  el.addEventListener("change", () => {
    const offset = hasPlaceholderOption() ? 1 : 0;
    const item = flatOptions()[el.selectedIndex - offset];
    local.onSelect?.(item === undefined ? undefined : item);
    stop();
  });
  // Native select open/close maps to focus/blur (onOpenChange).
  el.addEventListener("focus", () => local.onOpenChange?.(true));
  el.addEventListener("blur", () => {
    local.onOpenChange?.(false);
    stop();
  });

  // Disabled is a live prop in the Kobalte wrapper (forwarded from props).
  createRenderEffect(() => {
    el.disabled = !!local.disabled;
  });

  // Placeholder shown only when nothing is selected (disabled sentinel option).
  if (hasPlaceholderOption()) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.disabled = true;
    opt.textContent = local.placeholder;
    el.appendChild(opt);
  }

  if (hasGroups()) {
    grouped().forEach(group => {
      const optgroup = document.createElement("optgroup");
      optgroup.label = group.category;
      optgroup.setAttribute("data-slot", "select-section");
      group.options.forEach(item => optgroup.appendChild(createOptionElement(item, keyFor, labelFor, move)));
      el.appendChild(optgroup);
    });
  } else {
    flatOptions().forEach(item => el.appendChild(createOptionElement(item, keyFor, labelFor, move)));
  }

  // Selected index follows `current` reactively (controlled value stays live).
  createRenderEffect(() => {
    const key = currentKey();
    const offset = hasPlaceholderOption() ? 1 : 0;
    const idx = flatOptions().findIndex(item => keyFor(item) === key);
    el.selectedIndex = idx < 0 ? 0 : idx + offset;
  });

  return el;
}
