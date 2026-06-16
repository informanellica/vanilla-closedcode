/** @file Vanilla ContextMenu compound component: a pointer-positioned menu primitive (trigger, portal, content, items, radio/checkbox/sub menus) reimplemented without a third-party UI dependency. */
// Vanilla reimplementation of @kobalte/core's ContextMenu behavior (no external UI
// dependency). Derivative of @kobalte/core (MIT License,
// Copyright (c) 2024 jer3m01 <jer3m01@jer3m01.com>). See THIRD-PARTY-NOTICES.md.
import { createRenderEffect, getOwner, onCleanup } from "../../../lib/reactivity.js";
import { insert } from "../../../lib/reactivity.js";
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

/**
 * Builds a detached element from a compact HTML string.
 * @param {string} html - HTML markup for a single root element.
 * @returns {Element} The first element child of the parsed markup.
 */
function template(html) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html.trim();
  return wrapper.firstElementChild;
}

/**
 * Getter-forwarding props split: defines getters on both buckets so each
 * signal-backed prop stays live (a value copy would freeze controlled props).
 * @param {Object} props - Source props object.
 * @param {Array} keys - Property names to forward into the first bucket.
 * @returns {Array} A two-element array: [picked props, rest props].
 */
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

/**
 * Appends Solid-style children to a parent, optionally re-establishing the
 * module-variable context around each lazily-evaluated reactive child.
 * @param {Node} parent - Parent element to receive the children.
 * @param {*} children - Child value: a Node, array, function accessor, or primitive.
 * @param {Function} wrap - Optional wrapper that restores menu context around reactive children.
 * @returns {void}
 */
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

/**
 * Applies a Solid-style classList map to an element, toggling each class token.
 * @param {HTMLElement} el - Target element.
 * @param {Object} classList - Map of (possibly space-separated) class keys to truthy/falsy values.
 * @returns {void}
 */
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

/**
 * Applies remaining props to an element: binds on* handlers, sets known DOM
 * properties, and falls back to attributes (removing on null/false).
 * @param {HTMLElement} el - Target element.
 * @param {Object} rest - Remaining props excluding class/classList/children.
 * @returns {void}
 */
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

/**
 * Adds the space-separated class tokens from a class prop to an element.
 * @param {HTMLElement} el - Target element.
 * @param {*} value - Class string (or value coercible to one).
 * @returns {void}
 */
function applyClassProp(el, value) {
  if (value) el.classList.add(...String(value).split(/\s+/).filter(Boolean));
}

let ContextContext = null;
let RadioContext = null;
let nextId = 0;

/**
 * Reads the current ContextMenu state from module-variable context.
 * @returns {Object} The active context-menu state object, or null.
 */
function useContextMenu() {
  return ContextContext;
}

/**
 * Reads the current radio-group state from module-variable context.
 * @returns {Object} The active radio-group state object, or null.
 */
function useRadio() {
  return RadioContext;
}

/**
 * Collects the enabled, focusable menu items within a content panel.
 * @param {Element} contentEl - The menu content element to query.
 * @returns {Array} The non-disabled item/checkbox/radio/sub-trigger elements.
 */
function menuItems(contentEl) {
  if (!contentEl) return [];
  return Array.from(
    contentEl.querySelectorAll(
      '[data-slot="context-menu-item"],[data-slot="context-menu-checkbox-item"],[data-slot="context-menu-radio-item"],[data-slot="context-menu-sub-trigger"]'
    )
  ).filter(el => el.getAttribute("data-disabled") == null && !el.disabled);
}

/**
 * Marks one item as highlighted (and focuses it), clearing the rest.
 * @param {Array} items - The candidate menu item elements.
 * @param {Element} target - The element to highlight and focus.
 * @returns {void}
 */
function highlight(items, target) {
  for (const el of items) {
    if (el === target) el.setAttribute("data-highlighted", "");
    else el.removeAttribute("data-highlighted");
  }
  if (target) target.focus();
}

