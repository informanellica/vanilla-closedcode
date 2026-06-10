import { Icon } from "@/bs/icon.js";

const PLACEMENT_CLASS = {
  bottom: "dropdown-menu-start",
  "bottom-start": "dropdown-menu-start",
  "bottom-end": "dropdown-menu-end",
  top: "dropdown-menu-start",
  "top-start": "dropdown-menu-start",
  "top-end": "dropdown-menu-end"
};

function template(html) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html.trim();
  return wrapper.firstElementChild;
}

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
    appendChildren(parent, children());
    return;
  }
  parent.appendChild(document.createTextNode(String(children)));
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
        // fall through to attribute assignment
      }
    }
    if (value === null || value === false) {
      el.removeAttribute(key);
    } else {
      el.setAttribute(key, String(value));
    }
  }
}

let DropdownContext = null;
let RadioContext = null;
let nextId = 0;

function useDropdown() {
  return DropdownContext;
}

function useRadio() {
  return RadioContext;
}

function createDropdownState(local) {
  let uncontrolled = !!local.defaultOpen;
  let rootEl = null;
  let triggerEl = null;
  let contentEl = null;
  let portalEl = null;
  const triggerId = `dropdown-menu-trigger-${++nextId}`;

  const isControlled = () => local.open !== undefined;
  const isOpen = () => (isControlled() ? !!local.open : uncontrolled);
  const setOpen = value => {
    if (!isControlled()) uncontrolled = !!value;
    local.onOpenChange?.(!!value);
    sync();
  };
  const toggle = () => setOpen(!isOpen());
  const close = () => setOpen(false);

  const positionContent = () => {
    if (!contentEl || !triggerEl || !isOpen()) return;
    requestAnimationFrame(() => {
      if (!contentEl.isConnected || !triggerEl.isConnected) return;
      const gutter = Number(local.gutter ?? 4);
      const placement = local.placement || "bottom-start";
      const pad = 8;
      const triggerRect = triggerEl.getBoundingClientRect();
      const contentRect = contentEl.getBoundingClientRect();
      const alignEnd = placement.endsWith("-end");
      const preferTop = placement.startsWith("top");
      let left = alignEnd ? triggerRect.right - contentRect.width : triggerRect.left;
      let top = preferTop ? triggerRect.top - contentRect.height - gutter : triggerRect.bottom + gutter;
      if (!preferTop && top + contentRect.height > window.innerHeight - pad) {
        top = triggerRect.top - contentRect.height - gutter;
      }
      if (preferTop && top < pad) {
        top = triggerRect.bottom + gutter;
      }
      left = Math.max(pad, Math.min(left, window.innerWidth - contentRect.width - pad));
      top = Math.max(pad, Math.min(top, window.innerHeight - contentRect.height - pad));
      contentEl.style.left = `${left}px`;
      contentEl.style.top = `${top}px`;
    });
  };

  const sync = () => {
    const open = isOpen();
    if (rootEl) {
      rootEl.classList.toggle("show", open);
      rootEl.classList.toggle("dropdown", true);
      rootEl.classList.toggle("d-inline-block", true);
    }
    if (triggerEl) {
      triggerEl.setAttribute("aria-expanded", open ? "true" : "false");
    }
    if (contentEl) {
      const placementClass = PLACEMENT_CLASS[local.placement || "bottom-start"] ?? "";
      contentEl.classList.toggle("show", open);
      contentEl.classList.toggle(placementClass, !!placementClass);
      contentEl.style.display = open ? "" : "none";
      positionContent();
    }
  };

  return {
    isOpen,
    setOpen,
    toggle,
    close,
    triggerId,
    placement: () => local.placement,
    gutter: () => local.gutter,
    trigger: () => triggerEl,
    registerRoot: el => {
      rootEl = el;
      sync();
    },
    registerTrigger: el => {
      triggerEl = el;
      sync();
    },
    registerContent: el => {
      contentEl = el;
      sync();
    },
    registerPortal: el => {
      portalEl = el;
      sync();
    },
    sync,
    positionContent
  };
}

function createRadioState(local) {
  const items = new Set();
  const indicators = new Set();
  const readValue = () => local.value;
  const sync = () => {
    const selected = readValue();
    for (const item of items) {
      const isSelected = item.value === selected;
      item.el.classList.toggle("active", isSelected);
      item.el.setAttribute("aria-checked", isSelected ? "true" : "false");
    }
    for (const indicator of indicators) {
      const visible = indicator.forceMount || indicator.isSelected();
      indicator.el.style.display = visible ? "" : "none";
    }
  };
  return {
    value: readValue,
    onChange: value => {
      local.onChange?.(value);
      sync();
    },
    isSelected: value => readValue() === value,
    registerItem(entry) {
      items.add(entry);
      sync();
    },
    registerIndicator(entry) {
      indicators.add(entry);
      sync();
    },
    sync
  };
}

