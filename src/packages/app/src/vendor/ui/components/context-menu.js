import { createRenderEffect, getOwner, onCleanup } from "solid-js";
import { insert } from "solid-js/web";
import { Icon } from "./icon.js";

// Vanilla ContextMenu (no third-party UI dependency): the same menu primitive as
// ./dropdown-menu.js, but it opens on a `contextmenu` gesture over the trigger
// and positions the content panel at the pointer coordinates (rather than
// anchored to the trigger). Mirrors the dropdown's bs/-derived techniques:
// module-variable context for the compound parts, a fixed-position portal under
// <body>, dismissal (Esc + outside pointerdown), roving keyboard focus
// (arrows/Home/End/typeahead), aria menu/menuitem roles — and emits this
// vendor's data-component/data-slot contract plus the CSS-driven state
// attributes (data-expanded/data-highlighted/data-disabled/data-checked) that
// ./context-menu.css styles.

function template(html) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html.trim();
  return wrapper.firstElementChild;
}

// Forward each key as a getter rather than copying its value once —
// createComponent props are signal-backed getters, and a value copy would
// freeze every controlled prop at its creation-time value.
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
    // evaluation.
    insert(parent, wrap ? () => wrap(children) : children);
    return;
  }
  parent.appendChild(document.createTextNode(String(children)));
}

