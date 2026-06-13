import { createRenderEffect, getOwner, onCleanup } from "../lib/reactivity.js";
import { insert } from "../lib/reactivity.js";
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

// Unlike a naive `split[key] = props[key]` copy, forward each key as a getter —
// createComponent props are signal-backed getters, and copying their value once
// freezes every controlled prop (open/checked/disabled/value/placement/…) at
// its creation-time value. Mirrors Solid's own splitProps semantics.
function splitProps(props, keys) {
  const split = {};
  const rest = {};
  for (const key in props) {
    const target = keys.includes(key) ? split : rest;
    Object.defineProperty(target, key, {
      get: () => props[key],
      enumerable: true,
      configurable: true
    });
  }
  return [split, rest];
}

function appendChildren(parent, children, wrap) {
  if (children == null || children === false) return;
  if (Array.isArray(children)) {
    for (const child of children) appendChildren(parent, child, wrap);
    return;
  }
  if (children instanceof Node) {
    parent.appendChild(children);
    return;
  }
  if (typeof children === "function") {
    // Reactive child (Solid Show/For/components return accessors): let
    // solid-js/web insert() track it so updates re-render instead of freezing.
    // `wrap` re-establishes the module-variable context around each lazy
    // evaluation — Show/For re-create their children long after the synchronous
    // build restored the previous context.
    insert(parent, wrap ? () => wrap(children) : children);
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
      // Drop every placement class first — toggling only the current one would
      // leave a stale class behind when placement changes (start → end).
      for (const cls of new Set(Object.values(PLACEMENT_CLASS))) {
        contentEl.classList.remove(cls);
      }
      if (placementClass) contentEl.classList.add(placementClass);
      contentEl.classList.toggle("show", open);
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
    content: () => contentEl,
    portal: () => portalEl,
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

  const removeDocListeners = () => {
    document.removeEventListener("pointerdown", onDocPointer, true);
    document.removeEventListener("keydown", onDocKeyDown, true);
  };
  const onDocPointer = event => {
    // Self-heal when created without an owner: drop the listeners on the first
    // event after the menu has left the document.
    if (!rootEl.isConnected) {
      removeDocListeners();
      return;
    }
    if (!state.isOpen()) return;
    if (rootEl.contains(event.target)) return;
    if (state.trigger()?.contains(event.target)) return;
    // Content/portal live under document.body (position:fixed) — clicks on the
    // menu's own controls (search box, checkboxes, …) are NOT outside clicks.
    if (state.content()?.contains(event.target)) return;
    if (state.portal()?.contains(event.target)) return;
    state.close();
  };
  const onDocKeyDown = event => {
    if (!rootEl.isConnected) {
      removeDocListeners();
      return;
    }
    if (event.key === "Escape" && state.isOpen()) state.close();
  };

  document.addEventListener("pointerdown", onDocPointer, true);
  document.addEventListener("keydown", onDocKeyDown, true);
  if (getOwner()) onCleanup(removeDocListeners);

  // Controlled props are live getters — re-sync when the owner changes them.
  // placement/gutter affect the placement class and the position computation.
  createRenderEffect(() => {
    void local.open;
    void local.placement;
    void local.gutter;
    state.sync();
  });

  // Re-establish this menu's context around lazily evaluated children (Show/
  // For accessors create components after the synchronous build below has
  // already restored the previous context).
  const withContext = fn => {
    const prev = DropdownContext;
    DropdownContext = state;
    try {
      return fn();
    } finally {
      DropdownContext = prev;
    }
  };

  try {
    appendChildren(rootEl, local.children, withContext);
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
    // Pass `rest` as-is: spreading it would evaluate the forwarded getters and
    // freeze signal-backed props (disabled/title/aria-*) at their first value.
    const produced = tag(rest);
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
  const ctx = useDropdown();
  const portal = document.createElement("div");
  portal.setAttribute("data-component", "dropdown-menu-portal");
  document.body.appendChild(portal);
  appendChildren(portal, props.children);
  // Register so the outside-click handler can tell portal clicks apart, and
  // remove the body-mounted node with the owning component (it would otherwise
  // accumulate under <body> on every re-render).
  // NOTE: ownerless (manual DOM) usage is NOT supported — without an owner the
  // portal node stays in <body> and the Root's document listeners only
  // self-remove on the next pointer/key event after unmount. All in-app usage
  // goes through createComponent and therefore has an owner.
  ctx?.registerPortal?.(portal);
  if (getOwner()) onCleanup(() => portal.remove());
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
  // disabled is signal-backed — track it like CheckboxItem/RadioItem do.
  createRenderEffect(() => {
    const disabled = !!local.disabled;
    el.disabled = disabled;
    el.classList.toggle("disabled", disabled);
  });
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
  // Controlled group value is a live getter — re-sync the items when the
  // parent changes it (not only via our own onChange).
  createRenderEffect(() => {
    void local.value;
    state.sync();
  });
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
  // disabled and the selected state are signal-backed — track them.
  createRenderEffect(() => {
    el.disabled = !!local.disabled;
  });
  createRenderEffect(() => {
    const selected = !!group?.isSelected?.(value);
    el.setAttribute("aria-checked", selected ? "true" : "false");
    el.classList.toggle("active", selected);
  });

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

  // The group's isSelected(value) takes the candidate value, but ItemIndicator
  // calls isSelected() with no argument — give the children an item-bound
  // context (like CheckboxItem does) or the check mark never shows.
  const previous = RadioContext;
  RadioContext = group
    ? { ...group, isSelected: () => !!group.isSelected?.(value) }
    : group;
  try {
    appendChildren(el, local.children);
  } finally {
    RadioContext = previous;
  }
  return el;
}

function DropdownMenuCheckboxItem(props) {
  const dropdown = useDropdown();
  const [local, rest] = splitProps(props, ["class", "classList", "children", "checked", "onChange", "onSelect", "disabled", "closeOnSelect"]);
  const previous = RadioContext;
  const radio = {
    isSelected: () => !!local.checked,
    registerIndicator: entry => {
      // checked is a live getter — keep the indicator following it.
      createRenderEffect(() => {
        entry.el.style.display = radio.isSelected() || entry.forceMount ? "" : "none";
      });
    }
  };
  const el = template(`<button type=button data-slot=dropdown-menu-item role=menuitemcheckbox>`);

  if (local.class) {
    el.classList.add(...String(local.class).split(/\s+/).filter(Boolean));
  }
  el.classList.add("dropdown-item", "d-flex", "align-items-center", "gap-2");
  applyClassList(el, local.classList);
  applyRestProps(el, rest);
  // checked/disabled are signal-backed (controlled by the parent's store);
  // reading them once froze the checkbox and made every click report the same
  // inverted value. Re-apply reactively, read live in the click handler.
  createRenderEffect(() => {
    const checked = !!local.checked;
    const disabled = !!local.disabled;
    el.disabled = disabled;
    el.setAttribute("aria-checked", checked ? "true" : "false");
    el.classList.toggle("active", checked);
    el.classList.toggle("disabled", disabled);
  });
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
