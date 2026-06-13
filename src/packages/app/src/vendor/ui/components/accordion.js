// Vanilla reimplementation of @kobalte/core's Accordion behavior (no external UI
// dependency). Derivative of @kobalte/core (MIT License,
// Copyright (c) 2024 jer3m01 <jer3m01@jer3m01.com>). See THIRD-PARTY-NOTICES.md.
import {
  createRenderEffect,
  createSignal,
  createUniqueId,
  splitProps,
  untrack
} from "solid-js";
import { insert } from "solid-js/web";

// Vanilla reimplementation of the original Accordion compound component, modelled
// as a set of collapsibles with single/multiple expansion plus roving focus.
// Faithful to the original accordion a11y: role="region"/aria-labelledby on each
// content, aria-expanded/aria-controls on each trigger, the data-expanded/
// data-closed/data-disabled dataset on item/header/trigger/content, data-key /
// data-value on the trigger, ArrowUp/ArrowDown/Home/End roving focus (wrapping),
// and the --vcc-accordion-content-height var. There is no src/bs twin, so the
// selection + keyboard model mirrors the original accordion directly.
//
// Architecture mirrors src/bs/tabs.js: the Root owns delegated click + keydown
// handlers plus a DOM-walking sync() (run in a render effect) that sets every
// owned item/trigger/header/content attribute from the expanded-keys set. This
// is resilient to items being (re)built in a later reactive tick — e.g. the
// session-context-tab For over streaming messages — which a module-global
// context would not survive. Content stays mounted and is shown/hidden via the
// `hidden` attribute.

function toggleClassKey(el, key, value) {
  for (const name of key.trim().split(/\s+/)) {
    if (name) el.classList.toggle(name, value);
  }
}

function makeClassListApplier(el) {
  const prev = {};
  return next => {
    const value = next || {};
    for (const key in prev) {
      if (!key || value[key]) continue;
      toggleClassKey(el, key, false);
      delete prev[key];
    }
    for (const key in value) {
      const on = !!value[key];
      if (!key || prev[key] === on || !on) continue;
      toggleClassKey(el, key, true);
      prev[key] = on;
    }
  };
}

function applyClassProp(el, local) {
  const applyClasses = makeClassListApplier(el);
  createRenderEffect(() => {
    const cls = local.class ?? local.className;
    applyClasses({ ...local.classList, [cls ?? ""]: !!cls });
  });
}

function appendChildren(parent, children) {
  if (children == null || children === false || children === true) return;
  if (Array.isArray(children)) {
    for (const child of children) appendChildren(parent, child);
    return;
  }
  if (children instanceof Node) {
    parent.appendChild(children);
    return;
  }
  if (typeof children === "function") {
    insert(parent, children);
    return;
  }
  parent.appendChild(document.createTextNode(String(children)));
}

// Apply the consumer's `style` prop (string OR object form) to `el`. Object
// values are set individually so they coexist with styles the component sets
// itself (e.g. the bridged collapsible height vars), while a string overwrites
// cssText wholesale, matching the compiled output. Wrapped in a change-guarded
// render effect by the caller via applyStyleProp.
function applyStyle(el, style) {
  if (typeof style === "string") {
    el.style.cssText = style;
    return;
  }
  if (!style) return;
  for (const key in style) {
    const value = style[key];
    if (value == null) continue;
    if (key.startsWith("--")) el.style.setProperty(key, String(value));
    else el.style[key] = value;
  }
}

// Forward the consumer's `style` prop onto `el` reactively. The render effect is
// change-guarded (identity compare) so unrelated reactive ticks do not re-write
// the element's style — important because consumers (session-turn / message-part)
// set CSS custom props like --sticky-accordion-offset here for sticky headers.
function applyStyleProp(el, local) {
  let prev;
  createRenderEffect(() => {
    const style = local.style;
    if (style === prev) return;
    prev = style;
    if (style == null) return;
    applyStyle(el, style);
  });
}

const CONTROL_KEYS = new Set(["as", "ref", "class", "className", "classList", "children", "value", "disabled", "onClick", "onKeyDown", "id", "style"]);

function applyRest(el, rest, handled) {
  for (const key in rest) {
    if (handled.has(key)) continue;
    if (/^on[A-Z]/.test(key) && typeof rest[key] === "function") {
      el.addEventListener(key.slice(2).toLowerCase(), rest[key]);
    }
  }
  if (typeof rest.ref === "function") rest.ref(el);
  createRenderEffect(() => {
    for (const key in rest) {
      if (handled.has(key) || /^on[A-Z]/.test(key)) continue;
      const value = rest[key];
      if (value == null || value === false) el.removeAttribute(key);
      else el.setAttribute(key, value === true ? "" : String(value));
    }
  });
}

// Normalise an external value (single key or array) into a Set of expanded keys.
function toKeySet(value) {
  const set = new Set();
  if (value == null) return set;
  if (Array.isArray(value)) {
    for (const v of value) if (v != null) set.add(String(v));
  } else {
    set.add(String(value));
  }
  return set;
}

