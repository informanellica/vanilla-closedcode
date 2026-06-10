function splitProps(props, keys) {
  const split = {};
  const rest = {};
  for (const key in props) {
    if (keys.includes(key)) split[key] = props[key];
    else rest[key] = props[key];
  }
  return [split, rest];
}

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