function DropdownMenuRoot(props) {
  const [local, rest] = splitProps(props, ["open", "onOpenChange", "gutter", "placement", "class", "classList", "children"]);
  const previousContext = DropdownContext;
  const state = createDropdownState(local);
  DropdownContext = state;

  const rootEl = template(`<div data-component=dropdown-menu>`);
  state.registerRoot(rootEl);

  rootEl.setAttribute("data-component", "dropdown-menu");
  rootEl.classList.add("dropdown", "d-inline-block");
  if (local.class) {
    rootEl.classList.add(...String(local.class).split(/\s+/).filter(Boolean));
  }
  applyClassList(rootEl, local.classList);
  applyRestProps(rootEl, rest);

  const onDocPointer = event => {
    if (!state.isOpen()) return;
    if (rootEl.contains(event.target)) return;
    if (state.trigger()?.contains(event.target)) return;
    if (rootEl.contains(event.target)) return;
    state.close();
  };
  const onDocKeyDown = event => {
    if (event.key === "Escape" && state.isOpen()) state.close();
  };

  document.addEventListener("pointerdown", onDocPointer, true);
  document.addEventListener("keydown", onDocKeyDown, true);

  try {
    appendChildren(rootEl, local.children);
  } finally {
    DropdownContext = previousContext;
  }

  state.sync();
  return rootEl;
}

function DropdownMenuTrigger(props) {
  const ctx = useDropdown();
  const [local, rest] = splitProps(props, ["as", "class", "classList", "onClick", "children", "ref"]);
  const tag = local.as || "button";
  // `as` may be a component function (e.g. IconButton), not a tag name —
  // passing a function to document.createElement throws InvalidCharacterError
  // and takes the whole app down at boot. Invoke component `as` with the rest
  // props (icon/variant/…) and use the returned element as the trigger; class/
  // classList/children are applied by the shared code below either way.
  const asComponent = typeof tag === "function";
  let triggerEl;
  if (asComponent) {
    const produced = tag({ ...rest });
    triggerEl = produced instanceof Node ? produced : document.createElement("button");
  } else {
    triggerEl = document.createElement(tag);
    if (tag === "button") {
      triggerEl.type = "button";
    }
  }
  triggerEl.setAttribute("data-slot", "dropdown-menu-trigger");
  triggerEl.setAttribute("aria-haspopup", "menu");
  triggerEl.id = ctx?.triggerId || "";
  triggerEl.setAttribute("aria-expanded", ctx?.isOpen() ? "true" : "false");
  if (local.class) {
    triggerEl.classList.add(...String(local.class).split(/\s+/).filter(Boolean));
  }
  applyClassList(triggerEl, local.classList);
  if (!asComponent) applyRestProps(triggerEl, rest);

  triggerEl.addEventListener("click", event => {
    local.onClick?.(event);
    if (event?.defaultPrevented) return;
    ctx?.toggle?.();
  });

  if (ctx?.registerTrigger) ctx.registerTrigger(triggerEl);
  local.ref?.(triggerEl);
  appendChildren(triggerEl, local.children);
  return triggerEl;
}

function DropdownMenuIcon(props) {
  const [local, rest] = splitProps(props, ["class", "classList", "children"]);
  const el = template(`<span data-slot=dropdown-menu-icon>`);
  if (local.class) {
    el.classList.add(...String(local.class).split(/\s+/).filter(Boolean));
  }
  applyClassList(el, local.classList);
  applyRestProps(el, rest);
  appendChildren(el, local.children);
  return el;
}

function DropdownMenuPortal(props) {
  const portal = document.createElement("div");
  portal.setAttribute("data-component", "dropdown-menu-portal");
  document.body.appendChild(portal);
  appendChildren(portal, props.children);
  return document.createComment("dropdown-menu-portal");
}

