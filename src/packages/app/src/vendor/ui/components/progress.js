import { insert as _solidInsert } from "solid-js/web";
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
    _solidInsert(parent, children);
    return;
  }
  parent.appendChild(document.createTextNode(String(children)));
}

function percentage(value, maxValue) {
  if (typeof value !== "number" || typeof maxValue !== "number" || maxValue <= 0) return null;
  return Math.max(0, Math.min(100, (value / maxValue) * 100));
}

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
