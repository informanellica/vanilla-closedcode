/** @file Bootstrap-styled native <select> component with optional grouping, placeholder, and highlight tracking. */
import { pipe, groupBy, entries, map } from "remeda";

/**
 * Native select component rendering options (optionally grouped via optgroups) with a current value,
 * placeholder, and selection/highlight callbacks.
 * @param {Object} props - Component config. Key props: options (Array of items), value (item->key), label/children (item->label text), current (selected item), placeholder, groupBy (item->group label), valueClass/class/classList, triggerStyle/triggerVariant/triggerProps, size ("small"/"normal"/"large"), variant, disabled, and the onSelect/onHighlight/onOpenChange callbacks. Unknown props are spread onto the element.
 * @returns {HTMLSelectElement} The rendered select element.
 */
export function Select(props) {
  const [local, others] = splitProps(props, ["class", "classList", "placeholder", "options", "current", "value", "label", "groupBy", "valueClass", "onSelect", "onHighlight", "onOpenChange", "children", "triggerStyle", "triggerVariant", "triggerProps", "size", "variant", "disabled"]);
  const state = {
    key: undefined,
    cleanup: undefined
  };
  /**
   * Run and clear any active highlight cleanup, resetting the highlighted key.
   * @returns {void}
   */
  const stop = () => {
    state.cleanup?.();
    state.cleanup = undefined;
    state.key = undefined;
  };
  /**
   * Compute the identity key for an item (via the value prop, else the item itself).
   * @param {*} item - The option item.
   * @returns {*} The item's key.
   */
  const keyFor = item => local.value ? local.value(item) : item;
  /**
   * Compute the display label for an item (children, then label prop, then the item itself).
   * @param {*} item - The option item.
   * @returns {*} The label text.
   */
  const labelFor = item => local.children ? local.children(item) : local.label ? local.label(item) : item;
  /**
   * Highlight an item, invoking onHighlight and tracking its cleanup; clears the highlight for nullish input.
   * @param {*} item - The item to highlight, or null/undefined to clear.
   * @returns {void}
   */
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

  const optionsList = local.options ?? [];
  const flatOptions = optionsList;
  const groupedOptions = pipe(optionsList, groupBy(x => local.groupBy ? local.groupBy(x) : ""), entries(), map(([category, options]) => ({
    category,
    options
  })));
  const hasGroups = local.groupBy && groupedOptions.some(g => g.category !== "");
  const currentKeyVal = local.current === undefined || local.current === null ? undefined : keyFor(local.current);
  /**
   * Find the index of the flat option whose key matches the given key.
   * @param {*} key - The key to look up.
   * @returns {number} The matching index, or -1 when not found.
   */
  const indexOfKey = key => flatOptions.findIndex(item => keyFor(item) === key);

  /**
   * Change handler: map the selected DOM index back to an option item and invoke onSelect.
   * @param {Event} e - The native change event.
   * @returns {void}
   */
  const onChange = e => {
    const idx = e.currentTarget.selectedIndex;
    const offset = hasPlaceholderOption() ? 1 : 0;
    const item = flatOptions[idx - offset];
    if (item === undefined) {
      local.onSelect?.(undefined);
    } else {
      local.onSelect?.(item);
    }
    stop();
  };

  /**
   * Whether a disabled placeholder option should be prepended (no current selection and a placeholder is set).
   * @returns {boolean} True when a placeholder option is shown.
   */
  const hasPlaceholderOption = () => currentKeyVal === undefined && !!local.placeholder;

  const el = document.createElement("select");
  el.setAttribute("data-component", "select");

  spread(el, mergeProps(others, local.triggerProps, {
    ["data-trigger-style"]: local.triggerVariant,
    ["data-size"]: local.size || "normal",
    ["data-variant"]: local.variant || "secondary",
    style: local.triggerStyle,
    classList: {
      ...local.classList,
      "form-select": true,
      "form-select-sm": local.size === "small",
      "form-select-lg": local.size === "large",
      [local.valueClass ?? ""]: !!local.valueClass,
      [local.class ?? ""]: !!local.class
    }
  }));

  el.addEventListener("change", onChange);
  el.addEventListener("focus", () => local.onOpenChange?.(true));
  el.addEventListener("blur", () => {
    local.onOpenChange?.(false);
    stop();
  });

  if (local.disabled) {
    el.disabled = true;
  }

  const placeholderOpt = hasPlaceholderOption() ? (() => {
    const opt = document.createElement("option");
    opt.value = "";
    opt.disabled = true;
    opt.textContent = local.placeholder;
    return opt;
  })() : null;

  if (placeholderOpt) {
    el.appendChild(placeholderOpt);
  }

  if (hasGroups) {
    groupedOptions.forEach(group => {
      const optgroup = document.createElement("optgroup");
      optgroup.label = group.category;
      group.options.forEach(item => {
        optgroup.appendChild(createOptionElement(item, keyFor, labelFor, currentKeyVal, move));
      });
      el.appendChild(optgroup);
    });
  } else {
    flatOptions.forEach(item => {
      el.appendChild(createOptionElement(item, keyFor, labelFor, currentKeyVal, move));
    });
  }

  const offset = hasPlaceholderOption() ? 1 : 0;
  const idx = indexOfKey(currentKeyVal);
  el.selectedIndex = idx < 0 ? 0 : idx + offset;

  return el;
}