function DropdownMenuContent(props) {
  const ctx = useDropdown();
  const [local, rest] = splitProps(props, ["class", "classList", "children"]);
  const el = template(`<div data-component=dropdown-menu-content role=menu>`);
  const placementClass = PLACEMENT_CLASS[ctx?.placement?.() || "bottom-start"] ?? "";

  el.setAttribute("data-slot", "dropdown-menu-content");
  el.classList.add("dropdown-menu");
  if (placementClass) el.classList.add(placementClass);
  if (local.class) {
    el.classList.add(...String(local.class).split(/\s+/).filter(Boolean));
  }
  applyClassList(el, local.classList);
  applyRestProps(el, rest);
  el.style.position = "fixed";
  el.style.zIndex = "2050";
  el.style.display = ctx?.isOpen() ? "" : "none";
  appendChildren(el, local.children);

  if (ctx?.registerContent) ctx.registerContent(el);
  ctx?.positionContent?.();
  return el;
}

function DropdownMenuArrow() {
  return null;
}

function DropdownMenuSeparator(props) {
  const [local, rest] = splitProps(props, ["class", "classList"]);
  const el = template(`<div data-slot=dropdown-menu-separator role=separator>`);
  if (local.class) {
    el.classList.add(...String(local.class).split(/\s+/).filter(Boolean));
  }
  el.classList.add("dropdown-divider");
  applyClassList(el, local.classList);
  applyRestProps(el, rest);
  return el;
}

function DropdownMenuGroup(props) {
  const [local, rest] = splitProps(props, ["class", "classList", "children"]);
  const el = template(`<div data-slot=dropdown-menu-group role=group>`);
  if (local.class) {
    el.classList.add(...String(local.class).split(/\s+/).filter(Boolean));
  }
  applyClassList(el, local.classList);
  applyRestProps(el, rest);
  appendChildren(el, local.children);
  return el;
}

function DropdownMenuGroupLabel(props) {
  const [local, rest] = splitProps(props, ["class", "classList", "children"]);
  const el = template(`<div data-slot=dropdown-menu-group-label>`);
  if (local.class) {
    el.classList.add(...String(local.class).split(/\s+/).filter(Boolean));
  }
  el.classList.add("dropdown-header");
  applyClassList(el, local.classList);
  applyRestProps(el, rest);
  appendChildren(el, local.children);
  return el;
}

function DropdownMenuItem(props) {
  const ctx = useDropdown();
  const [local, rest] = splitProps(props, ["class", "classList", "children", "onSelect", "disabled", "closeOnSelect"]);
  const el = template(`<button type=button data-slot=dropdown-menu-item role=menuitem>`);
  if (local.class) {
    el.classList.add(...String(local.class).split(/\s+/).filter(Boolean));
  }
  el.classList.add("dropdown-item", "d-flex", "align-items-center", "gap-2");
  applyClassList(el, local.classList);
  applyRestProps(el, rest);
  el.disabled = !!local.disabled;
  el.classList.toggle("disabled", !!local.disabled);
  el.addEventListener("click", event => {
    if (local.disabled) return;
    local.onSelect?.(event);
    if (local.closeOnSelect === false) return;
    ctx?.close?.();
  });
  appendChildren(el, local.children);
  return el;
}

function DropdownMenuItemLabel(props) {
  const [local, rest] = splitProps(props, ["class", "classList", "children"]);
  const el = template(`<span data-slot=dropdown-menu-item-label>`);
  if (local.class) {
    el.classList.add(...String(local.class).split(/\s+/).filter(Boolean));
  }
  el.classList.add("flex-grow-1");
  applyClassList(el, local.classList);
  applyRestProps(el, rest);
  appendChildren(el, local.children);
  return el;
}

function DropdownMenuItemDescription(props) {
  const [local, rest] = splitProps(props, ["class", "classList", "children"]);
  const el = template(`<span data-slot=dropdown-menu-item-description>`);
  if (local.class) {
    el.classList.add(...String(local.class).split(/\s+/).filter(Boolean));
  }
  el.classList.add("text-muted", "small");
  applyClassList(el, local.classList);
  applyRestProps(el, rest);
  appendChildren(el, local.children);
  return el;
}

function DropdownMenuItemIndicator(props) {
  const radio = useRadio();
  const [local, rest] = splitProps(props, ["class", "classList", "children", "forceMount"]);
  const el = template(`<span data-slot=dropdown-menu-item-indicator>`);
  const visible = () => !!local.forceMount || !radio || radio.isSelected?.();

  if (local.class) {
    el.classList.add(...String(local.class).split(/\s+/).filter(Boolean));
  }
  applyClassList(el, local.classList);
  applyRestProps(el, rest);
  el.style.display = visible() ? "" : "none";
  appendChildren(el, local.children ?? Icon({ name: "check" }));

  if (radio?.registerIndicator) {
    radio.registerIndicator({
      el,
      forceMount: !!local.forceMount,
      isSelected: () => radio.isSelected?.()
    });
  }
  return el;
}

