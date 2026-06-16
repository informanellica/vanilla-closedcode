/** @file Vanilla DropdownMenu component family (Root/Trigger/Content/Items) reimplementing @kobalte/core behavior without an external UI dependency. */
// Vanilla reimplementation of @kobalte/core's DropdownMenu behavior (no external UI
// dependency). Derivative of @kobalte/core (MIT License,
// Copyright (c) 2024 jer3m01 <jer3m01@jer3m01.com>). See THIRD-PARTY-NOTICES.md.
import { createRenderEffect, getOwner, onCleanup } from "../../../lib/reactivity.js";
import { insert } from "../../../lib/reactivity.js";
import { Icon } from "./icon.js";

// Vanilla DropdownMenu (no third-party UI dependency): mirrors bs/dropdown-menu.js
// techniques — module-variable context for the compound parts, a fixed-position
// portal under <body>, document-level dismissal (Esc + outside pointerdown),
// roving keyboard focus (arrows/Home/End/typeahead), and aria menu/menuitem
// roles — but emits this vendor's data-component/data-slot contract and the
// CSS-driven state attributes (data-expanded/data-closed/data-highlighted/
// data-disabled/data-checked) that ./dropdown-menu.css styles.

/**
 * Parse an HTML snippet and return its first element node.
 * @param {string} html - The HTML markup to instantiate.
 * @returns {HTMLElement} The first element child of the parsed markup.
 */
function template(html) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html.trim();
  return wrapper.firstElementChild;
}

// Forward each key as a getter rather than copying its value once —
// createComponent props are signal-backed getters, and a value copy would
// freeze every controlled prop (open/checked/disabled/value/placement/…) at
// its creation-time value. Mirrors Solid's own splitProps semantics.
/**
 * Split props into the named keys and the rest, forwarding each as a live getter.
 * @param {Object} props - The source props object (signal-backed getters).
 * @param {Array} keys - Property names to route into the first result object.
 * @returns {Array} A two-element array [local, rest] of getter-forwarding objects.
 */
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
 * Append children (nodes, arrays, text, or reactive accessors) to a parent element.
 * @param {Node} parent - The element to append into.
 * @param {*} children - The children value: Node, array, string, or function accessor.
 * @param {Function} wrap - Optional wrapper re-establishing menu context around lazy children.
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
    // evaluation — Show/For re-create their children long after the synchronous
    // build restored the previous context.
    insert(parent, wrap ? () => wrap(children) : children);
    return;
  }
  parent.appendChild(document.createTextNode(String(children)));
}

/**
 * Toggle classes on an element from a Solid-style classList record.
 * @param {HTMLElement} el - The target element.
 * @param {Object} classList - Map of (possibly space-separated) class keys to booleans.
 * @returns {void}
 */
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

/**
 * Apply leftover props to an element as event handlers, properties, or attributes.
 * @param {HTMLElement} el - The target element.
 * @param {Object} rest - The remaining props (excludes class/classList/children).
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
 * Add the space-separated classes from a `class` prop to an element.
 * @param {HTMLElement} el - The target element.
 * @param {string} value - The class string to apply.
 * @returns {void}
 */
function applyClassProp(el, value) {
  if (value) el.classList.add(...String(value).split(/\s+/).filter(Boolean));
}

let DropdownContext = null;
let RadioContext = null;
let nextId = 0;

/**
 * Read the current DropdownMenu context shared by the compound parts.
 * @returns {Object} The active dropdown state, or null when outside a menu.
 */
function useDropdown() {
  return DropdownContext;
}

/**
 * Read the current radio-group context shared by radio items and indicators.
 * @returns {Object} The active radio state, or null when outside a radio group.
 */
function useRadio() {
  return RadioContext;
}

// Roving-focus / keyboard helpers shared by Content. Items are the focusable
// menu controls (buttons) rendered inside the content panel.
/**
 * Collect the focusable, non-disabled menu controls inside a content panel.
 * @param {HTMLElement} contentEl - The dropdown content element to query.
 * @returns {Array} The enabled item elements in document order.
 */