/**
 * Creates the shared open/close + positioning state for a context menu root,
 * supporting both controlled (`open`) and uncontrolled (`defaultOpen`) modes
 * and exposing register hooks for the root/trigger/content/portal elements.
 * @param {Object} local - The root's local props (open, defaultOpen, onOpenChange, modal).
 * @returns {Object} The context-menu state API (isOpen, setOpen, close, openAt, registrars, sync, etc.).
 */
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

/**
 * Creates the shared selection state for a radio group: tracks registered items
 * and indicators, reflects the current value into data/aria attributes, and
 * relays changes via onChange.
 * @param {Object} local - The radio group's local props (value, onChange).
 * @returns {Object} The radio-group state API (value, onChange, isSelected, registerItem, registerIndicator, sync).
 */
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

/**
 * ContextMenu root component. Owns the menu state, wires up document-level
 * dismissal (Escape + outside pointerdown), and provides the menu context to
 * its compound children.
 * @param {Object} props - Component props.
 * @param {boolean} props.open - Controlled open state.
 * @param {boolean} props.defaultOpen - Initial open state for uncontrolled use.
 * @param {Function} props.onOpenChange - Called with the new open state on change.
 * @param {boolean} props.modal - Whether the menu is modal.
 * @param {*} props.class - Class string(s) for the root.
 * @param {Object} props.classList - Solid-style class toggle map.
 * @param {*} props.children - Compound menu parts (Trigger, Portal, Content, etc.).
 * @returns {HTMLElement} The context-menu root element.
 */
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

/**
 * ContextMenu trigger component. Renders the trigger element (a tag, component,
 * or default `<div>`) and opens the menu at the pointer on a `contextmenu` gesture.
 * @param {Object} props - Component props.
 * @param {*} props.as - Tag name or component to render as the trigger; defaults to "div".
 * @param {*} props.class - Class string(s) for the trigger.
 * @param {Object} props.classList - Solid-style class toggle map.
 * @param {Function} props.onContextMenu - Optional handler run before the menu opens; may preventDefault to cancel.
 * @param {*} props.children - Trigger content.
 * @param {Function} props.ref - Ref callback invoked with the trigger element.
 * @returns {Node} The trigger element.
 */
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

/**
 * ContextMenu icon slot component.
 * @param {Object} props - Component props.
 * @param {*} props.class - Class string(s) for the slot.
 * @param {Object} props.classList - Solid-style class toggle map.
 * @param {*} props.children - Icon content.
 * @returns {HTMLElement} The icon `<span>` element.
 */
function ContextMenuIcon(props) {
  const [local, rest] = splitProps(props, ["class", "classList", "children"]);
  const el = template(`<span data-slot=context-menu-icon>`);
  applyClassProp(el, local.class);
  applyClassList(el, local.classList);
  applyRestProps(el, rest);
  appendChildren(el, local.children);
  return el;
}

/**
 * ContextMenu portal component. Mounts its children in a container appended to
 * `<body>`, registers it as the menu portal, and removes it on cleanup.
 * @param {Object} props - Component props.
 * @param {*} props.children - Portal content (typically the Content panel).
 * @returns {Comment} A placeholder comment node returned in the original tree position.
 */
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

/**
 * ContextMenu content panel component. Renders the fixed-position menu panel,
 * wires roving keyboard focus (arrows/Home/End/typeahead) and pointer hover
 * highlighting, and registers itself for positioning at the pointer.
 * @param {Object} props - Component props.
 * @param {*} props.class - Class string(s) for the panel.
 * @param {Object} props.classList - Solid-style class toggle map.
 * @param {*} props.children - Menu items and groups.
 * @returns {HTMLElement} The content panel element.
 */
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

/**
 * ContextMenu arrow placeholder (the pointer-positioned menu has no anchor arrow).
 * @returns {null} Always null.
 */
function ContextMenuArrow() {
  return null;
}