function AccordionRoot(props) {
  const [local, others] = splitProps(props, [
    "class",
    "className",
    "classList",
    "value",
    "defaultValue",
    "onChange",
    "multiple",
    "collapsible",
    "children",
    "style",
    "ref"
  ]);
  const id = `accordion-${createUniqueId()}`;

  // Controllable expanded-keys state. Read props.value every time so controlled
  // usage stays live; fall back to an internal signal when uncontrolled.
  const [uncontrolled, setUncontrolled] = createSignal(toKeySet(untrack(() => local.defaultValue)));
  const isControlled = () => local.value !== undefined;
  const expandedKeys = () => (isControlled() ? toKeySet(local.value) : uncontrolled());

  const isMultiple = () => !!local.multiple;
  // disallowEmptySelection = !multiple && !collapsible (original behaviour).
  const allowEmpty = () => isMultiple() || !!local.collapsible;

  const root = document.createElement("div");
  root.setAttribute("data-component", "accordion");
  root.id = id;

  const ownedBy = el => el.closest('[data-component="accordion"]') === root;

  const setExpanded = next => {
    if (!isControlled()) setUncontrolled(next);
    local.onChange?.(Array.from(next));
  };

  const toggle = key => {
    const current = untrack(expandedKeys);
    let next;
    if (isMultiple()) {
      next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
    } else if (current.has(key)) {
      if (!allowEmpty()) return; // cannot collapse the only open item
      next = new Set();
    } else {
      next = new Set([key]);
    }
    setExpanded(next);
  };

  // Owned triggers in DOM order (for roving focus).
  const orderedTriggers = () =>
    [...root.querySelectorAll('[data-slot="accordion-trigger"]')].filter(ownedBy);

  const itemId = el => el.closest('[data-slot="accordion-item"]');

  // DOM-walking sync: apply the expanded set to every owned part.
  const sync = () => {
    const keys = expandedKeys();
    for (const item of root.querySelectorAll('[data-slot="accordion-item"]')) {
      if (!ownedBy(item)) continue;
      const value = item.dataset.value ?? "";
      const open = keys.has(value);
      const disabled = item.dataset.disabled === "true";
      setOpenAttrs(item, open, disabled);
    }
    for (const header of root.querySelectorAll('[data-slot="accordion-header"]')) {
      if (!ownedBy(header)) continue;
      const item = itemId(header);
      const value = item?.dataset.value ?? "";
      const open = keys.has(value);
      const disabled = item?.dataset.disabled === "true";
      setOpenAttrs(header, open, disabled);
    }
    for (const trigger of root.querySelectorAll('[data-slot="accordion-trigger"]')) {
      if (!ownedBy(trigger)) continue;
      const item = itemId(trigger);
      const value = item?.dataset.value ?? "";
      // The trigger carries its item's value so the delegated click/keyboard can
      // toggle the right key (the trigger isn't attached to its item yet at
      // construction time, so it is set here during sync).
      trigger.dataset.value = value;
      const open = keys.has(value);
      const disabled = item?.dataset.disabled === "true";
      trigger.setAttribute("aria-expanded", open ? "true" : "false");
      trigger.setAttribute("data-key", value);
      const content = item?.querySelector('[data-slot="accordion-content"]');
      if (open && content?.id) trigger.setAttribute("aria-controls", content.id);
      else trigger.removeAttribute("aria-controls");
      setOpenAttrs(trigger, open, disabled);
      if (disabled) {
        trigger.setAttribute("disabled", "");
        trigger.setAttribute("aria-disabled", "true");
        trigger.setAttribute("tabindex", "-1");
      } else {
        trigger.removeAttribute("disabled");
        trigger.removeAttribute("aria-disabled");
        trigger.setAttribute("tabindex", "0");
      }
    }
    for (const content of root.querySelectorAll('[data-slot="accordion-content"]')) {
      if (!ownedBy(content)) continue;
      const item = itemId(content);
      const value = item?.dataset.value ?? "";
      const open = keys.has(value);
      const disabled = item?.dataset.disabled === "true";
      setOpenAttrs(content, open, disabled);
      if (open) content.removeAttribute("hidden");
      else content.setAttribute("hidden", "");
      const trigger = item?.querySelector('[data-slot="accordion-trigger"]');
      if (trigger?.id) content.setAttribute("aria-labelledby", trigger.id);
      const rect = content.getBoundingClientRect?.();
      if (rect && rect.height) content.style.setProperty("--vcc-collapsible-content-height", `${rect.height}px`);
    }
  };

  applyClassProp(root, local);
  applyStyleProp(root, local);
  applyRest(root, others, CONTROL_KEYS);
  if (typeof local.ref === "function") local.ref(root);

  // Click delegation: toggling is driven by the item value carried on the
  // trigger, so a trigger built in any tick is handled correctly.
  root.addEventListener("click", e => {
    const target = e.target instanceof Element ? e.target : null;
    const trigger = target?.closest('[data-slot="accordion-trigger"]');
    if (!trigger || !ownedBy(trigger)) return;
    if (trigger.hasAttribute("disabled")) return;
    const value = trigger.dataset.value;
    if (value == null) return;
    toggle(value);
  });

  // Roving focus: ArrowDown/ArrowUp move between enabled triggers (wrapping),
  // Home/End jump to the ends.
  root.addEventListener("keydown", e => {
    const key = e.key;
    if (key !== "ArrowDown" && key !== "ArrowUp" && key !== "Home" && key !== "End" && key !== "Enter" && key !== " ") return;
    const target = e.target instanceof Element ? e.target.closest('[data-slot="accordion-trigger"]') : null;
    if (!target || !ownedBy(target)) return;
    if (key === "Enter" || key === " ") {
      e.preventDefault();
      if (!target.hasAttribute("disabled") && target.dataset.value != null) toggle(target.dataset.value);
      return;
    }
    const list = orderedTriggers().filter(el => !el.hasAttribute("disabled"));
    if (!list.length) return;
    e.preventDefault();
    const index = list.indexOf(target);
    let nextEl;
    if (key === "Home") nextEl = list[0];
    else if (key === "End") nextEl = list[list.length - 1];
    else if (key === "ArrowDown") nextEl = list[index < 0 ? 0 : (index + 1) % list.length];
    else nextEl = list[index < 0 ? list.length - 1 : (index - 1 + list.length) % list.length];
    nextEl?.focus();
  });

  appendChildren(root, local.children);
  createRenderEffect(sync);

  // Items can be (re)mounted in a later reactive tick (e.g. a For over streaming
  // messages). A MutationObserver re-syncs newly added parts so they pick up
  // their initial aria/hidden/data attributes without an expanded-keys change.
  if (typeof MutationObserver === "function") {
    let scheduled = false;
    const observer = new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      queueMicrotask(() => {
        scheduled = false;
        sync();
      });
    });
    observer.observe(root, { childList: true, subtree: true });
  }
  return root;
}