function menuItems(contentEl) {
  if (!contentEl) return [];
  return Array.from(
    contentEl.querySelectorAll(
      '[data-slot="dropdown-menu-item"],[data-slot="dropdown-menu-checkbox-item"],[data-slot="dropdown-menu-radio-item"],[data-slot="dropdown-menu-sub-trigger"]'
    )
  ).filter(el => el.getAttribute("data-disabled") == null && !el.disabled);
}

/**
 * Mark one item as highlighted (clearing the others) and move focus to it.
 * @param {Array} items - The candidate item elements.
 * @param {HTMLElement} target - The item to highlight and focus.
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
 * Create the shared open/position state controlling a dropdown menu instance.
 * Supports controlled and uncontrolled open state, fixed-position placement under
 * the trigger, and registration of the root/trigger/content/portal elements.
 * @param {Object} local - The menu's local props (open, defaultOpen, onOpenChange, placement, gutter).
 * @returns {Object} The dropdown state API used by the compound parts.
 */
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

  /**
   * Position the open content panel relative to the trigger, clamped to the viewport.
   * @returns {void}
   */
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

  /**
   * Reflect the current open state onto the trigger and content (aria + data attributes + display).
   * @returns {void}
   */
  const sync = () => {
    const open = isOpen();
    if (triggerEl) {
      triggerEl.setAttribute("aria-expanded", open ? "true" : "false");
      if (open) triggerEl.setAttribute("data-expanded", "");
      else triggerEl.removeAttribute("data-expanded");
    }
    if (contentEl) {
      // data-expanded/data-closed drive the open/close keyframes in the CSS.
      if (open) {
        contentEl.setAttribute("data-expanded", "");
        contentEl.removeAttribute("data-closed");
      } else {
        contentEl.removeAttribute("data-expanded");
        contentEl.setAttribute("data-closed", "");
      }
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
 * Create the shared selection state for a dropdown radio group.
 * Tracks registered radio items and their indicators and keeps their checked
 * state in sync with the controlled group value.
 * @param {Object} local - The radio group's local props (value, onChange).
 * @returns {Object} The radio state API used by RadioGroup, RadioItem, and ItemIndicator.
 */
function createRadioState(local) {
  const items = new Set();
  const indicators = new Set();
  const readValue = () => local.value;
  /**
   * Re-apply checked/visible state to all registered items and indicators.
   * @returns {void}
   */
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
 * Root of the dropdown menu: owns the menu state and wires document-level dismissal.
 * Establishes the menu context for its descendants, attaches outside-pointerdown and
 * Escape handlers, and re-syncs on controlled prop changes.
 * @param {Object} props - Menu props: open, defaultOpen, onOpenChange, gutter, placement, class, classList, children, plus pass-through attributes.
 * @returns {HTMLElement} The root menu container element.
 */
function DropdownMenuRoot(props) {
  const [local, rest] = splitProps(props, ["open", "defaultOpen", "onOpenChange", "gutter", "placement", "class", "classList", "children"]);
  const previousContext = DropdownContext;
  const state = createDropdownState(local);
  DropdownContext = state;

  const rootEl = template(`<div data-component=dropdown-menu>`);
  state.registerRoot(rootEl);

  applyClassProp(rootEl, local.class);
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
    // Content/portal live under <body> (position:fixed) — clicks on the menu's
    // own controls are NOT outside clicks.
    if (state.content()?.contains(event.target)) return;
    if (state.portal()?.contains(event.target)) return;
    state.close();
  };
  const onDocKeyDown = event => {
    if (!rootEl.isConnected) {
      removeDocListeners();
      return;
    }
    if (event.key === "Escape" && state.isOpen()) {
      state.close();
      state.trigger()?.focus();
    }
  };

  document.addEventListener("pointerdown", onDocPointer, true);
  document.addEventListener("keydown", onDocKeyDown, true);
  if (getOwner()) onCleanup(removeDocListeners);

  // Controlled props are live getters — re-sync when the owner changes them.
  // placement/gutter affect the position computation.
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

/**
 * Trigger control that toggles the menu and provides keyboard open/focus behavior.
 * @param {Object} props - Trigger props: as (tag name or component), class, classList, onClick, onKeyDown, children, ref, plus pass-through attributes.
 * @returns {HTMLElement} The trigger element (a button by default, or the element produced by `as`).
 */
function DropdownMenuTrigger(props) {
  const ctx = useDropdown();
  const [local, rest] = splitProps(props, ["as", "class", "classList", "onClick", "onKeyDown", "children", "ref"]);
  const tag = local.as || "button";
  // `as` may be a component function (e.g. IconButton), not a tag name —
  // passing a function to document.createElement throws InvalidCharacterError.
  // Invoke component `as` with the rest props (icon/variant/…) and use the
  // returned element as the trigger; class/classList/children are applied by
  // the shared code below either way.
  const asComponent = typeof tag === "function";
  let triggerEl;
  if (asComponent) {
    // Pass `rest` as-is: spreading it would evaluate the forwarded getters and
    // freeze signal-backed props at their first value.
    const produced = tag(rest);
    triggerEl = produced instanceof Node ? produced : document.createElement("button");
  } else {
    triggerEl = document.createElement(tag);
    if (tag === "button") triggerEl.type = "button";
  }
  triggerEl.setAttribute("data-slot", "dropdown-menu-trigger");
  triggerEl.setAttribute("aria-haspopup", "menu");
  triggerEl.id = ctx?.triggerId || "";
  triggerEl.setAttribute("aria-expanded", ctx?.isOpen() ? "true" : "false");
  applyClassProp(triggerEl, local.class);
  applyClassList(triggerEl, local.classList);
  if (!asComponent) applyRestProps(triggerEl, rest);

  triggerEl.addEventListener("click", event => {
    local.onClick?.(event);
    if (event?.defaultPrevented) return;
    ctx?.toggle?.();
  });
  triggerEl.addEventListener("keydown", event => {
    local.onKeyDown?.(event);
    if (event?.defaultPrevented) return;
    // Open and move focus into the menu on arrow / Enter / Space.
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      if (!ctx?.isOpen()) {
        event.preventDefault();
        ctx?.setOpen?.(true);
        requestAnimationFrame(() => {
          const items = ctx?.items?.() ?? [];
          highlight(items, items[0]);
        });
      }
    } else if (event.key === "ArrowUp") {
      if (!ctx?.isOpen()) {
        event.preventDefault();
        ctx?.setOpen?.(true);
        requestAnimationFrame(() => {
          const items = ctx?.items?.() ?? [];
          highlight(items, items[items.length - 1]);
        });
      }
    }
  });

  if (ctx?.registerTrigger) ctx.registerTrigger(triggerEl);
  local.ref?.(triggerEl);
  appendChildren(triggerEl, local.children);
  return triggerEl;
}

/**
 * Inline icon slot rendered inside the trigger.
 * @param {Object} props - Props: class, classList, children, plus pass-through attributes.
 * @returns {HTMLElement} The icon span element.
 */
function DropdownMenuIcon(props) {
  const [local, rest] = splitProps(props, ["class", "classList", "children"]);
  const el = template(`<span data-slot=dropdown-menu-icon>`);
  applyClassProp(el, local.class);
  applyClassList(el, local.classList);
  applyRestProps(el, rest);
  appendChildren(el, local.children);
  return el;
}

/**
 * Portal that mounts its children under document.body and registers them with the menu.
 * Returns a comment placeholder for the original tree; the portal node is removed on cleanup.
 * @param {Object} props - Props: children to mount in the portal.
 * @returns {Node} A comment node standing in for the portal in the source tree.
 */
function DropdownMenuPortal(props) {
  const ctx = useDropdown();
  const portal = document.createElement("div");
  portal.setAttribute("data-component", "dropdown-menu-portal");
  document.body.appendChild(portal);
  appendChildren(portal, props.children);
  // Register so the outside-click handler can tell portal clicks apart, and
  // remove the body-mounted node with the owning component (it would otherwise
  // accumulate under <body> on every re-render).
  ctx?.registerPortal?.(portal);
  if (getOwner()) onCleanup(() => portal.remove());
  return document.createComment("dropdown-menu-portal");
}

/**
 * Floating menu panel holding the items, with roving-focus, typeahead, and hover highlight.
 * Positioned fixed and shown/hidden by the menu state; arrow/Home/End/typeahead keys move the
 * highlight, and pointer movement highlights the hovered item.
 * @param {Object} props - Props: class, classList, children, plus pass-through attributes.
 * @returns {HTMLElement} The content panel element.
 */
function DropdownMenuContent(props) {
  const ctx = useDropdown();
  const [local, rest] = splitProps(props, ["class", "classList", "children"]);
  const el = template(`<div data-component=dropdown-menu-content role=menu tabindex=-1>`);

  el.setAttribute("data-slot", "dropdown-menu-content");
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
      // Typeahead: match item text by the accumulated keystrokes.
      typeahead += event.key.toLowerCase();
      clearTimeout(typeaheadTimer);
      typeaheadTimer = setTimeout(() => (typeahead = ""), 500);
      const match = items.find(item => (item.textContent || "").trim().toLowerCase().startsWith(typeahead));
      if (match) highlight(items, match);
    }
  });
  // Track the pointer-hovered item as the highlighted one (mouse + keyboard
  // share the same data-highlighted state).
  el.addEventListener("pointermove", event => {
    const item = event.target?.closest?.(
      '[data-slot="dropdown-menu-item"],[data-slot="dropdown-menu-checkbox-item"],[data-slot="dropdown-menu-radio-item"],[data-slot="dropdown-menu-sub-trigger"]'
    );
    if (!item || el !== item.closest('[data-component="dropdown-menu-content"]')) return;
    if (item.getAttribute("data-disabled") != null || item.disabled) return;
    highlight(ctx?.items?.() ?? [], item);
  });

  if (ctx?.registerContent) ctx.registerContent(el);
  ctx?.positionContent?.();
  return el;
}