function applyClassList(el, classList) {
  if (!classList) return;
  for (const cls in classList) {
    if (!cls) continue;
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

function applyClassProp(el, value) {
  if (value) el.classList.add(...String(value).split(/\s+/).filter(Boolean));
}

let ContextContext = null;
let RadioContext = null;
let nextId = 0;

function useContextMenu() {
  return ContextContext;
}

function useRadio() {
  return RadioContext;
}

function menuItems(contentEl) {
  if (!contentEl) return [];
  return Array.from(
    contentEl.querySelectorAll(
      '[data-slot="context-menu-item"],[data-slot="context-menu-checkbox-item"],[data-slot="context-menu-radio-item"],[data-slot="context-menu-sub-trigger"]'
    )
  ).filter(el => el.getAttribute("data-disabled") == null && !el.disabled);
}

function highlight(items, target) {
  for (const el of items) {
    if (el === target) el.setAttribute("data-highlighted", "");
    else el.removeAttribute("data-highlighted");
  }
  if (target) target.focus();
}

function createContextState(local) {
  let uncontrolled = !!local.defaultOpen;
  let rootEl = null;
  let triggerEl = null;
  let contentEl = null;
  let portalEl = null;
  // Anchor point: the pointer coordinates from the last `contextmenu` gesture.
  let anchor = { x: 0, y: 0 };
  const triggerId = `context-menu-trigger-${++nextId}`;

  const isControlled = () => local.open !== undefined;
  const isOpen = () => (isControlled() ? !!local.open : uncontrolled);
  const setOpen = value => {
    if (!isControlled()) uncontrolled = !!value;
    local.onOpenChange?.(!!value);
    sync();
  };
  const close = () => setOpen(false);
  const openAt = (x, y) => {
    anchor = { x, y };
    setOpen(true);
  };

  const positionContent = () => {
    if (!contentEl || !isOpen()) return;
    requestAnimationFrame(() => {
      if (!contentEl.isConnected) return;
      const pad = 8;
      const rect = contentEl.getBoundingClientRect();
      // Open below-right of the pointer; flip back inside the viewport if it
      // would overflow.
      let left = anchor.x;
      let top = anchor.y;
      if (left + rect.width > window.innerWidth - pad) {
        left = Math.max(pad, anchor.x - rect.width);
      }
      if (top + rect.height > window.innerHeight - pad) {
        top = Math.max(pad, anchor.y - rect.height);
      }
      left = Math.max(pad, Math.min(left, window.innerWidth - rect.width - pad));
      top = Math.max(pad, Math.min(top, window.innerHeight - rect.height - pad));
      contentEl.style.left = `${left}px`;
      contentEl.style.top = `${top}px`;
    });
  };

  const sync = () => {
    const open = isOpen();
    if (triggerEl) {
      triggerEl.setAttribute("aria-expanded", open ? "true" : "false");
      if (open) triggerEl.setAttribute("data-expanded", "");
      else triggerEl.removeAttribute("data-expanded");
    }
    if (contentEl) {
      // data-expanded drives the show keyframe; without it the CSS plays the
      // hide animation (opacity 0). display also gates pointer events.
      if (open) contentEl.setAttribute("data-expanded", "");
      else contentEl.removeAttribute("data-expanded");
      contentEl.style.display = open ? "" : "none";
      positionContent();
    }
  };

  return {
    isOpen,
    setOpen,
    close,
    openAt,
    modal: () => local.modal,
    triggerId,
    trigger: () => triggerEl,
    content: () => contentEl,
    portal: () => portalEl,
    items: () => menuItems(contentEl),
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
      if (isSelected) item.el.setAttribute("data-checked", "");
      else item.el.removeAttribute("data-checked");
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

function ContextMenuRoot(props) {
  const [local, rest] = splitProps(props, ["open", "defaultOpen", "onOpenChange", "modal", "class", "classList", "children"]);
  const previousContext = ContextContext;
  const state = createContextState(local);
  ContextContext = state;

  const rootEl = template(`<div data-component=context-menu>`);
  state.registerRoot(rootEl);

  applyClassProp(rootEl, local.class);
  applyClassList(rootEl, local.classList);
  applyRestProps(rootEl, rest);

  const removeDocListeners = () => {
    document.removeEventListener("pointerdown", onDocPointer, true);
    document.removeEventListener("keydown", onDocKeyDown, true);
  };
  const onDocPointer = event => {
    if (!rootEl.isConnected) {
      removeDocListeners();
      return;
    }
    if (!state.isOpen()) return;
    // A click on the menu's own controls is not an outside click.
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

  // Controlled open is a live getter — re-sync when the owner changes it.
  createRenderEffect(() => {
    void local.open;
    void local.modal;
    state.sync();
  });

  const withContext = fn => {
    const prev = ContextContext;
    ContextContext = state;
    try {
      return fn();
    } finally {
      ContextContext = prev;
    }
  };

  try {
    appendChildren(rootEl, local.children, withContext);
  } finally {
    ContextContext = previousContext;
  }

  state.sync();
  return rootEl;
}

function ContextMenuTrigger(props) {
  const ctx = useContextMenu();
  const [local, rest] = splitProps(props, ["as", "class", "classList", "onContextMenu", "children", "ref"]);
  const tag = local.as || "div";
  const asComponent = typeof tag === "function";
  let triggerEl;
  if (asComponent) {
    const produced = tag(rest);
    triggerEl = produced instanceof Node ? produced : document.createElement("div");
  } else {
    triggerEl = document.createElement(tag);
    if (tag === "button") triggerEl.type = "button";
  }
  triggerEl.setAttribute("data-slot", "context-menu-trigger");
  triggerEl.id = ctx?.triggerId || "";
  triggerEl.setAttribute("aria-expanded", ctx?.isOpen() ? "true" : "false");
  applyClassProp(triggerEl, local.class);
  applyClassList(triggerEl, local.classList);
  if (!asComponent) applyRestProps(triggerEl, rest);

  // Open the menu at the pointer on a context-menu gesture.
  triggerEl.addEventListener("contextmenu", event => {
    local.onContextMenu?.(event);
    if (event?.defaultPrevented) return;
    event.preventDefault();
    ctx?.openAt?.(event.clientX, event.clientY);
    requestAnimationFrame(() => ctx?.content?.()?.focus?.());
  });

  if (ctx?.registerTrigger) ctx.registerTrigger(triggerEl);
  local.ref?.(triggerEl);
  appendChildren(triggerEl, local.children);
  return triggerEl;
}

function ContextMenuIcon(props) {
  const [local, rest] = splitProps(props, ["class", "classList", "children"]);
  const el = template(`<span data-slot=context-menu-icon>`);
  applyClassProp(el, local.class);
  applyClassList(el, local.classList);
  applyRestProps(el, rest);
  appendChildren(el, local.children);
  return el;
}

function ContextMenuPortal(props) {
  const ctx = useContextMenu();
  const portal = document.createElement("div");
  portal.setAttribute("data-component", "context-menu-portal");
  document.body.appendChild(portal);
  appendChildren(portal, props.children);
  ctx?.registerPortal?.(portal);
  if (getOwner()) onCleanup(() => portal.remove());
  return document.createComment("context-menu-portal");
}

function ContextMenuContent(props) {
  const ctx = useContextMenu();
  const [local, rest] = splitProps(props, ["class", "classList", "children"]);
  const el = template(`<div data-component=context-menu-content role=menu tabindex=-1>`);

  el.setAttribute("data-slot", "context-menu-content");
  applyClassProp(el, local.class);
  applyClassList(el, local.classList);
  applyRestProps(el, rest);
  el.style.position = "fixed";
  el.style.zIndex = "2050";
  el.style.display = ctx?.isOpen() ? "" : "none";
  appendChildren(el, local.children);

  // Roving focus + typeahead inside the menu panel.
  let typeahead = "";
  let typeaheadTimer;
  el.addEventListener("keydown", event => {
    const items = ctx?.items?.() ?? [];
    if (!items.length) return;
    const current = items.findIndex(item => item.getAttribute("data-highlighted") != null);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      const next = current < 0 ? 0 : (current + 1) % items.length;
      highlight(items, items[next]);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      const next = current < 0 ? items.length - 1 : (current - 1 + items.length) % items.length;
      highlight(items, items[next]);
    } else if (event.key === "Home") {
      event.preventDefault();
      highlight(items, items[0]);
    } else if (event.key === "End") {
      event.preventDefault();
      highlight(items, items[items.length - 1]);
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      typeahead += event.key.toLowerCase();
      clearTimeout(typeaheadTimer);
      typeaheadTimer = setTimeout(() => (typeahead = ""), 500);
      const match = items.find(item => (item.textContent || "").trim().toLowerCase().startsWith(typeahead));
      if (match) highlight(items, match);
    }
  });
  el.addEventListener("pointermove", event => {
    const item = event.target?.closest?.(
      '[data-slot="context-menu-item"],[data-slot="context-menu-checkbox-item"],[data-slot="context-menu-radio-item"],[data-slot="context-menu-sub-trigger"]'
    );
    if (!item || el !== item.closest('[data-component="context-menu-content"]')) return;
    if (item.getAttribute("data-disabled") != null || item.disabled) return;
    highlight(ctx?.items?.() ?? [], item);
  });

  if (ctx?.registerContent) ctx.registerContent(el);
  ctx?.positionContent?.();
  return el;
}

function ContextMenuArrow() {
  return null;
}

function ContextMenuSeparator(props) {
  const [local, rest] = splitProps(props, ["class", "classList"]);
  const el = template(`<div data-slot=context-menu-separator role=separator>`);
  applyClassProp(el, local.class);
  applyClassList(el, local.classList);
  applyRestProps(el, rest);
  return el;
}

function ContextMenuGroup(props) {
  const [local, rest] = splitProps(props, ["class", "classList", "children"]);
  const el = template(`<div data-slot=context-menu-group role=group>`);
  applyClassProp(el, local.class);
  applyClassList(el, local.classList);
  applyRestProps(el, rest);
  appendChildren(el, local.children);
  return el;
}

function ContextMenuGroupLabel(props) {
  const [local, rest] = splitProps(props, ["class", "classList", "children"]);
  const el = template(`<div data-slot=context-menu-group-label>`);
  applyClassProp(el, local.class);
  applyClassList(el, local.classList);
  applyRestProps(el, rest);
  appendChildren(el, local.children);
  return el;
}

function ContextMenuItem(props) {
  const ctx = useContextMenu();
  const [local, rest] = splitProps(props, ["class", "classList", "children", "onSelect", "disabled", "closeOnSelect"]);
  const el = template(`<button type=button data-slot=context-menu-item role=menuitem tabindex=-1>`);
  applyClassProp(el, local.class);
  applyClassList(el, local.classList);
  applyRestProps(el, rest);
  createRenderEffect(() => {
    const disabled = !!local.disabled;
    el.disabled = disabled;
    if (disabled) el.setAttribute("data-disabled", "");
    else el.removeAttribute("data-disabled");
  });
  el.addEventListener("click", event => {
    if (local.disabled) return;
    local.onSelect?.(event);
    if (local.closeOnSelect === false) return;
    ctx?.close?.();
  });
  el.addEventListener("keydown", event => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    el.click();
  });
  appendChildren(el, local.children);
  return el;
}

function ContextMenuItemLabel(props) {
  const [local, rest] = splitProps(props, ["class", "classList", "children"]);
  const el = template(`<span data-slot=context-menu-item-label>`);
  applyClassProp(el, local.class);
  applyClassList(el, local.classList);
  applyRestProps(el, rest);
  appendChildren(el, local.children);
  return el;
}

function ContextMenuItemDescription(props) {
  const [local, rest] = splitProps(props, ["class", "classList", "children"]);
  const el = template(`<span data-slot=context-menu-item-description>`);
  applyClassProp(el, local.class);
  applyClassList(el, local.classList);
  applyRestProps(el, rest);
  appendChildren(el, local.children);
  return el;
}

function ContextMenuItemIndicator(props) {
  const radio = useRadio();
  const [local, rest] = splitProps(props, ["class", "classList", "children", "forceMount"]);
  const el = template(`<span data-slot=context-menu-item-indicator>`);
  const visible = () => !!local.forceMount || !radio || radio.isSelected?.();

  applyClassProp(el, local.class);
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

function ContextMenuRadioGroup(props) {
  const [local, rest] = splitProps(props, ["class", "classList", "children", "value", "onChange"]);
  const previous = RadioContext;
  const state = createRadioState(local);
  RadioContext = state;
  const el = template(`<div data-slot=context-menu-radio-group role=group>`);
  applyClassProp(el, local.class);
  applyClassList(el, local.classList);
  applyRestProps(el, rest);
  appendChildren(el, local.children);
  RadioContext = previous;
  createRenderEffect(() => {
    void local.value;
    state.sync();
  });
  return el;
}

function ContextMenuRadioItem(props) {
  const menu = useContextMenu();
  const group = useRadio();
  const [local, rest] = splitProps(props, ["class", "classList", "children", "value", "onSelect", "disabled", "closeOnSelect"]);
  const el = template(`<button type=button data-slot=context-menu-radio-item role=menuitemradio tabindex=-1>`);
  const value = local.value;

  applyClassProp(el, local.class);
  applyClassList(el, local.classList);
  applyRestProps(el, rest);
  createRenderEffect(() => {
    const disabled = !!local.disabled;
    el.disabled = disabled;
    if (disabled) el.setAttribute("data-disabled", "");
    else el.removeAttribute("data-disabled");
  });
  createRenderEffect(() => {
    const selected = !!group?.isSelected?.(value);
    el.setAttribute("aria-checked", selected ? "true" : "false");
    if (selected) el.setAttribute("data-checked", "");
    else el.removeAttribute("data-checked");
  });

  if (group?.registerItem) group.registerItem({ el, value });

  el.addEventListener("click", event => {
    if (local.disabled) return;
    group?.onChange?.(value);
    local.onSelect?.(event);
    if (local.closeOnSelect === false) return;
    menu?.close?.();
  });
  el.addEventListener("keydown", event => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    el.click();
  });

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

function ContextMenuCheckboxItem(props) {
  const menu = useContextMenu();
  const [local, rest] = splitProps(props, ["class", "classList", "children", "checked", "onChange", "onSelect", "disabled", "closeOnSelect"]);
  const previous = RadioContext;
  const radio = {
    isSelected: () => !!local.checked,
    registerIndicator: entry => {
      createRenderEffect(() => {
        entry.el.style.display = radio.isSelected() || entry.forceMount ? "" : "none";
      });
    }
  };
  const el = template(`<button type=button data-slot=context-menu-checkbox-item role=menuitemcheckbox tabindex=-1>`);

  applyClassProp(el, local.class);
  applyClassList(el, local.classList);
  applyRestProps(el, rest);
  createRenderEffect(() => {
    const checked = !!local.checked;
    const disabled = !!local.disabled;
    el.disabled = disabled;
    el.setAttribute("aria-checked", checked ? "true" : "false");
    if (checked) el.setAttribute("data-checked", "");
    else el.removeAttribute("data-checked");
    if (disabled) el.setAttribute("data-disabled", "");
    else el.removeAttribute("data-disabled");
  });
  el.addEventListener("click", event => {
    if (local.disabled) return;
    local.onChange?.(!local.checked);
    local.onSelect?.(event);
    if (local.closeOnSelect === false) return;
    menu?.close?.();
  });
  el.addEventListener("keydown", event => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    el.click();
  });
  RadioContext = radio;
  try {
    appendChildren(el, local.children);
  } finally {
    RadioContext = previous;
  }
  return el;
}

function ContextMenuSub(props) {
  return ContextMenuRoot(props);
}

function ContextMenuSubTrigger(props) {
  const ctx = useContextMenu();
  const [local, rest] = splitProps(props, ["as", "class", "classList", "children"]);
  const tag = local.as || "button";
  const el = typeof tag === "function" ? document.createElement("button") : document.createElement(tag);
  if (el.tagName === "BUTTON") el.type = "button";
  el.setAttribute("data-slot", "context-menu-sub-trigger");
  el.setAttribute("aria-haspopup", "menu");
  el.setAttribute("tabindex", "-1");
  applyClassProp(el, local.class);
  applyClassList(el, local.classList);
  applyRestProps(el, rest);
  el.addEventListener("click", () => {
    if (!ctx) return;
    ctx.isOpen() ? ctx.close() : ctx.setOpen(true);
  });
  if (ctx?.registerTrigger) ctx.registerTrigger(el);
  appendChildren(el, local.children);
  return el;
}

function ContextMenuSubContent(props) {
  const el = ContextMenuContent(props);
  el.setAttribute("data-component", "context-menu-sub-content");
  el.setAttribute("data-slot", "context-menu-sub-content");
  return el;
}

export const ContextMenu = Object.assign(ContextMenuRoot, {
  Trigger: ContextMenuTrigger,
  Icon: ContextMenuIcon,
  Portal: ContextMenuPortal,
  Content: ContextMenuContent,
  Arrow: ContextMenuArrow,
  Separator: ContextMenuSeparator,
  Group: ContextMenuGroup,
  GroupLabel: ContextMenuGroupLabel,
  Item: ContextMenuItem,
  ItemLabel: ContextMenuItemLabel,
  ItemDescription: ContextMenuItemDescription,
  ItemIndicator: ContextMenuItemIndicator,
  RadioGroup: ContextMenuRadioGroup,
  RadioItem: ContextMenuRadioItem,
  CheckboxItem: ContextMenuCheckboxItem,
  Sub: ContextMenuSub,
  SubTrigger: ContextMenuSubTrigger,
  SubContent: ContextMenuSubContent
});