/**
 * Build an <option> element for an item, wiring its value, label, selected state, and pointer-enter highlight.
 * @param {*} item - The option item.
 * @param {Function} keyFor - Maps an item to its identity key.
 * @param {Function} labelFor - Maps an item to its label text.
 * @param {*} currentKeyVal - The key of the currently selected item (for marking selected).
 * @param {Function} move - Highlight callback invoked on pointerenter.
 * @returns {HTMLOptionElement} The option element.
 */
function createOptionElement(item, keyFor, labelFor, currentKeyVal, move) {
  const opt = document.createElement("option");
  opt.addEventListener("pointerenter", () => move(item));
  const key = keyFor(item);
  opt.value = typeof key === "string" ? key : String(key ?? "");
  if (keyFor(item) === currentKeyVal) {
    opt.selected = true;
  }
  opt.textContent = labelFor(item);
  return opt;
}

/**
 * Partition props into a "local" object (keys listed) and an "others" object (the rest).
 * @param {Object} props - The source props.
 * @param {Array} keys - The prop names to route into the local object.
 * @returns {Array} A two-element array [local, others].
 */
function splitProps(props, keys) {
  const local = {};
  const others = {};
  for (const key in props) {
    if (keys.includes(key)) {
      local[key] = props[key];
    } else {
      others[key] = props[key];
    }
  }
  return [local, others];
}

/**
 * Shallow-merge multiple prop sources into one object (later sources win); falsy sources are skipped.
 * @param {...Object} sources - The prop objects to merge.
 * @returns {Object} The merged object.
 */
function mergeProps(...sources) {
  const target = {};
  sources.forEach(source => {
    if (!source) return;
    for (const key in source) {
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        target[key] = source[key];
      }
    }
  });
  return target;
}

/**
 * Apply a props object onto an element: style objects, classList groups, on* event listeners, and
 * property/attribute assignments (matching Solid's spread semantics).
 * @param {HTMLElement} el - The target element.
 * @param {Object} props - The props to apply.
 * @returns {void}
 */
function spread(el, props) {
  if (!props) return;
  for (const key in props) {
    const value = props[key];
    if (key === "style" && value && typeof value === "object") {
      Object.assign(el.style, value);
    } else if (key === "classList" && value && typeof value === "object") {
      for (const cls in value) {
        if (!value[cls]) continue;
        // keys may contain multiple space-separated classes (Solid contract)
        el.classList.add(...cls.split(/\s+/).filter(Boolean));
      }
    } else if (key.startsWith("on")) {
      const eventName = key.toLowerCase().slice(2);
      el.addEventListener(eventName, value);
    } else if (el.hasOwnProperty(key) || typeof el[key] !== "function") {
      el[key] = value;
    } else {
      el.setAttribute(key, value);
    }
  }
}