/**
 * Arrow part kept for API compatibility; this implementation renders nothing.
 * @returns {null} Always null.
 */
function DropdownMenuArrow() {
  return null;
}

/**
 * Horizontal separator between groups of menu items.
 * @param {Object} props - Props: class, classList, plus pass-through attributes.
 * @returns {HTMLElement} The separator element.
 */
function DropdownMenuSeparator(props) {
  const [local, rest] = splitProps(props, ["class", "classList"]);
  const el = template(`<div data-slot=dropdown-menu-separator role=separator>`);
  applyClassProp(el, local.class);
  applyClassList(el, local.classList);
  applyRestProps(el, rest);
  return el;
}

/**
 * Semantic grouping wrapper for related menu items.
 * @param {Object} props - Props: class, classList, children, plus pass-through attributes.
 * @returns {HTMLElement} The group container element.
 */
function DropdownMenuGroup(props) {
  const [local, rest] = splitProps(props, ["class", "classList", "children"]);
  const el = template(`<div data-slot=dropdown-menu-group role=group>`);
  applyClassProp(el, local.class);
  applyClassList(el, local.classList);
  applyRestProps(el, rest);
  appendChildren(el, local.children);
  return el;
}

/**
 * Label heading for a menu group.
 * @param {Object} props - Props: class, classList, children, plus pass-through attributes.
 * @returns {HTMLElement} The group label element.
 */
