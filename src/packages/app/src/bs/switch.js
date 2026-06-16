/** @file Bootstrap form-switch (toggle) component (vanilla reimplementation). */

/**
 * Renders a Bootstrap toggle switch: a checkbox input styled as a switch with
 * an associated label.
 * @param {Object} props - Component props. Recognized keys: `checked` (boolean
 *   initial state), `disabled` (boolean), `class` (extra CSS classes on the
 *   container), `hideLabel` (boolean; visually hides the label), `children`
 *   (label content; Node, function, array, or primitive), `onChange` (called
 *   with the new boolean checked state), `style` (object applied to the
 *   container), and any other `on*` handler or attribute applied to the
 *   container.
 * @returns {HTMLElement} The container `<div>` holding the input and label.
 */
export function Switch(props) {
  const container = document.createElement("div");
  container.setAttribute("data-component", "switch");

  const input = document.createElement("input");
  input.type = "checkbox";
  input.role = "switch";
  input.className = "form-check-input";
  input.dataset.slot = "input";

  const label = document.createElement("label");
  label.className = "form-check-label";
  label.dataset.slot = "label";

  const id = container.id;

  container.className = `form-check form-switch ${props.class ?? ""}`.trim();

  if (props.checked) input.checked = true;
  if (props.disabled) input.disabled = true;
  input.id = id;
  label.htmlFor = id;

  if (props.hideLabel) {
    label.classList.add("visually-hidden");
  }

  if (props.children != null && props.children !== false && props.children !== true) {
    const node = typeof props.children === "function" ? props.children() : props.children;
    if (Array.isArray(node)) {
      for (const item of node) label.appendChild(item instanceof Node ? item : document.createTextNode(String(item)));
    } else {
      label.appendChild(node instanceof Node ? node : document.createTextNode(String(node)));
    }
  }

  input.addEventListener("change", e => {
    props.onChange?.(e.currentTarget.checked);
  });

  Object.keys(props).forEach(key => {
    if (key === "class" || key === "classList") return;
    // onChange is wired to the INPUT above with the boolean value — adding it
    // again here (bubbled change Event on the container) double-fired every
    // toggle (net no-op for boolean setters, Event object for the rest).
    if (key === "onChange") return;
    if (/^on[A-Z]/.test(key)) {
      const eventName = key.charAt(2).toLowerCase() + key.slice(3);
      const handler = props[key];
      if (typeof handler === "function") container.addEventListener(eventName, handler);
      return;
    }
    const value = props[key];
    if (value !== undefined && value !== null && value !== false) {
      if (key === "style" && typeof value === "object") {
        Object.assign(container.style, value);
      } else {
        container.setAttribute(key, value === true ? "" : value);
      }
    }
  });

  container.appendChild(input);
  container.appendChild(label);

  return container;
}