/**
 * ContextMenu separator component. Renders a horizontal rule between groups.
 * @param {Object} props - Component props.
 * @param {*} props.class - Class string(s) for the separator.
 * @param {Object} props.classList - Solid-style class toggle map.
 * @returns {HTMLElement} The separator element.
 */
function ContextMenuSeparator(props) {
  const [local, rest] = splitProps(props, ["class", "classList"]);
  const el = template(`<div data-slot=context-menu-separator role=separator>`);
  applyClassProp(el, local.class);
  applyClassList(el, local.classList);
  applyRestProps(el, rest);
  return el;
}

/**
 * ContextMenu group component. Wraps related items in a `role=group` container.
 * @param {Object} props - Component props.
 * @param {*} props.class - Class string(s) for the group.
 * @param {Object} props.classList - Solid-style class toggle map.
 * @param {*} props.children - Grouped items.
 * @returns {HTMLElement} The group element.
 */
function ContextMenuGroup(props) {
  const [local, rest] = splitProps(props, ["class", "classList", "children"]);
  const el = template(`<div data-slot=context-menu-group role=group>`);
  applyClassProp(el, local.class);
  applyClassList(el, local.classList);
  applyRestProps(el, rest);
  appendChildren(el, local.children);
  return el;
}

/**
 * ContextMenu group label component. Renders a non-interactive label for a group.
 * @param {Object} props - Component props.
 * @param {*} props.class - Class string(s) for the label.
 * @param {Object} props.classList - Solid-style class toggle map.
 * @param {*} props.children - Label content.
 * @returns {HTMLElement} The group-label element.
 */
function ContextMenuGroupLabel(props) {
  const [local, rest] = splitProps(props, ["class", "classList", "children"]);
  const el = template(`<div data-slot=context-menu-group-label>`);
  applyClassProp(el, local.class);
  applyClassList(el, local.classList);
  applyRestProps(el, rest);
  appendChildren(el, local.children);
  return el;
}

/**
 * ContextMenu item component. Renders an actionable `role=menuitem` button that
 * fires onSelect (on click or Enter/Space) and closes the menu unless suppressed.
 * @param {Object} props - Component props.
 * @param {*} props.class - Class string(s) for the item.
 * @param {Object} props.classList - Solid-style class toggle map.
 * @param {*} props.children - Item content.
 * @param {Function} props.onSelect - Called with the triggering event when the item is selected.
 * @param {boolean} props.disabled - Whether the item is disabled.
 * @param {boolean} props.closeOnSelect - When false, the menu stays open after selection.
 * @returns {HTMLButtonElement} The menu item button.
 */
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

/**
 * ContextMenu item label component. Renders the primary text of a menu item.
 * @param {Object} props - Component props.
 * @param {*} props.class - Class string(s) for the label.
 * @param {Object} props.classList - Solid-style class toggle map.
 * @param {*} props.children - Label content.
 * @returns {HTMLElement} The item-label `<span>` element.
 */
function ContextMenuItemLabel(props) {
  const [local, rest] = splitProps(props, ["class", "classList", "children"]);
  const el = template(`<span data-slot=context-menu-item-label>`);
  applyClassProp(el, local.class);
  applyClassList(el, local.classList);
  applyRestProps(el, rest);
  appendChildren(el, local.children);
  return el;
}

/**
 * ContextMenu item description component. Renders secondary text under an item.
 * @param {Object} props - Component props.
 * @param {*} props.class - Class string(s) for the description.
 * @param {Object} props.classList - Solid-style class toggle map.
 * @param {*} props.children - Description content.
 * @returns {HTMLElement} The item-description `<span>` element.
 */
function ContextMenuItemDescription(props) {
  const [local, rest] = splitProps(props, ["class", "classList", "children"]);
  const el = template(`<span data-slot=context-menu-item-description>`);
  applyClassProp(el, local.class);
  applyClassList(el, local.classList);
  applyRestProps(el, rest);
  appendChildren(el, local.children);
  return el;
}