function DropdownMenuGroupLabel(props) {
  const [local, rest] = splitProps(props, ["class", "classList", "children"]);
  const el = template(`<div data-slot=dropdown-menu-group-label>`);
  applyClassProp(el, local.class);
  applyClassList(el, local.classList);
  applyRestProps(el, rest);
  appendChildren(el, local.children);
  return el;
}

/**
 * Selectable menu item that fires onSelect and closes the menu (unless closeOnSelect is false).
 * @param {Object} props - Props: class, classList, children, onSelect, disabled (reactive), closeOnSelect, plus pass-through attributes.
 * @returns {HTMLElement} The item button element.
 */
function DropdownMenuItem(props) {
  const ctx = useDropdown();
  const [local, rest] = splitProps(props, ["class", "classList", "children", "onSelect", "disabled", "closeOnSelect"]);
  const el = template(`<button type=button data-slot=dropdown-menu-item role=menuitem tabindex=-1>`);
  applyClassProp(el, local.class);
  applyClassList(el, local.classList);
  applyRestProps(el, rest);
  // disabled is signal-backed — track it like CheckboxItem/RadioItem do.
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
 * Primary text label inside a menu item.
 * @param {Object} props - Props: class, classList, children, plus pass-through attributes.
 * @returns {HTMLElement} The item label element.
 */
function DropdownMenuItemLabel(props) {
  const [local, rest] = splitProps(props, ["class", "classList", "children"]);
  const el = template(`<span data-slot=dropdown-menu-item-label>`);
  applyClassProp(el, local.class);
  applyClassList(el, local.classList);
  applyRestProps(el, rest);
  appendChildren(el, local.children);
  return el;
}

/**
 * Secondary description text inside a menu item.
 * @param {Object} props - Props: class, classList, children, plus pass-through attributes.
 * @returns {HTMLElement} The item description element.
 */
function DropdownMenuItemDescription(props) {
  const [local, rest] = splitProps(props, ["class", "classList", "children"]);
  const el = template(`<span data-slot=dropdown-menu-item-description>`);
  applyClassProp(el, local.class);
  applyClassList(el, local.classList);
  applyRestProps(el, rest);
  appendChildren(el, local.children);
  return el;
}

/**
 * Check-mark indicator shown when the enclosing radio/checkbox item is selected.
 * Visible when forceMount is set, when outside a radio context, or when the item is selected.
 * @param {Object} props - Props: class, classList, children (defaults to a check icon), forceMount, plus pass-through attributes.
 * @returns {HTMLElement} The indicator span element.
 */
function DropdownMenuItemIndicator(props) {
  const radio = useRadio();
  const [local, rest] = splitProps(props, ["class", "classList", "children", "forceMount"]);
  const el = template(`<span data-slot=dropdown-menu-item-indicator>`);
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
 * Radio group that establishes radio context so its items share a single selected value.
 * @param {Object} props - Props: class, classList, children, value (controlled), onChange, plus pass-through attributes.
 * @returns {HTMLElement} The radio group container element.
 */
function DropdownMenuRadioGroup(props) {
  const [local, rest] = splitProps(props, ["class", "classList", "children", "value", "onChange"]);
  const previous = RadioContext;
  const state = createRadioState(local);
  RadioContext = state;
  const el = template(`<div data-slot=dropdown-menu-radio-group role=group>`);
  applyClassProp(el, local.class);
  applyClassList(el, local.classList);
  applyRestProps(el, rest);
  appendChildren(el, local.children);
  RadioContext = previous;
  // Controlled group value is a live getter — re-sync the items when the parent
  // changes it (not only via our own onChange).
  createRenderEffect(() => {
    void local.value;
    state.sync();
  });
  return el;
}

/**
 * Single-select radio item that updates its group's value when chosen.
 * @param {Object} props - Props: class, classList, children, value, onSelect, disabled (reactive), closeOnSelect, plus pass-through attributes.
 * @returns {HTMLElement} The radio item button element.
 */
function DropdownMenuRadioItem(props) {
  const dropdown = useDropdown();
  const group = useRadio();
  const [local, rest] = splitProps(props, ["class", "classList", "children", "value", "onSelect", "disabled", "closeOnSelect"]);
  const el = template(`<button type=button data-slot=dropdown-menu-radio-item role=menuitemradio tabindex=-1>`);
  const value = local.value;

  applyClassProp(el, local.class);
  applyClassList(el, local.classList);
  applyRestProps(el, rest);
  // disabled and the selected state are signal-backed — track them.
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
    dropdown?.close?.();
  });
  el.addEventListener("keydown", event => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    el.click();
  });

  // The group's isSelected(value) takes the candidate value, but ItemIndicator
  // calls isSelected() with no argument — give the children an item-bound
  // context so the check mark shows.
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
 * Toggleable checkbox item that reports its new checked state via onChange.
 * @param {Object} props - Props: class, classList, children, checked (reactive), onChange, onSelect, disabled (reactive), closeOnSelect, plus pass-through attributes.
 * @returns {HTMLElement} The checkbox item button element.
 */
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
  const el = template(`<button type=button data-slot=dropdown-menu-checkbox-item role=menuitemcheckbox tabindex=-1>`);

  applyClassProp(el, local.class);
  applyClassList(el, local.classList);
  applyRestProps(el, rest);
  // checked/disabled are signal-backed (controlled by the parent's store);
  // reading them once would freeze the checkbox. Re-apply reactively, read live
  // in the click handler.
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
    dropdown?.close?.();
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
 * Submenu root; reuses the Root behavior to manage a nested menu.
 * @param {Object} props - Same props as DropdownMenuRoot.
 * @returns {HTMLElement} The submenu root element.
 */
