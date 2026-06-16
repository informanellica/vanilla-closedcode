/** @file Keybind component: a styled <span> wrapper for displaying keyboard shortcut hints. */

/**
 * Split a props object into the selected keys and the remaining rest props.
 *
 * @param {Object} props - The source props object.
 * @param {Array} keys - Key names to extract into the first result.
 * @returns {Array} A two-element array: [picked props, rest props].
 */
function splitProps(props, keys) {
  const split = {};
  const rest = {};
  for (const key in props) {
    if (keys.includes(key)) split[key] = props[key];
    else rest[key] = props[key];
  }
  return [split, rest];
}

/**
 * Apply a Solid-style classList ({ "a b": true, c: false }) onto an element,
 * splitting space-separated multi-class keys into individual tokens.
 *
 * @param {Element} el - The target element.
 * @param {Object} classList - Map of class-token strings to boolean enable flags.
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
 * Render a keyboard shortcut hint as a styled <span data-component="keybind">.
 *
 * @param {Object} props - Component props.
 * @param {string} props.class - Space-separated class names applied to the span.
 * @param {Object} props.classList - Solid-style classList map applied to the span.
 * @param {*} props.children - Content to render inside the span; may be a function,
 *   array, Node, or primitive.
 * @returns {HTMLSpanElement} The constructed keybind span element.
 */
export function Keybind(props) {
  const [local] = splitProps(props, ["class", "classList"]);
  const el = document.createElement("span");
  el.setAttribute("data-component", "keybind");
  if (local.class) el.classList.add(...String(local.class).split(/\s+/).filter(Boolean));
  applyClassList(el, local.classList);
  if (props.children != null) {
    const children = typeof props.children === "function" ? props.children() : props.children;
    if (Array.isArray(children)) {
      for (const child of children) {
        if (child instanceof Node) el.appendChild(child);
        else el.appendChild(document.createTextNode(String(child)));
      }
    } else if (children instanceof Node) {
      el.appendChild(children);
    } else {
      el.textContent = String(children);
    }
  }
  return el;
}
