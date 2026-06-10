import { pipe, groupBy, entries, map } from "remeda";

export function Select(props) {
  const [local, others] = splitProps(props, ["class", "classList", "placeholder", "options", "current", "value", "label", "groupBy", "valueClass", "onSelect", "onHighlight", "onOpenChange", "children", "triggerStyle", "triggerVariant", "triggerProps", "size", "variant", "disabled"]);
  const state = {
    key: undefined,
    cleanup: undefined
  };
  const stop = () => {
    state.cleanup?.();
    state.cleanup = undefined;
    state.key = undefined;
  };
  const keyFor = item => local.value ? local.value(item) : item;
  const labelFor = item => local.children ? local.children(item) : local.label ? local.label(item) : item;
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
  const indexOfKey = key => flatOptions.findIndex(item => keyFor(item) === key);

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
