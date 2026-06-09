import { createEffect, createMemo, createUniqueId, splitProps } from "solid-js";

export function Switch(props) {
  const [local, others] = splitProps(props, ["checked", "onChange", "disabled", "hideLabel", "children", "class", "classList"]);

  const id = createUniqueId();
  const classList = createMemo(() => ({
    ...local.classList,
    "form-check": true,
    "form-switch": true,
    [local.class ?? ""]: !!local.class
  }));

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

  createEffect(() => {
    container.className = "";
    const cls = classList();
    Object.keys(cls).forEach(name => {
      if (cls[name]) {
        container.classList.add(name);
      }
    });
  });

  function appendChildValue(result, value) {
    if (typeof value === "function") {
      appendChildValue(result, value());
      return;
    }
    if (value == null || value === false || value === true) return;
    if (Array.isArray(value)) {
      for (const item of value) appendChildValue(result, item);
      return;
    }
    if (value instanceof Node) {
      result.push(value);
      return;
    }
    if (typeof value === "string" || typeof value === "number") {
      result.push(document.createTextNode(String(value)));
    }
  }

  function renderChildren(value) {
    const result = [];
    appendChildValue(result, value);
    return result;
  }

  createEffect(() => {
    label.replaceChildren(...renderChildren(local.children));
  });

  createEffect(() => {
    if (local.hideLabel) {
      label.classList.add("visually-hidden");
    } else {
      label.classList.remove("visually-hidden");
    }
  });

  input.addEventListener("change", e => {
    local.onChange?.(e.currentTarget.checked);
  });

  createEffect(() => {
    input.id = id;
  });

  createEffect(() => {
    input.checked = !!local.checked;
  });

  createEffect(() => {
    input.disabled = !!local.disabled;
  });

  createEffect(() => {
    label.htmlFor = id;
  });

  Object.keys(others).forEach(key => {
    if (key === "class" || key === "classList") return;
    if (/^on[A-Z]/.test(key)) {
      const eventName = key.charAt(2).toLowerCase() + key.slice(3);
      const handler = others[key];
      if (typeof handler === "function") container.addEventListener(eventName, handler);
      return;
    }
    createEffect(() => {
      const value = others[key];
      if (value === undefined || value === null || value === false) {
        container.removeAttribute(key);
        return;
      }
      if (key === "style" && typeof value === "object") {
        Object.assign(container.style, value);
      } else {
        container.setAttribute(key, value === true ? "" : value);
      }
    });
  });

  container.appendChild(input);
  container.appendChild(label);

  return container;
}
