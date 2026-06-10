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

let TabsContext = null;

function useTabs() {
  return TabsContext;
}

function createTabsState(props) {
  // NOTE: not "controlled vs uncontrolled" — children (Trigger/Content) are
  // often built BEFORE this root runs (argument evaluation order), so they
  // can't reach the context to register, and a copied props.value can never
  // change on click. Instead: seed from props.value/defaultValue, track the
  // selection internally, and sync by walking the DOM under the root.
  let internalValue = props.value ?? props.defaultValue ?? null;

  const readValue = () => internalValue;
  const readOrientation = () => props.orientation || "horizontal";
  const readVariant = () => props.variant || "normal";

  // An element belongs to THIS tabs instance if its nearest tabs root is ours
  // (nested Tabs must not steal each other's panes).
  const ownedBy = el => el.closest('[data-component="tabs"]') === rootEl;

  const sync = () => {
    if (!rootEl) return;
    const currentValue = readValue();
    const orientation = readOrientation();
    const variant = readVariant();

    for (const el of rootEl.querySelectorAll('[data-slot="tabs-trigger"]')) {
      if (!ownedBy(el)) continue;
      const isActive = el.dataset.value === currentValue;
      el.setAttribute("aria-selected", isActive ? "true" : "false");
      el.classList.toggle("active", isActive);
      const buttonClass = el.dataset.activeClass;
      if (buttonClass) el.classList.toggle(buttonClass, isActive);
    }

    for (const el of rootEl.querySelectorAll('[data-slot="tabs-content"]')) {
      if (!ownedBy(el)) continue;
      const isActive = el.dataset.value === currentValue;
      el.classList.toggle("active", isActive);
      el.classList.toggle("d-none", !isActive);
      el.toggleAttribute("hidden", !isActive);
      el.setAttribute("aria-hidden", isActive ? "false" : "true");
    }

    rootEl.setAttribute("data-orientation", orientation);
    rootEl.setAttribute("data-variant", variant);
    rootEl.classList.toggle("flex-row", orientation === "vertical");
    rootEl.classList.toggle("flex-column", orientation !== "vertical");
  };

  const api = {
    value: readValue,
    select(next) {
      internalValue = next;
      sync();
      props.onChange?.(next);
    },
    orientation: readOrientation,
    variant: readVariant,
    // register* kept as no-op-compatible API: sync() walks the DOM, so entries
    // created outside the context window still work.
    registerTrigger() {
      sync();
    },
    registerContent() {
      sync();
    },
    unregisterTrigger() {},
    unregisterContent() {},
    sync
  };

  let rootEl = null;
  api.registerRoot = el => {
    rootEl = el;
    // Click delegation on the root: trigger elements may have been created
    // before this state existed (so their own listeners hold tabs=null) —
    // the root handles selection for every descendant trigger it owns.
    el.addEventListener("click", e => {
      let target = e.target instanceof Element ? e.target : null;
      const trigger = target?.closest('[data-slot="tabs-trigger"]');
      if (!trigger || !ownedBy(trigger)) return;
      if (target?.closest('[data-slot="tabs-trigger-close-button"]')) return;
      api.select(trigger.dataset.value);
    });
    sync();
  };

  return api;
}

function TabsRoot(props) {
  const [split, rest] = splitProps(props, [
    "class",
    "classList",
    "variant",
    "orientation",
    "value",
    "defaultValue",
    "onChange",
    "children"
  ]);

  const previousContext = TabsContext;
  const state = createTabsState(split);
  TabsContext = state;

  const rootEl = template(`<div data-component=tabs>`);
  state.registerRoot(rootEl);

  rootEl.setAttribute("data-variant", state.variant());
  rootEl.setAttribute("data-orientation", state.orientation());
  rootEl.classList.add("d-flex");
  rootEl.classList.toggle("flex-row", state.orientation() === "vertical");
  rootEl.classList.toggle("flex-column", state.orientation() !== "vertical");

  if (split.class) {
    rootEl.classList.add(...String(split.class).split(/\s+/).filter(Boolean));
  }
  applyClassList(rootEl, split.classList);
  applyRestProps(rootEl, rest);

  try {
    appendChildren(rootEl, split.children);
  } finally {
    TabsContext = previousContext;
  }

  state.sync();
  return rootEl;
}

