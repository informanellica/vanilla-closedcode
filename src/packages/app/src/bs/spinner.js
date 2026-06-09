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