function DropdownMenuSub(props) {
  return DropdownMenuRoot(props);
}

/**
 * Trigger inside a parent menu panel that opens its submenu.
 * @param {Object} props - Props: as (tag name or component), class, classList, children, plus pass-through attributes.
 * @returns {HTMLElement} The sub-trigger element.
 */
function DropdownMenuSubTrigger(props) {
  // SubTrigger is rendered inside a menu panel; tag it with the sub-trigger slot
  // so the CSS targets it, then reuse the Trigger behavior.
  const ctx = useDropdown();
  const [local, rest] = splitProps(props, ["as", "class", "classList", "children"]);
  const tag = local.as || "button";
  const el = typeof tag === "function" ? document.createElement("button") : document.createElement(tag);
  if (el.tagName === "BUTTON") el.type = "button";
  el.setAttribute("data-slot", "dropdown-menu-sub-trigger");
  el.setAttribute("aria-haspopup", "menu");
  el.setAttribute("tabindex", "-1");
  applyClassProp(el, local.class);
  applyClassList(el, local.classList);
  applyRestProps(el, rest);
  el.addEventListener("click", () => ctx?.toggle?.());
  if (ctx?.registerTrigger) ctx.registerTrigger(el);
  appendChildren(el, local.children);
  return el;
}

/**
 * Submenu content panel; the Content panel retagged so its CSS can target it distinctly.
 * @param {Object} props - Same props as DropdownMenuContent.
 * @returns {HTMLElement} The sub-content panel element.
 */
function DropdownMenuSubContent(props) {
  const el = DropdownMenuContent(props);
  // Same panel, distinct data-component so ./dropdown-menu.css can target it.
  el.setAttribute("data-component", "dropdown-menu-sub-content");
  el.setAttribute("data-slot", "dropdown-menu-sub-content");
  return el;
}

/**
 * The DropdownMenu compound component: the Root callable with all parts attached
 * (Trigger, Content, Item, RadioGroup/RadioItem, CheckboxItem, Sub/SubTrigger/SubContent, etc.).
 */
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