function setOpenAttrs(el, open, disabled) {
  if (open) {
    el.setAttribute("data-expanded", "");
    el.removeAttribute("data-closed");
  } else {
    el.removeAttribute("data-expanded");
    el.setAttribute("data-closed", "");
  }
  if (disabled) el.setAttribute("data-disabled", "");
  else el.removeAttribute("data-disabled");
}

function AccordionItem(props) {
  const [local, others] = splitProps(props, ["value", "disabled", "class", "className", "classList", "children", "ref"]);
  const value = local.value;
  const el = document.createElement("div");
  el.setAttribute("data-slot", "accordion-item");
  el.id = `accordion-item-${createUniqueId()}`;
  if (value != null) el.dataset.value = String(value);

  createRenderEffect(() => {
    if (local.disabled) el.dataset.disabled = "true";
    else delete el.dataset.disabled;
  });

  applyClassProp(el, local);
  applyRest(el, others, CONTROL_KEYS);
  if (typeof local.ref === "function") local.ref(el);

  appendChildren(el, local.children);
  return el;
}

function AccordionHeader(props) {
  const [local, others] = splitProps(props, ["as", "class", "className", "classList", "children", "ref"]);
  const tag = local.as || "h3";
  const el = document.createElement(tag);
  el.setAttribute("data-slot", "accordion-header");

  applyClassProp(el, local);
  applyRest(el, others, CONTROL_KEYS);
  if (typeof local.ref === "function") local.ref(el);

  appendChildren(el, local.children);
  return el;
}

function AccordionTrigger(props) {
  const [local, others] = splitProps(props, ["class", "className", "classList", "children", "ref", "id"]);
  const el = document.createElement("button");
  el.setAttribute("type", "button");
  el.setAttribute("data-slot", "accordion-trigger");
  el.id = local.id ?? `accordion-trigger-${createUniqueId()}`;

  // The Root's delegated handlers drive selection/keyboard; the Root's sync()
  // copies this trigger's data-value from its owning item once attached.

  applyClassProp(el, local);
  applyRest(el, others, new Set([...CONTROL_KEYS, "id"]));
  if (typeof local.ref === "function") local.ref(el);

  appendChildren(el, local.children);
  return el;
}

function AccordionContent(props) {
  const [local, others] = splitProps(props, ["class", "className", "classList", "children", "id", "style", "ref"]);
  const el = document.createElement("div");
  el.setAttribute("data-slot", "accordion-content");
  el.setAttribute("role", "region");
  el.id = local.id ?? `accordion-content-${createUniqueId()}`;
  // Bridge the collapsible height var to the accordion var, like the original.
  el.style.setProperty("--vcc-accordion-content-height", "var(--vcc-collapsible-content-height)");
  el.style.setProperty("--vcc-accordion-content-width", "var(--vcc-collapsible-content-width)");

  applyClassProp(el, local);
  applyStyleProp(el, local);
  applyRest(el, others, new Set([...CONTROL_KEYS, "id", "style"]));
  if (typeof local.ref === "function") local.ref(el);

  appendChildren(el, local.children);
  return el;
}

export const Accordion = Object.assign(AccordionRoot, {
  Item: AccordionItem,
  Header: AccordionHeader,
  Trigger: AccordionTrigger,
  Content: AccordionContent
});
