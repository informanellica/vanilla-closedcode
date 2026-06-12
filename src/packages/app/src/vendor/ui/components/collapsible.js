import {
  createComponent,
  createRenderEffect,
  createSignal,
  createUniqueId,
  splitProps,
  untrack
} from "solid-js";
import { insert } from "solid-js/web";
import { Icon } from "./icon.js";

// Vanilla reimplementation of the Kobalte Collapsible compound component.
// Mirrors the Kobalte collapsible behaviour: a controllable open state, the
// data-expanded/data-closed/data-disabled dataset on root + trigger + content,
// aria-expanded/aria-controls on the trigger, the --vcc-collapsible-content-height
// CSS var, a polymorphic trigger (`as`), and content that is hidden while closed.
//
// Architecture mirrors the hand-written src/bs/collapsible.js: the Root owns a
// click-delegated handler plus a DOM-walking sync() (run inside a render effect)
// that sets every owned trigger/content's attributes from the open state. This
// is resilient to triggers/content being (re)built in a later reactive tick
// (e.g. inside basic-tool's createMemo when the href flips, or a For), which a
// module-global context would not survive. Children stay mounted and are
// shown/hidden via the `hidden` attribute, exactly like src/bs/collapsible.js.

function applyStyle(el, style) {
  if (style == null) {
    el.removeAttribute("style");
    return;
  }
  if (typeof style === "string") {
    el.style.cssText = style;
    return;
  }
  for (const key in style) {
    const value = style[key];
    if (value == null) continue;
    if (key.startsWith("--")) el.style.setProperty(key, String(value));
    else el.style[key] = value;
  }
}

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

const CONTROL_KEYS = new Set(["as", "ref", "class", "className", "classList", "style", "children", "onClick"]);

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

function CollapsibleRoot(props) {
  const [local, others] = splitProps(props, [
    "class",
    "className",
    "classList",
    "variant",
    "open",
    "defaultOpen",
    "onOpenChange",
    "disabled",
    "forceMount",
    "children",
    "style",
    "ref"
  ]);
  const id = `collapsible-${createUniqueId()}`;
  const contentId = `${id}-content`;

  // Controllable open state: read props.open every time so external (controlled)
  // updates stay live; fall back to an internal signal when uncontrolled.
  const [uncontrolled, setUncontrolled] = createSignal(!!untrack(() => local.defaultOpen));
  const isControlled = () => local.open !== undefined;
  const isOpen = () => (isControlled() ? !!local.open : uncontrolled());

  const root = document.createElement("div");
  root.setAttribute("data-component", "collapsible");

  const toggle = () => {
    if (local.disabled) return;
    const value = !untrack(isOpen);
    if (!isControlled()) setUncontrolled(value);
    local.onOpenChange?.(value);
  };

  // Only this root's own slots (nested collapsibles in the file tree must not
  // steal each other's triggers/content).
  const ownedBy = el => el.closest('[data-component="collapsible"]') === root;

  // DOM-walking sync: set every owned trigger/content attribute from the open
  // state. Run inside a render effect so it follows controlled `open` changes,
  // and called again after children mount.
  const sync = () => {
    const open = isOpen();
    const disabled = !!local.disabled;
    root.dataset.variant = local.variant || "normal";
    if (open) {
      root.setAttribute("data-expanded", "");
      root.removeAttribute("data-closed");
    } else {
      root.removeAttribute("data-expanded");
      root.setAttribute("data-closed", "");
    }
    if (disabled) root.setAttribute("data-disabled", "");
    else root.removeAttribute("data-disabled");

    for (const trigger of root.querySelectorAll('[data-slot="collapsible-trigger"]')) {
      if (!ownedBy(trigger)) continue;
      trigger.setAttribute("aria-expanded", open ? "true" : "false");
      if (open) {
        trigger.setAttribute("aria-controls", contentId);
        trigger.setAttribute("data-expanded", "");
        trigger.removeAttribute("data-closed");
      } else {
        trigger.removeAttribute("aria-controls");
        trigger.removeAttribute("data-expanded");
        trigger.setAttribute("data-closed", "");
      }
      const isNativeButton = trigger.tagName === "BUTTON";
      if (disabled) {
        trigger.setAttribute("data-disabled", "");
        if (isNativeButton) trigger.setAttribute("disabled", "");
        else trigger.setAttribute("aria-disabled", "true");
      } else {
        trigger.removeAttribute("data-disabled");
        if (isNativeButton) trigger.removeAttribute("disabled");
        trigger.removeAttribute("aria-disabled");
      }
    }

    for (const content of root.querySelectorAll('[data-slot="collapsible-content"]')) {
      if (!ownedBy(content)) continue;
      if (!content.id) content.id = contentId;
      if (open) {
        content.setAttribute("data-expanded", "");
        content.removeAttribute("data-closed");
      } else {
        content.removeAttribute("data-expanded");
        content.setAttribute("data-closed", "");
      }
      if (disabled) content.setAttribute("data-disabled", "");
      else content.removeAttribute("data-disabled");
      // Presence: hide while closed (unless forceMount), like bs/collapsible.
      if (!open && !local.forceMount) content.setAttribute("hidden", "");
      else content.removeAttribute("hidden");
      const rect = content.getBoundingClientRect?.();
      if (rect && rect.height) content.style.setProperty("--vcc-collapsible-content-height", `${rect.height}px`);
    }
  };

  applyClassProp(root, local);
  if (local.style != null) createRenderEffect(() => applyStyle(root, local.style));
  applyRest(root, others, CONTROL_KEYS);
  if (typeof local.ref === "function") local.ref(root);

  // Click delegation: a trigger may be built before/after this body runs, and
  // nested collapsibles (file tree) must each handle their click exactly once at
  // the innermost root.
  root.addEventListener("click", e => {
    const target = e.target instanceof Element ? e.target : null;
    const trigger = target?.closest('[data-slot="collapsible-trigger"]');
    if (!trigger || !ownedBy(trigger)) return;
    e.stopPropagation();
    trigger.__collapsibleLocalOnClick?.(e);
    if (e.defaultPrevented || local.disabled) return;
    toggle();
  });

  appendChildren(root, local.children);
  // Render effect drives sync on open/disabled/variant changes, after children
  // have been mounted by appendChildren above.
  createRenderEffect(sync);
  return root;
}