function DropdownMenuRadioGroup(props) {
  const [local, rest] = splitProps(props, ["class", "classList", "children", "value", "onChange"]);
  const previous = RadioContext;
  const state = createRadioState(local);
  RadioContext = state;
  const el = template(`<div data-slot=dropdown-menu-radio-group role=group>`);
  if (local.class) {
    el.classList.add(...String(local.class).split(/\s+/).filter(Boolean));
  }
  applyClassList(el, local.classList);
  applyRestProps(el, rest);
  appendChildren(el, local.children);
  RadioContext = previous;
  state.sync();
  return el;
}

function DropdownMenuRadioItem(props) {
  const dropdown = useDropdown();
  const group = useRadio();
  const [local, rest] = splitProps(props, ["class", "classList", "children", "value", "onSelect", "disabled", "closeOnSelect"]);
  const el = template(`<button type=button data-slot=dropdown-menu-item role=menuitemradio>`);
  const value = local.value;

  if (local.class) {
    el.classList.add(...String(local.class).split(/\s+/).filter(Boolean));
  }
  el.classList.add("dropdown-item", "d-flex", "align-items-center", "gap-2");
  applyClassList(el, local.classList);
  applyRestProps(el, rest);
  el.disabled = !!local.disabled;
  el.setAttribute("aria-checked", group?.isSelected?.(value) ? "true" : "false");
  el.classList.toggle("active", !!group?.isSelected?.(value));

  if (group?.registerItem) {
    group.registerItem({ el, value });
  }

  el.addEventListener("click", event => {
    if (local.disabled) return;
    group?.onChange?.(value);
    local.onSelect?.(event);
    if (local.closeOnSelect === false) return;
    dropdown?.close?.();
  });

  appendChildren(el, local.children);
  return el;
}

function DropdownMenuCheckboxItem(props) {
  const dropdown = useDropdown();
  const [local, rest] = splitProps(props, ["class", "classList", "children", "checked", "onChange", "onSelect", "disabled", "closeOnSelect"]);
  const previous = RadioContext;
  const radio = {
    isSelected: () => !!local.checked,
    registerIndicator: entry => {
      entry.el.style.display = radio.isSelected() || entry.forceMount ? "" : "none";
    }
  };
  const el = template(`<button type=button data-slot=dropdown-menu-item role=menuitemcheckbox>`);

  if (local.class) {
    el.classList.add(...String(local.class).split(/\s+/).filter(Boolean));
  }
  el.classList.add("dropdown-item", "d-flex", "align-items-center", "gap-2");
  applyClassList(el, local.classList);
  applyRestProps(el, rest);
  el.disabled = !!local.disabled;
  el.setAttribute("aria-checked", local.checked ? "true" : "false");
  el.classList.toggle("active", !!local.checked);
  el.classList.toggle("disabled", !!local.disabled);
  el.addEventListener("click", event => {
    if (local.disabled) return;
    local.onChange?.(!local.checked);
    local.onSelect?.(event);
    if (local.closeOnSelect === false) return;
    dropdown?.close?.();
  });
  RadioContext = radio;
  try {
    appendChildren(el, local.children);
  } finally {
    RadioContext = previous;
  }
  return el;
}

function DropdownMenuSub(props) {
  return DropdownMenuRoot(props);
}

function DropdownMenuSubTrigger(props) {
  return DropdownMenuTrigger(props);
}

function DropdownMenuSubContent(props) {
  return DropdownMenuContent(props);
}

export const DropdownMenu = Object.assign(DropdownMenuRoot, {
  Trigger: DropdownMenuTrigger,
  Icon: DropdownMenuIcon,
  Portal: DropdownMenuPortal,
  Content: DropdownMenuContent,
  Arrow: DropdownMenuArrow,
  Separator: DropdownMenuSeparator,
  Group: DropdownMenuGroup,
  GroupLabel: DropdownMenuGroupLabel,
  Item: DropdownMenuItem,
  ItemLabel: DropdownMenuItemLabel,
  ItemDescription: DropdownMenuItemDescription,
  ItemIndicator: DropdownMenuItemIndicator,
  RadioGroup: DropdownMenuRadioGroup,
  RadioItem: DropdownMenuRadioItem,
  CheckboxItem: DropdownMenuCheckboxItem,
  Sub: DropdownMenuSub,
  SubTrigger: DropdownMenuSubTrigger,
  SubContent: DropdownMenuSubContent
});
