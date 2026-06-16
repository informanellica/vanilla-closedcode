/** @file Tabs: a vanilla reimplementation of @kobalte/core's tabs compound component (roving-focus tablist, single selection, aria wiring, panels hidden while unselected). */
// Vanilla reimplementation of @kobalte/core's Tabs behavior (no external UI
// dependency). Derivative of @kobalte/core (MIT License,
// Copyright (c) 2024 jer3m01 <jer3m01@jer3m01.com>). See THIRD-PARTY-NOTICES.md.
import {
  createMemo,
  createRenderEffect,
  createSignal,
  createUniqueId,
  splitProps,
  untrack
} from "../../../lib/reactivity.js";
import { insert } from "../../../lib/reactivity.js";

// Vanilla reimplementation of the original Tabs compound component. Mirrors the
// original tabs primitive: a roving-focus tablist with single selection, the
// data-selected/data-highlighted/data-orientation dataset, role=tab/tablist/
// tabpanel, aria-selected/aria-controls/aria-labelledby/aria-orientation,
// automatic activation (select on focus), and panels hidden while unselected.
//
// Architecture mirrors src/bs/tabs.js: the Root owns delegated click + keydown
// handlers plus a DOM-walking sync() (run in a render effect) that sets every
// owned trigger/content attribute from the selected value. This is resilient to
// triggers/content being (re)built in a later reactive tick (e.g. inside a For
// or a Show), which a module-global context would not survive. The selected
// trigger's inner button carries [data-selected] so tabs.css's
// `:has([data-selected])` rules style the wrapper, exactly like the original.

/**
 * Build a detached DOM element from a static HTML string.
 * @param {string} html - Static markup (trimmed before parsing).
 * @returns {Element} The first element child of the parsed markup.
 */
function template(html) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html.trim();
  return wrapper.firstElementChild;
}

/**
 * Toggle each whitespace-separated class token in a key on/off.
 * @param {HTMLElement} el - Target element.
 * @param {string} key - One or more space-separated class names.
 * @param {boolean} value - True to add the classes, false to remove them.
 * @returns {void}
 */
function toggleClassKey(el, key, value) {
  for (const name of key.trim().split(/\s+/)) {
    if (name) el.classList.toggle(name, value);
  }
}

/**
 * Create a function that diffs a classList map against the previously applied
 * one, adding newly-enabled classes and removing dropped/disabled ones.
 * @param {HTMLElement} el - Target element whose classes are managed.
 * @returns {Function} A function that takes the next classList map and applies the diff.
 */
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

/**
 * Reactively apply class/className/classList props onto an element via a render
 * effect.
 * @param {HTMLElement} el - Target element.
 * @param {Object} local - Local props containing class/className/classList.
 * @returns {void}
 */
function applyClassProp(el, local) {
  const applyClasses = makeClassListApplier(el);
  createRenderEffect(() => {
    const cls = local.class ?? local.className;
    applyClasses({ ...local.classList, [cls ?? ""]: !!cls });
  });
}

/**
 * Append children to a parent node, handling arrays, DOM nodes, reactive
 * accessor functions (tracked via insert()), and primitive text values.
 * @param {Node} parent - Parent element to append into.
 * @param {*} children - Child value(s): node, array, function accessor, or primitive.
 * @returns {void}
 */
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

const CONTROL_KEYS = new Set(["as", "ref", "class", "className", "classList", "children", "value", "variant", "orientation"]);

/**
 * Forward rest props onto an element: on* handlers added via addEventListener,
 * ref invoked with the element, and remaining attributes reapplied in a render
 * effect (removed when null/false). Keys in `handled` are skipped.
 * @param {HTMLElement} el - Target element.
 * @param {Object} rest - Props to forward.
 * @param {Set} handled - Set of prop keys to skip.
 * @returns {void}
 */
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

/**
 * Tabs root: owns single-selection state (controlled via `value` or
 * uncontrolled via `defaultValue`), delegated click/keydown handlers (roving
 * focus with automatic activation), and a DOM-walking sync that sets aria/data
 * attributes on every owned trigger and content panel.
 * @param {Object} props - Component props.
 * @param {string} props.class - Optional class name(s) for the root.
 * @param {string} props.className - Optional alias for class.
 * @param {Object} props.classList - Optional class-name map for the root.
 * @param {string} props.variant - Visual variant ("normal" by default).
 * @param {string} props.orientation - "horizontal" (default) or "vertical".
 * @param {string} props.value - Controlled selected tab value.
 * @param {string} props.defaultValue - Initial selected value when uncontrolled.
 * @param {Function} props.onChange - Called with the new selected value (as a string).
 * @param {*} props.children - Tabs list, triggers, and content panels.
 * @param {Function} props.ref - Ref callback invoked with the root element.
 * @returns {HTMLElement} The tabs root element.
 */