/**
 * ContextMenu item indicator component. Renders the selection mark (default
 * check icon) for radio/checkbox items, shown only when selected or force-mounted.
 * @param {Object} props - Component props.
 * @param {*} props.class - Class string(s) for the indicator.
 * @param {Object} props.classList - Solid-style class toggle map.
 * @param {*} props.children - Custom indicator content; defaults to a check icon.
 * @param {boolean} props.forceMount - Always render the indicator regardless of selection.
 * @returns {HTMLElement} The item-indicator `<span>` element.
 */
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

/**
 * ContextMenu radio group component. Provides radio-selection context so child
 * radio items reflect and update the group's selected value.
 * @param {Object} props - Component props.
 * @param {*} props.class - Class string(s) for the group.
 * @param {Object} props.classList - Solid-style class toggle map.
 * @param {*} props.children - Radio items.
 * @param {*} props.value - Currently selected value.
 * @param {Function} props.onChange - Called with the new value when a radio item is selected.
 * @returns {HTMLElement} The radio-group element.
 */
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

/**
 * ContextMenu radio item component. Renders a `role=menuitemradio` button that
 * reflects the group's selection and, on activation, updates the group value.
 * @param {Object} props - Component props.
 * @param {*} props.class - Class string(s) for the item.
 * @param {Object} props.classList - Solid-style class toggle map.
 * @param {*} props.children - Item content.
 * @param {*} props.value - The value this item represents.
 * @param {Function} props.onSelect - Called with the triggering event when selected.
 * @param {boolean} props.disabled - Whether the item is disabled.
 * @param {boolean} props.closeOnSelect - When false, the menu stays open after selection.
 * @returns {HTMLButtonElement} The radio item button.
 */
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

/**
 * ContextMenu checkbox item component. Renders a `role=menuitemcheckbox` button
 * that reflects `checked` and toggles it via onChange on activation.
 * @param {Object} props - Component props.
 * @param {*} props.class - Class string(s) for the item.
 * @param {Object} props.classList - Solid-style class toggle map.
 * @param {*} props.children - Item content.
 * @param {boolean} props.checked - Whether the item is currently checked.
 * @param {Function} props.onChange - Called with the new checked state on toggle.
 * @param {Function} props.onSelect - Called with the triggering event when selected.
 * @param {boolean} props.disabled - Whether the item is disabled.
 * @param {boolean} props.closeOnSelect - When false, the menu stays open after selection.
 * @returns {HTMLButtonElement} The checkbox item button.
 */
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

/**
 * ContextMenu submenu component. A nested menu root reusing the root behavior.
 * @param {Object} props - Component props forwarded to ContextMenuRoot.
 * @returns {HTMLElement} The nested context-menu root element.
 */
function ContextMenuSub(props) {
  return ContextMenuRoot(props);
}

/**
 * ContextMenu submenu trigger component. Renders an item that toggles its
 * nested submenu open/closed on click.
 * @param {Object} props - Component props.
 * @param {*} props.as - Tag name or component to render as; defaults to "button".
 * @param {*} props.class - Class string(s) for the trigger.
 * @param {Object} props.classList - Solid-style class toggle map.
 * @param {*} props.children - Trigger content.
 * @returns {HTMLElement} The sub-trigger element.
 */
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

/**
 * ContextMenu submenu content component. Like Content, but tagged with the
 * sub-content component/slot attributes for nested-menu styling.
 * @param {Object} props - Component props forwarded to ContextMenuContent.
 * @returns {HTMLElement} The sub-content panel element.
 */
function ContextMenuSubContent(props) {
  const el = ContextMenuContent(props);
  el.setAttribute("data-component", "context-menu-sub-content");
  el.setAttribute("data-slot", "context-menu-sub-content");
  return el;
}

/**
 * ContextMenu compound component: the root function augmented with its part
 * components (Trigger, Portal, Content, Item, RadioGroup, Sub, etc.).
 */
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
