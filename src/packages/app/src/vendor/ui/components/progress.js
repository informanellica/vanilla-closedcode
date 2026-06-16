/** @file Vanilla Progress component: renders a progress bar with optional label/value header and ARIA value attributes. */
import { insert } from "../../../lib/reactivity.js";
/**
 * Split a props object into a [selected, rest] pair by key list.
 * @param {Object} props - The source props object.
 * @param {Array} keys - Keys to pull into the first (selected) object.
 * @returns {Array} A two-element array: [picked props, remaining props].
 */
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

/**
 * Apply a Solid-style classList map to an element, toggling each class on/off.
 * Space-separated multi-class keys are split into individual tokens.
 * @param {HTMLElement} el - The element to mutate.
 * @param {Object} classList - Map of class name (or space-separated names) to truthy/falsy.
 * @returns {void}
 */
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

/**
 * Apply remaining (non-class/children) props onto an element as DOM properties,
 * event handlers, or attributes. Event handlers (keys starting with "on") are
 * bound as lowercased DOM event properties; class/classList/children are skipped.
 * @param {HTMLElement} el - The element to mutate.
 * @param {Object} rest - The passthrough props.
 * @returns {void}
 */
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

/**
 * Recursively append Solid-style children to a parent: arrays are flattened,
 * Nodes appended directly, functions tracked reactively via insert(), and other
 * values stringified into text nodes.
 * @param {Node} parent - The parent node to append into.
 * @param {*} children - The children value (Node, array, function, primitive, or nullish).
 * @returns {void}
 */
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

/**
 * Compute a clamped 0-100 percentage from a value and its maximum.
 * @param {number} value - The current value.
 * @param {number} maxValue - The maximum value (must be greater than 0).
 * @returns {number} The percentage in [0, 100], or null if inputs are invalid.
 */
function percentage(value, maxValue) {
  if (typeof value !== "number" || typeof maxValue !== "number" || maxValue <= 0) return null;
  return Math.max(0, Math.min(100, (value / maxValue) * 100));
}

/**
 * Progress bar component. Renders a track with a fill sized to value/maxValue,
 * an optional header (label and/or percentage value label), and ARIA value
 * attributes (aria-valuenow/min/max) for accessibility.
 * @param {Object} props - Component props.
 * @param {*} props.children - Optional label content rendered in the header.
 * @param {string} props.class - Additional CSS class names for the root.
 * @param {Object} props.classList - Solid-style class toggle map for the root.
 * @param {boolean} props.hideLabel - When true, visually hides the label (sr-only).
 * @param {boolean} props.showValueLabel - When true, renders the percentage value label.
 * @param {number} props.value - The current progress value (passed through as a rest prop).
 * @param {number} props.maxValue - The maximum progress value (passed through as a rest prop).
 * @returns {HTMLElement} The progress root element.
 */
export function Progress(props) {
  const [local, others] = splitProps(props, ["children", "class", "classList", "hideLabel", "showValueLabel"]);
  const root = document.createElement("div");
  const track = document.createElement("div");
  const fill = document.createElement("div");

  root.setAttribute("data-component", "progress");
  if (local.class) root.classList.add(...String(local.class).split(/\s+/).filter(Boolean));
  applyClassList(root, local.classList);
  applyRestProps(root, others);

  if (local.children || local.showValueLabel) {
    const header = document.createElement("div");
    header.setAttribute("data-slot", "progress-header");

    if (local.children) {
      const label = document.createElement("div");
      label.setAttribute("data-slot", "progress-label");
      if (local.hideLabel) label.classList.add("sr-only");
      appendChildren(label, local.children);
      header.appendChild(label);
    }

    if (local.showValueLabel) {
      const valueLabel = document.createElement("div");
      valueLabel.setAttribute("data-slot", "progress-value-label");
      const value = typeof others.value === "number" ? others.value : null;
      const maxValue = typeof others.maxValue === "number" ? others.maxValue : null;
      const pct = percentage(value, maxValue);
      valueLabel.textContent = pct == null ? "" : `${Math.round(pct)}%`;
      header.appendChild(valueLabel);
    }

    root.appendChild(header);
  }

  track.setAttribute("data-slot", "progress-track");
  fill.setAttribute("data-slot", "progress-fill");
  track.appendChild(fill);
  root.appendChild(track);

  const value = typeof others.value === "number" ? others.value : null;
  const maxValue = typeof others.maxValue === "number" ? others.maxValue : null;
  const pct = percentage(value, maxValue);
  if (pct == null) {
    root.removeAttribute("aria-valuenow");
  } else {
    root.setAttribute("aria-valuenow", String(value));
    root.setAttribute("aria-valuemin", "0");
    root.setAttribute("aria-valuemax", String(maxValue));
  }
  fill.style.width = pct == null ? "" : `${pct}%`;

  return root;
}
