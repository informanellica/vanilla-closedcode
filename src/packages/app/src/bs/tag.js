/** @file Bootstrap pill-badge "tag" component (vanilla reimplementation). */

/**
 * Renders a rounded-pill Bootstrap badge.
 * @param {Object} props - Component props. Recognized keys: `variant`
 *   (Bootstrap color variant such as "secondary", "primary"; default
 *   "secondary"), `size` ("small" applies a compact badge class), `children`
 *   (badge content; Node, function, array, or primitive), `class` (extra CSS
 *   classes), `classList` (object mapping class names to booleans), plus any
 *   `on*` handler or attribute applied to the element.
 * @returns {HTMLElement} The badge `<span>` element.
 */
export function Tag(props) {
  const el = document.createElement("span");
  el.setAttribute("data-component", "tag");

  const variantClass = () => {
    const v = props.variant || "secondary";
    return `text-bg-${v}`;
  };

  const sizeClass = () => (props.size === "small" ? "badge-sm" : "");

  const appendChildValue = value => {
    if (typeof value === "function") {
      appendChildValue(value());
      return;
    }
    if (value == null || value === false || value === true) return;
    if (Array.isArray(value)) {
      value.forEach(appendChildValue);
      return;
    }
    if (value instanceof Node) {
      el.appendChild(value);
      return;
    }
    el.appendChild(document.createTextNode(String(value)));
  };

  appendChildValue(props.children);

  const classList = {
    badge: true,
    "rounded-pill": true,
    [variantClass()]: true,
    [sizeClass()]: !!sizeClass(),
    ...props.classList,
    [props.class ?? ""]: !!props.class
  };

  for (const key in props) {
    if (key === "class" || key === "classList" || key === "children") continue;
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
