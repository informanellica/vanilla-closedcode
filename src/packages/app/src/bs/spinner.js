/** @file Bootstrap-styled loading spinner component (vanilla reimplementation). */

/**
 * Renders an inline loading spinner as a `<span>` with `role="status"` and the
 * Bootstrap `spinner-border` class.
 * @param {Object} props - Component props. Recognized keys: `class` (string of
 *   extra CSS classes), `classList` (object mapping class names to booleans),
 *   `on*` handlers (e.g. `onClick`), and any other key is applied as an
 *   attribute on the element.
 * @returns {HTMLElement} The spinner `<span>` element.
 */
export function Spinner(props) {
  const el = document.createElement("span");
  el.setAttribute("role", "status");

  const classList = {
    "spinner-border": true,
    ...props.classList,
    [props.class ?? ""]: !!props.class
  };

  for (const key in props) {
    if (key === "class" || key === "classList") continue;
    const value = props[key];
    if (/^on[A-Z]/.test(key) && typeof value === "function") {
      el.addEventListener(key.slice(2).toLowerCase(), value);
      continue;
    }
    if (value != null && value !== false) {
      el.setAttribute(key, value === true ? "" : String(value));
    }
  }

  if (Object.keys(classList).length > 0) {
    const classes = Object.entries(classList)
      .filter(([_, value]) => value)
      .map(([key]) => key)
      .join(" ");
    if (classes) el.setAttribute("class", classes);
  }

  return el;
}
