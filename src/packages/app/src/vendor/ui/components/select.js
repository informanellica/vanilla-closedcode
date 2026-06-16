/** @file Vanilla Select component: wraps a native `<select>` (with optgroup support) to provide listbox behavior, reimplementing @kobalte/core's Select API while preserving its compound prop surface. */
// Vanilla reimplementation of @kobalte/core's Select behavior (no external UI
// dependency). Derivative of @kobalte/core (MIT License,
// Copyright (c) 2024 jer3m01 <jer3m01@jer3m01.com>). See THIRD-PARTY-NOTICES.md.
import { createMemo, createRenderEffect, mergeProps, onCleanup, splitProps } from "../../../lib/reactivity.js";
import { pipe, groupBy, entries, map } from "remeda";

// Vanilla port of the original Select wrapper. The original previously owned the
// listbox (trigger + portaled positioned content + arrow/typeahead/Esc
// navigation, highlight tracking, grouping). This mirrors the bs/select.js
// house technique: a native `<select>` element, which provides the full
// listbox a11y surface for free — keyboard arrow navigation, type-ahead,
// Escape-to-close, screen-reader semantics, and native option grouping via
// <optgroup>. The exported compound API (options/current/value/label/groupBy/
// onSelect/onHighlight/onOpenChange/placeholder/trigger*) is preserved exactly.

/**
 * Add classes from a Solid-style classList map to an element (truthy entries
 * only). Space-separated multi-class keys are split into individual tokens.
 * @param {HTMLElement} el - The element to mutate.
 * @param {Object} classList - Map of class name (or space-separated names) to truthy/falsy.
 * @returns {void}
 */
function applyClassList(el, classList) {
  if (!classList) return;
  for (const cls in classList) {
    if (!cls || !classList[cls]) continue;
    const tokens = cls.split(/\s+/).filter(Boolean);
    if (tokens.length) el.classList.add(...tokens);
  }
}

/**
 * Apply a Solid-style `style` prop (string or object) to an element.
 * @param {HTMLElement} el - The element to mutate.
 * @param {(string|Object)} style - CSS text string, or a map of style properties (`--` custom props supported).
 * @returns {void}
 */
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
/**
 * Forward arbitrary props onto an element: style/classList handled specially,
 * "on*" handlers bound as event listeners, and the remainder set as DOM
 * properties or attributes (falling back to setAttribute when a property assignment throws).
 * @param {HTMLElement} el - The element to mutate.
 * @param {Object} props - The props to apply.
 * @returns {void}
 */
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

/**
 * Build an `<option>` element for an item, wiring its value, label text, and a
 * pointerenter handler that highlights the item.
 * @param {*} item - The source option item.
 * @param {Function} keyFor - Maps an item to its option value/key.
 * @param {Function} labelFor - Maps an item to its display label text.
 * @param {Function} move - Highlight callback invoked with the item on pointerenter.
 * @returns {HTMLOptionElement} The constructed option element.
 */
function createOptionElement(item, keyFor, labelFor, move) {
  const opt = document.createElement("option");
  opt.setAttribute("data-slot", "select-select-item");
  opt.addEventListener("pointerenter", () => move(item));
  const key = keyFor(item);
  opt.value = typeof key === "string" ? key : String(key ?? "");
  opt.textContent = labelFor(item);
  return opt;
}

/**
 * Native-backed select component. Renders a `<select>` (with `<optgroup>`
 * grouping when groupBy is supplied and an optional disabled placeholder
 * option), keeps the selected index in sync with the controlled `current`
 * value, and emits onSelect/onOpenChange/onHighlight as the user navigates and
 * chooses. Highlight tracking supports an onHighlight cleanup callback.
 * @param {Object} props - Component props.
 * @param {Array} props.options - The selectable items.
 * @param {*} props.current - The controlled selected item.
 * @param {Function} props.value - Maps an item to its option value/key.
 * @param {Function} props.label - Maps an item to its label text (used when children is absent).
 * @param {Function} props.children - Maps an item to its label text (takes precedence over label).
 * @param {Function} props.groupBy - Maps an item to a group category for optgroup grouping.
 * @param {string} props.placeholder - Placeholder text shown as a disabled option when nothing is selected.
 * @param {Function} props.onSelect - Called with the chosen item on change.
 * @param {Function} props.onHighlight - Called with the highlighted item; may return a cleanup function.
 * @param {Function} props.onOpenChange - Called with true/false on focus/blur of the select.
 * @param {boolean} props.disabled - Whether the select is disabled (reactive).
 * @param {string} props.size - Size variant written to the data-size attribute.
 * @param {string} props.variant - Style variant written to the data-variant attribute.
 * @param {string} props.triggerVariant - Trigger style variant written to data-trigger-style.
 * @param {(string|Object)} props.triggerStyle - Inline style applied to the select.
 * @param {Object} props.triggerProps - Extra props merged onto the select.
 * @param {string} props.class - Additional CSS class names for the select.
 * @param {string} props.valueClass - Additional CSS class names applied alongside class.
 * @param {Object} props.classList - Solid-style class toggle map for the select.
 * @returns {HTMLSelectElement} The select element.
 */
export function Select(props) {
  const [local, others] = splitProps(props, ["class", "classList", "placeholder", "options", "current", "value", "label", "groupBy", "valueClass", "onSelect", "onHighlight", "onOpenChange", "children", "triggerStyle", "triggerVariant", "triggerProps", "size", "variant", "disabled"]);

  // Highlight tracking (onHighlight returns an optional cleanup), identical to
  // the original wrapper's move()/stop() bookkeeping.
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

  // Disabled is a live prop in the original wrapper (forwarded from props).
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
