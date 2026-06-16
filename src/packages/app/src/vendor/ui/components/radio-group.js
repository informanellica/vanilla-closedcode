/** @file Vanilla RadioGroup component: a segmented single-select control built on native radio inputs with a sliding indicator, reimplementing @kobalte/core's RadioGroup a11y behavior. */
// Vanilla reimplementation of @kobalte/core's RadioGroup behavior (no external UI
// dependency). Derivative of @kobalte/core (MIT License,
// Copyright (c) 2024 jer3m01 <jer3m01@jer3m01.com>). See THIRD-PARTY-NOTICES.md.
import { createRenderEffect, createSignal, createUniqueId, onCleanup, splitProps } from "../../../lib/reactivity.js";

// Vanilla port of the original SegmentedControl wrapper (a segmented single-
// select radio group). No bs/ twin existed, so the a11y is built here:
//
//  * A real `<input type="radio">` per option, all sharing one `name`. The
//    browser's native radio-group semantics then provide roving focus and
//    arrow-key navigation (selection-follows-focus) for free — exactly what
//    the original RadioGroup delegates to. Inputs are visually clipped (see
//    radio-group.css) but remain focusable, so :focus-visible drives the
//    indicator's focus ring.
//  * role="radiogroup" + aria-orientation on the root; aria-checked /
//    data-checked / data-disabled on each input (the CSS keys off
//    [data-slot="radio-group-item-input"][data-checked] + label).
//  * A `<label for=inputId>` wraps each item's control, so clicking the
//    segment selects it (native label association).
//  * The sliding indicator is positioned with the original's exact algorithm:
//    width/height = selected item box, transform = translate(offsetLeft -
//    parentPaddingLeft, offsetTop - parentPaddingTop). Recomputed on selection
//    change and on resize (ResizeObserver), matching SegmentedControlIndicator.

// Resolve a possibly-reactive label value to DOM nodes (zero-arg accessors are
// unwrapped, arrays flattened, Nodes kept, the rest stringified).
/**
 * Resolve a possibly-reactive value into an array of DOM nodes: zero-arg
 * accessors are unwrapped, arrays flattened, Nodes kept, and other values
 * stringified into text nodes.
 * @param {*} value - The value to resolve (accessor function, array, Node, or primitive).
 * @returns {Array} The flattened array of resolved DOM nodes.
 */
function resolveNodes(value) {
  if (value == null || value === false || value === true) return [];
  if (typeof value === "function" && !value.length) return resolveNodes(value());
  if (Array.isArray(value)) return value.flatMap(resolveNodes);
  if (value instanceof Node) return [value];
  return [document.createTextNode(String(value))];
}

/**
 * Reactively render the result of an accessor into a parent, replacing its
 * children whenever the accessor's value changes.
 * @param {Node} parent - The parent node whose children are replaced.
 * @param {Function} read - Accessor returning the value to render.
 * @returns {void}
 */
function renderInto(parent, read) {
  createRenderEffect(() => {
    parent.replaceChildren(...resolveNodes(read()));
  });
}

/**
 * Segmented single-select radio group component. Builds one native
 * `<input type="radio">` per option (sharing a name for native roving focus and
 * arrow-key navigation), role="radiogroup" semantics, and a sliding indicator
 * that follows the selected item (repositioned on selection change and resize).
 * Supports both controlled (`current`) and uncontrolled (`defaultValue`) modes.
 * @param {Object} props - Component props.
 * @param {Array} props.options - The selectable option items.
 * @param {*} props.current - Controlled selected item; when provided, selection is controlled.
 * @param {*} props.defaultValue - Initial selected item for uncontrolled mode.
 * @param {Function} props.value - Maps an option item to its string value (defaults to String).
 * @param {Function} props.label - Maps an option item to its label content (defaults to String).
 * @param {Function} props.onSelect - Called with the chosen option item when selection changes.
 * @param {string} props.size - Size variant written to the data-size attribute.
 * @param {boolean} props.fill - When true, sets the data-fill attribute on the root.
 * @param {string} props.pad - Padding variant written to the data-pad attribute.
 * @param {string} props.class - Additional CSS class names for the root.
 * @param {Object} props.classList - Solid-style class toggle map for the root.
 * @returns {HTMLElement} The radiogroup root element.
 */