function TabsList(props) {
  const tabs = useTabs();
  const [split, rest] = splitProps(props, ["class", "classList", "children"]);
  const listEl = template(`<div data-component=tabs-list>`);

  listEl.setAttribute("role", "tablist");
  listEl.setAttribute("data-slot", "tabs-list");
  listEl.setAttribute("data-orientation", tabs?.orientation() || "horizontal");
  listEl.classList.add("nav", "nav-pills");
  listEl.classList.toggle("flex-column", tabs?.orientation() === "vertical");

  if (split.class) {
    listEl.classList.add(...String(split.class).split(/\s+/).filter(Boolean));
  }
  applyClassList(listEl, split.classList);
  applyRestProps(listEl, rest);
  appendChildren(listEl, split.children);
  return listEl;
}

function TabsTrigger(props) {
  const tabs = useTabs();
  const [split, rest] = splitProps(props, [
    "class",
    "classList",
    "classes",
    "children",
    "value",
    "closeButton",
    "hideCloseButton",
    "onMiddleClick",
    "onClick"
  ]);
  const triggerEl = template(`<button type=button data-slot=tabs-trigger>`);
  const value = split.value;
  const closeButton = split.closeButton;

  triggerEl.setAttribute("role", "tab");
  triggerEl.setAttribute("data-value", value ?? "");
  triggerEl.setAttribute("aria-selected", tabs?.value() === value ? "true" : "false");
  triggerEl.classList.add("nav-link", "d-inline-flex", "align-items-center", "gap-1");

  if (split.class) {
    triggerEl.classList.add(...String(split.class).split(/\s+/).filter(Boolean));
  }
  applyClassList(triggerEl, split.classList);
  if (split.classes?.button) {
    triggerEl.classList.add(split.classes.button);
    triggerEl.dataset.activeClass = split.classes.button;
  }
  applyRestProps(triggerEl, rest);

  const syncEntry = {
    el: triggerEl,
    value,
    buttonClass: split.classes?.button || "",
    hideCloseButton: !!split.hideCloseButton,
    closeEl: null
  };

  triggerEl.addEventListener("auxclick", event => {
    if (event.button === 1 && typeof split.onMiddleClick === "function") {
      event.preventDefault();
      split.onMiddleClick(event);
    }
  });
  triggerEl.addEventListener("mousedown", event => {
    if (event.button === 1 && typeof split.onMiddleClick === "function") {
      event.preventDefault();
    }
  });
  triggerEl.addEventListener("click", event => {
    // Selection is handled by the root's delegated listener (works even when
    // this trigger was created before the root state existed).
    split.onClick?.(event);
  });

  appendChildren(triggerEl, split.children);

  if (closeButton) {
    const closeEl = template(`<span class="d-inline-flex align-items-center" data-slot=tabs-trigger-close-button>`);
    closeEl.textContent = typeof closeButton === "function" ? String(closeButton()) : String(closeButton);
    if (split.hideCloseButton) {
      closeEl.setAttribute("data-hidden", "true");
    }
    syncEntry.closeEl = closeEl;
    triggerEl.appendChild(closeEl);
  }

  tabs?.registerTrigger?.(syncEntry);
  return triggerEl;
}

function TabsContent(props) {
  const tabs = useTabs();
  const [split, rest] = splitProps(props, ["class", "classList", "children", "value"]);
  const contentEl = template(`<div data-slot=tabs-content>`);
  const value = split.value;

  contentEl.setAttribute("role", "tabpanel");
  contentEl.setAttribute("data-value", value ?? "");
  contentEl.classList.add("tab-pane");
  contentEl.classList.toggle("active", tabs?.value() === value);
  contentEl.classList.toggle("d-none", tabs?.value() !== value);
  contentEl.toggleAttribute("hidden", tabs?.value() !== value);
  contentEl.setAttribute("aria-hidden", tabs?.value() === value ? "false" : "true");

  if (split.class) {
    contentEl.classList.add(...String(split.class).split(/\s+/).filter(Boolean));
  }
  applyClassList(contentEl, split.classList);
  applyRestProps(contentEl, rest);

  appendChildren(contentEl, split.children);

  tabs?.registerContent?.({ el: contentEl, value });
  return contentEl;
}

function TabsSectionTitle(props) {
  const titleEl = template(`<div class="text-uppercase text-secondary small fw-semibold px-2 pt-2 pb-1" data-slot=tabs-section-title>`);
  appendChildren(titleEl, props.children);
  return titleEl;
}

export const Tabs = Object.assign(TabsRoot, {
  List: TabsList,
  Trigger: TabsTrigger,
  Content: TabsContent,
  SectionTitle: TabsSectionTitle
});