function TabsRoot(props) {
  const [local, others] = splitProps(props, [
    "class",
    "className",
    "classList",
    "variant",
    "orientation",
    "value",
    "defaultValue",
    "onChange",
    "children",
    "ref"
  ]);
  const id = `tabs-${createUniqueId()}`;

  // Controllable single selection. Read props.value every time so controlled
  // usage (external store) stays live; otherwise track internally.
  const [uncontrolled, setUncontrolled] = createSignal(untrack(() => local.defaultValue));
  const isControlled = () => local.value !== undefined && local.value !== null;
  const selectedValue = createMemo(() => (isControlled() ? local.value : uncontrolled()));
  const [highlighted, setHighlighted] = createSignal(untrack(selectedValue));

  const orientation = () => local.orientation || "horizontal";
  const variant = () => local.variant || "normal";

  const root = template(`<div data-component="tabs"></div>`);
  root.id = id;

  const ownedBy = el => el.closest('[data-component="tabs"]') === root;
  const triggerId = value => `${id}-trigger-${value}`;
  const contentId = value => `${id}-content-${value}`;

  const ownedTriggers = () =>
    [...root.querySelectorAll('[data-slot="tabs-trigger"]')].filter(ownedBy);

  /**
   * Select a tab value: updates uncontrolled state and highlight, and fires
   * onChange when the selection actually changed.
   * @param {string} next - The value to select.
   * @returns {void}
   */
  const select = next => {
    if (next == null) return;
    const changed = next !== untrack(selectedValue);
    if (!isControlled()) setUncontrolled(next);
    setHighlighted(next);
    if (changed) local.onChange?.(String(next));
  };

  // DOM-walking sync: apply the selection to every owned trigger + content.
  /**
   * Walk every owned trigger and content panel and set their aria/data
   * attributes (selected/highlighted/disabled/orientation, hidden panels) from
   * the current selection, falling back to the first enabled trigger when the
   * selected value matches none.
   * @returns {void}
   */
  const sync = () => {
    const value = selectedValue();
    const o = orientation();
    root.setAttribute("data-orientation", o);
    root.setAttribute("data-variant", variant());

    // Empty-selection fallback: pick the first enabled trigger (the original's
    // disallowEmptySelection) when the current value matches none.
    const triggers = ownedTriggers();
    const hasValid = value != null && triggers.some(t => (t.dataset.value ?? "") === String(value));
    let active = value;
    if (!hasValid && !isControlled()) {
      const first = triggers.find(t => !t.hasAttribute("disabled"));
      if (first) {
        active = first.dataset.value;
        // Defer the state write out of this read to avoid self-trigger loops.
        if (active !== untrack(selectedValue)) queueMicrotask(() => select(active));
      }
    }

    for (const trigger of triggers) {
      const tv = trigger.dataset.value ?? "";
      if (!trigger.id) trigger.id = triggerId(tv);
      const selected = String(active) === tv;
      const disabled = trigger.hasAttribute("disabled") || trigger.dataset.disabled === "true";
      trigger.setAttribute("aria-selected", selected ? "true" : "false");
      trigger.setAttribute("data-orientation", o);
      trigger.setAttribute("data-key", tv);
      if (selected) {
        trigger.setAttribute("data-selected", "");
        trigger.setAttribute("aria-controls", contentId(tv));
      } else {
        trigger.removeAttribute("data-selected");
        trigger.removeAttribute("aria-controls");
      }
      if (highlighted() != null && String(highlighted()) === tv) trigger.setAttribute("data-highlighted", "");
      else trigger.removeAttribute("data-highlighted");
      if (disabled) {
        trigger.setAttribute("data-disabled", "");
        trigger.setAttribute("aria-disabled", "true");
        trigger.removeAttribute("tabindex");
      } else {
        trigger.removeAttribute("data-disabled");
        trigger.removeAttribute("aria-disabled");
        trigger.setAttribute("tabindex", selected ? "0" : "-1");
      }
    }

    for (const content of root.querySelectorAll('[data-slot="tabs-content"]')) {
      if (!ownedBy(content)) continue;
      const cv = content.dataset.value ?? "";
      if (!content.id) content.id = contentId(cv);
      const selected = String(active) === cv;
      content.setAttribute("data-orientation", o);
      content.setAttribute("aria-labelledby", triggerId(cv));
      if (selected) {
        content.setAttribute("data-selected", "");
        content.removeAttribute("hidden");
      } else {
        content.removeAttribute("data-selected");
        if (!content.hasAttribute("data-force-mount")) content.setAttribute("hidden", "");
        else content.removeAttribute("hidden");
      }
    }
  };

  applyClassProp(root, local);
  applyRest(root, others, CONTROL_KEYS);
  if (typeof local.ref === "function") local.ref(root);

  // Click selection (delegated). The close button must not select.
  root.addEventListener("click", e => {
    const target = e.target instanceof Element ? e.target : null;
    const trigger = target?.closest('[data-slot="tabs-trigger"]');
    if (!trigger || !ownedBy(trigger)) return;
    if (target?.closest('[data-slot="tabs-trigger-close-button"]')) return;
    if (trigger.hasAttribute("disabled")) return;
    const wrapper = trigger.closest('[data-slot="tabs-trigger-wrapper"]');
    select(wrapper?.dataset.value ?? trigger.dataset.value);
  });

  // Roving focus on the tablist: arrow keys move between enabled tabs (wrapping),
  // Home/End jump to ends; automatic activation selects the focused tab.
  root.addEventListener("keydown", e => {
    const o = orientation();
    const nextKey = o === "vertical" ? "ArrowDown" : "ArrowRight";
    const prevKey = o === "vertical" ? "ArrowUp" : "ArrowLeft";
    const { key } = e;
    if (key !== nextKey && key !== prevKey && key !== "Home" && key !== "End") return;
    const active = e.target instanceof Element ? e.target.closest('[data-slot="tabs-trigger"]') : null;
    if (!active || !ownedBy(active)) return;
    if (!active.closest('[data-slot="tabs-list"]')) return;
    const list = ownedTriggers().filter(t => !t.hasAttribute("disabled"));
    if (!list.length) return;
    e.preventDefault();
    const index = list.indexOf(active);
    let nextEl;
    if (key === "Home") nextEl = list[0];
    else if (key === "End") nextEl = list[list.length - 1];
    else if (key === nextKey) nextEl = list[index < 0 ? 0 : (index + 1) % list.length];
    else nextEl = list[index < 0 ? list.length - 1 : (index - 1 + list.length) % list.length];
    if (!nextEl) return;
    nextEl.focus();
    select(nextEl.dataset.value); // automatic activation
  });

  appendChildren(root, local.children);
  createRenderEffect(sync);

  // Triggers/content can be (re)mounted in a later tick (For/Show); re-sync so
  // newly added parts pick up their initial aria/hidden/data attributes.
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

/**
 * Tabs list: the role="tablist" container that holds the triggers; its
 * orientation attributes are kept in sync by the root.
 * @param {Object} props - Component props.
 * @param {string} props.class - Optional class name(s).
 * @param {string} props.className - Optional alias for class.
 * @param {Object} props.classList - Optional class-name map.
 * @param {*} props.children - Tab triggers.
 * @param {Function} props.ref - Ref callback invoked with the list element.
 * @returns {HTMLElement} The tablist element.
 */
function TabsList(props) {
  const [local, others] = splitProps(props, ["class", "className", "classList", "children", "ref"]);
  const el = template(`<div data-slot="tabs-list"></div>`);
  el.setAttribute("role", "tablist");
  // aria-orientation/data-orientation are kept in sync by the Root's sync(), but
  // seed them so the list is valid before the first sync runs.
  el.setAttribute("aria-orientation", "horizontal");
  el.setAttribute("data-orientation", "horizontal");

  applyClassProp(el, local);
  applyRest(el, others, CONTROL_KEYS);
  if (typeof local.ref === "function") local.ref(el);

  appendChildren(el, local.children);
  return el;
}

/**
 * Tabs trigger: an outer wrapper (carrying data-value and an optional close
 * button) around the inner role="tab" button that carries [data-selected].
 * Supports middle-click "close tab" and an optional close-button slot.
 * @param {Object} props - Component props.
 * @param {string} props.class - Optional class name(s), folded onto the wrapper.
 * @param {string} props.className - Optional alias for class.
 * @param {Object} props.classList - Optional class-name map for the wrapper.
 * @param {Object} props.classes - Optional slot classes (e.g. classes.button for the inner button).
 * @param {*} props.children - Trigger label content.
 * @param {string} props.value - This tab's value.
 * @param {boolean} props.disabled - Disables the trigger.
 * @param {*} props.closeButton - Optional close-button content (renders a close slot).
 * @param {boolean} props.hideCloseButton - Hides the close button when true.
 * @param {Function} props.onMiddleClick - Called on middle-click (close-tab gesture).
 * @param {Function} props.onClick - Called when the inner button is clicked.
 * @param {Function} props.ref - Ref callback invoked with the inner button.
 * @returns {HTMLElement} The trigger wrapper element.
 */
function TabsTrigger(props) {
  const [local, others] = splitProps(props, [
    "class",
    "className",
    "classList",
    "classes",
    "children",
    "value",
    "disabled",
    "closeButton",
    "hideCloseButton",
    "onMiddleClick",
    "onClick",
    "ref"
  ]);
  const value = local.value;

  // Outer wrapper carries data-value + the close button; the inner button is the
  // actual trigger that carries [data-selected] (tabs.css styles the wrapper via
  // :has([data-selected])).
  const wrapper = template(`<div data-slot="tabs-trigger-wrapper"></div>`);
  if (value != null) wrapper.dataset.value = value;

  const button = template(`<button type="button" data-slot="tabs-trigger"></button>`);
  button.setAttribute("role", "tab");
  if (value != null) button.dataset.value = value;
  createRenderEffect(() => {
    if (local.disabled) button.dataset.disabled = "true";
    else delete button.dataset.disabled;
  });

  // Middle-click "close tab": suppress autoscroll on mousedown, fire on auxclick.
  wrapper.addEventListener("auxclick", e => {
    if (e.button === 1 && typeof local.onMiddleClick === "function") {
      e.preventDefault();
      local.onMiddleClick(e);
    }
  });
  wrapper.addEventListener("mousedown", e => {
    if (e.button === 1 && typeof local.onMiddleClick === "function") e.preventDefault();
  });
  if (typeof local.onClick === "function") button.addEventListener("click", local.onClick);

  // class/classList fold onto the wrapper (matching the original); the optional
  // classes.button goes onto the inner button.
  applyClassProp(wrapper, local);
  if (local.classes?.button) {
    const applyButtonClasses = makeClassListApplier(button);
    createRenderEffect(() => {
      applyButtonClasses({ [local.classes?.button ?? ""]: !!local.classes?.button });
    });
  }
  applyRest(button, others, new Set([...CONTROL_KEYS, "classes", "closeButton", "hideCloseButton", "onMiddleClick", "onClick", "disabled"]));
  if (typeof local.ref === "function") local.ref(button);

  appendChildren(button, local.children);
  wrapper.appendChild(button);

  // Optional close button slot (rebuilt when truthiness flips, like the original
  // Show), kept live so its content tracks.
  const hasCloseButton = createMemo(() => !!local.closeButton);
  insert(wrapper, createMemo(() => {
    if (!hasCloseButton()) return undefined;
    const closeEl = template(`<div data-slot="tabs-trigger-close-button"></div>`);
    appendChildren(closeEl, local.closeButton);
    createRenderEffect(() => {
      if (local.hideCloseButton) closeEl.setAttribute("data-hidden", "true");
      else closeEl.removeAttribute("data-hidden");
    });
    return closeEl;
  }), null);

  return wrapper;
}

/**
 * Tabs content: a role="tabpanel" element associated with a trigger value;
 * hidden by the root while unselected unless forceMount is set.
 * @param {Object} props - Component props.
 * @param {string} props.class - Optional class name(s).
 * @param {string} props.className - Optional alias for class.
 * @param {Object} props.classList - Optional class-name map.
 * @param {*} props.children - Panel content.
 * @param {string} props.value - The trigger value this panel belongs to.
 * @param {boolean} props.forceMount - Keeps the panel mounted (not hidden) when unselected.
 * @param {string} props.id - Optional explicit element id.
 * @param {Function} props.ref - Ref callback invoked with the panel element.
 * @returns {HTMLElement} The tabpanel element.
 */
function TabsContent(props) {
  const [local, others] = splitProps(props, ["class", "className", "classList", "children", "value", "forceMount", "id", "ref"]);
  const value = local.value;
  const el = template(`<div data-slot="tabs-content"></div>`);
  el.setAttribute("role", "tabpanel");
  if (local.id != null) el.id = local.id;
  if (value != null) el.dataset.value = value;
  if (local.forceMount) el.setAttribute("data-force-mount", "");

  applyClassProp(el, local);
  applyRest(el, others, new Set([...CONTROL_KEYS, "forceMount", "id"]));
  if (typeof local.ref === "function") local.ref(el);

  appendChildren(el, local.children);
  return el;
}

/**
 * Tabs section title: a non-interactive label slot placed within the tablist.
 * @param {Object} props - Component props.
 * @param {*} props.children - Title content (may be reactive).
 * @returns {HTMLElement} The section-title element.
 */
const TabsSectionTitle = props => {
  const el = template(`<div data-slot="tabs-section-title"></div>`);
  // Children may be reactive (components, accessors), so keep them live.
  appendChildren(el, props.children);
  return el;
};

/**
 * The Tabs compound component: TabsRoot with List, Trigger, Content, and
 * SectionTitle attached as static members.
 */
export const Tabs = Object.assign(TabsRoot, {
  List: TabsList,
  Trigger: TabsTrigger,
  Content: TabsContent,
  SectionTitle: TabsSectionTitle
});