function CollapsibleTrigger(props) {
  const [local, others] = splitProps(props, ["as", "class", "className", "classList", "style", "children", "onClick", "ref"]);
  const tag = local.as || "button";
  const el = document.createElement(tag);
  el.setAttribute("data-slot", "collapsible-trigger");
  const isNativeButton = tag === "button";
  const isNativeLink = tag === "a";
  if (isNativeButton) el.setAttribute("type", "button");
  if (!isNativeButton && !isNativeLink) el.setAttribute("role", "button");

  // Local onClick runs first (the root's delegated handler invokes it before
  // toggling), matching Kobalte's composeEventHandlers([local.onClick, toggle]).
  el.__collapsibleLocalOnClick = local.onClick;

  applyClassProp(el, local);
  if (local.style != null) createRenderEffect(() => applyStyle(el, local.style));
  applyRest(el, others, CONTROL_KEYS);
  if (typeof local.ref === "function") local.ref(el);

  appendChildren(el, local.children);
  return el;
}

function CollapsibleContent(props) {
  const [local, others] = splitProps(props, ["class", "className", "classList", "style", "children", "id", "ref"]);
  const el = document.createElement("div");
  el.setAttribute("data-slot", "collapsible-content");
  if (local.id != null) el.id = local.id;

  applyClassProp(el, local);
  if (local.style != null) createRenderEffect(() => applyStyle(el, local.style));
  applyRest(el, others, new Set([...CONTROL_KEYS, "id"]));
  if (typeof local.ref === "function") local.ref(el);

  appendChildren(el, local.children);
  return el;
}

function CollapsibleArrow(props) {
  const el = document.createElement("div");
  el.setAttribute("data-slot", "collapsible-arrow");
  const iconWrap = document.createElement("span");
  iconWrap.setAttribute("data-slot", "collapsible-arrow-icon");
  el.appendChild(iconWrap);
  iconWrap.appendChild(createComponent(Icon, { name: "chevron-down", size: "small" }));

  // Mirror the compiled spread(): listeners and ref attach once, everything else
  // re-applies reactively. `children` is skipped.
  const rest = props || {};
  for (const key in rest) {
    if (/^on[A-Z]/.test(key) && typeof rest[key] === "function") {
      el.addEventListener(key.slice(2).toLowerCase(), rest[key]);
    }
  }
  const applyClasses = makeClassListApplier(el);
  createRenderEffect(() => {
    for (const key in rest) {
      if (key === "children" || key === "ref" || /^on[A-Z]/.test(key)) continue;
      const value = rest[key];
      if (key === "class" || key === "className") el.className = value ?? "";
      else if (key === "classList") applyClasses(value || {});
      else if (key === "style") applyStyle(el, value);
      else if (value == null || value === false) el.removeAttribute(key);
      else el.setAttribute(key, value === true ? "" : String(value));
    }
  });
  if (typeof rest.ref === "function") rest.ref(el);
  return el;
}

export const Collapsible = Object.assign(CollapsibleRoot, {
  Arrow: CollapsibleArrow,
  Trigger: CollapsibleTrigger,
  Content: CollapsibleContent
});