export function RadioGroup(props) {
  const [local, others] = splitProps(props, ["class", "classList", "options", "current", "defaultValue", "value", "label", "onSelect", "size", "fill", "pad"]);

  const name = `radio-group-${createUniqueId()}`;
  const getValue = item => (local.value ? local.value(item) : String(item));
  const getLabel = item => (local.label ? local.label(item) : String(item));
  const findOption = v => (local.options || []).find(opt => getValue(opt) === v);

  // Controlled when `current` is supplied; otherwise track internally, seeded
  // from defaultValue (the original createControllableSignal semantics).
  const controlled = () => local.current !== undefined && local.current !== null;
  const initial = local.current != null ? getValue(local.current) : local.defaultValue != null ? getValue(local.defaultValue) : undefined;
  const [internal, setInternal] = createSignal(initial);
  const selectedValue = () => (controlled() ? getValue(local.current) : internal());

  const commit = v => {
    if (!controlled()) setInternal(v);
    local.onSelect?.(findOption(v));
  };

  // Root: role=radiogroup with the size/pad/fill data attributes the CSS keys.
  const root = document.createElement("div");
  root.setAttribute("data-component", "radio-group");
  root.setAttribute("role", "radiogroup");
  root.setAttribute("aria-orientation", "horizontal");
  if (local.class) root.classList.add(...String(local.class).split(/\s+/).filter(Boolean));
  if (local.classList) {
    for (const cls in local.classList) {
      if (!cls || !local.classList[cls]) continue;
      root.classList.add(...cls.split(/\s+/).filter(Boolean));
    }
  }
  // Forward rest props (aria-label, id, ...) as attributes.
  for (const key in others) {
    if (key === "children") continue;
    const value = others[key];
    if (key.startsWith("on") && typeof value === "function") {
      root[key.toLowerCase()] = value;
      continue;
    }
    if (value == null || value === false) continue;
    root.setAttribute(key, value === true ? "" : String(value));
  }
  createRenderEffect(() => {
    root.setAttribute("data-size", local.size ?? "medium");
    root.setAttribute("data-pad", local.pad ?? "normal");
    if (local.fill) root.setAttribute("data-fill", "");
    else root.removeAttribute("data-fill");
  });

  const wrapper = document.createElement("div");
  wrapper.setAttribute("role", "presentation");
  wrapper.setAttribute("data-slot", "radio-group-wrapper");

  const indicator = document.createElement("div");
  indicator.setAttribute("data-slot", "radio-group-indicator");
  indicator.setAttribute("role", "presentation");

  const items = document.createElement("div");
  items.setAttribute("role", "presentation");
  items.setAttribute("data-slot", "radio-group-items");

  wrapper.appendChild(indicator);
  wrapper.appendChild(items);
  root.appendChild(wrapper);

  // Track the currently-selected item element so the indicator can follow it.
  const [selectedItem, setSelectedItem] = createSignal(undefined);

  // Position the indicator over the selected item, mirroring the original's
  // SegmentedControlIndicator.computeStyle/computeTransform exactly.
  let resizing = false;
  const computeStyle = () => {
    const element = selectedItem();
    if (!element || !element.parentElement) {
      indicator.style.width = "";
      indicator.style.height = "";
      indicator.style.transform = "";
      return;
    }
    const parentStyle = getComputedStyle(element.parentElement);
    const x = element.offsetLeft - Number.parseFloat(parentStyle.paddingLeft);
    const y = element.offsetTop - Number.parseFloat(parentStyle.paddingTop);
    indicator.style.width = `${element.offsetWidth}px`;
    indicator.style.height = `${element.offsetHeight}px`;
    indicator.style.transform = `translate(${x}px, ${y}px)`;
    indicator.style.transitionDuration = resizing ? "0ms" : "";
    indicator.toggleAttribute("data-resizing", resizing);
  };
  createRenderEffect(() => {
    // Re-run on selection change. First placement skips the slide animation
    // (resizing=true), like the original seeding the indicator without a transition.
    const hadStyle = indicator.style.transform !== "";
    selectedItem();
    resizing = !hadStyle;
    computeStyle();
    resizing = false;
  });
  if (typeof ResizeObserver !== "undefined") {
    const ro = new ResizeObserver(() => {
      resizing = true;
      computeStyle();
      resizing = false;
    });
    ro.observe(root);
    onCleanup(() => ro.disconnect());
  }

  // Build the option items. Options are static arrays at every call site, so a
  // single build pass mirrors the original (which rebuilt on each evaluation).
  // `byValue` lets one effect resolve the selected item element (the original sets
  // it per item; a single map keeps the indicator's anchor unambiguous).
  renderInto(items, () => {
    const opts = local.options || [];
    const byValue = new Map();
    const nodes = opts.map(option => {
      const optValue = getValue(option);
      const inputId = `${name}-${createUniqueId()}`;

      const item = document.createElement("div");
      item.setAttribute("data-slot", "radio-group-item");
      item.setAttribute("data-value", optValue);
      byValue.set(optValue, item);

      const input = document.createElement("input");
      input.type = "radio";
      input.name = name;
      input.value = optValue;
      input.id = inputId;
      input.setAttribute("data-slot", "radio-group-item-input");

      const labelEl = document.createElement("label");
      labelEl.setAttribute("data-slot", "radio-group-item-label");
      labelEl.setAttribute("for", inputId);

      const control = document.createElement("span");
      control.setAttribute("data-slot", "radio-group-item-control");
      renderInto(control, () => getLabel(option));
      labelEl.appendChild(control);

      // Native radio change drives selection; arrow-key roving focus is the
      // browser's built-in radio-group behavior (selection follows focus).
      input.addEventListener("change", () => {
        if (input.checked) commit(optValue);
      });

      // Reflect selection -> checked + data-checked/aria-checked.
      createRenderEffect(() => {
        const selected = selectedValue() === optValue;
        input.checked = selected;
        input.toggleAttribute("data-checked", selected);
        input.setAttribute("aria-checked", selected ? "true" : "false");
      });

      item.appendChild(input);
      item.appendChild(labelEl);
      return item;
    });

    // Single effect maps the selected value to its item element (the indicator
    // anchor), owned by this rebuild so stale items are dropped on re-render.
    createRenderEffect(() => {
      setSelectedItem(byValue.get(selectedValue()));
    });
    return nodes;
  });

  return root;
}
