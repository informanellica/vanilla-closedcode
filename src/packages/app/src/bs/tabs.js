import { createEffect as _solidEffect, createRenderEffect as _solidRenderEffect, createRoot as _solidRoot, getOwner as _solidGetOwner } from "solid-js";
import { insert as _solidInsert } from "solid-js/web";
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
    // Reactive child (Solid's Show/For return a memo accessor): let
    // solid-js/web insert() track it so later updates re-render. Calling it
    // once and appending froze conditional UI (e.g. the provider edit form
    // behind the settings pencil never appeared after setEditor()).
    _solidInsert(parent, children);
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
  let internalValue = props.defaultValue ?? null;

  // Controlled usage (file tabs drive `value` from an external store): read
  // props.value EVERY time so compiled getters stay live — the previous
  // copy-once approach froze the selection and every pane went hidden/blank
  // when tabs were switched externally.
  const readValue = () => {
    const v = props.value;
    return v !== undefined && v !== null ? v : internalValue;
  };
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
    // Track external (controlled) value changes reactively. Prefer the caller's
    // owner so the effect is disposed together with the component that created
    // the Tabs (dialogs that re-open repeatedly must not accumulate effects).
    // Only when there is no owner do we create a standalone root — and then it
    // self-disposes once the tabs root has left the document.
    const watch = () => {
      void props.value;
      sync();
    };
    if (_solidGetOwner()) {
      _solidEffect(watch);
    } else {
      // isConnected is NOT reactive, so an effect alone would only notice the
      // unmount if some signal happened to fire afterwards. Watch the DOM
      // itself: once the tabs root has been in the document and leaves it,
      // dispose the standalone reactive root. (In-app Tabs always have an
      // owner; this path exists for detached/manual usage only.)
      let wasConnected = false;
      _solidRoot(dispose => {
        _solidEffect(watch);
        const observer = new MutationObserver(() => {
          if (!rootEl) return;
          if (rootEl.isConnected) {
            wasConnected = true;
            return;
          }
          if (wasConnected) {
            observer.disconnect();
            dispose();
          }
        });
        observer.observe(document.documentElement, { childList: true, subtree: true });
      });
    }
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
  const previousContext = TabsContext;
  // Pass the ORIGINAL props (not the copied split) so value/onChange getters stay reactive.
  const state = createTabsState(props);
  // Set the context BEFORE touching props: splitProps copies getter props by
  // evaluating them, and the children getter instantiates Tabs.List/Trigger/
  // Content right there — with the context still unset they would build as
  // horizontal (orientation fell back to the default).
  TabsContext = state;

  try {
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

    const rootEl = template(`<div data-component=tabs>`);
    state.registerRoot(rootEl);

    rootEl.setAttribute("data-variant", state.variant());
    rootEl.setAttribute("data-orientation", state.orientation());
    // NOTE: no layout classes here — upstream's Tabs root only carries data
    // attributes; layout belongs to the caller/CSS. Forcing d-flex flex-column
    // broke the file-tab layout (tab bar rendered BELOW the editor).

    if (split.class) {
      rootEl.classList.add(...String(split.class).split(/\s+/).filter(Boolean));
    }
    applyClassList(rootEl, split.classList);
    applyRestProps(rootEl, rest);

    appendChildren(rootEl, split.children);

    state.sync();
    return rootEl;
  } finally {
    TabsContext = previousContext;
  }
}

function TabsList(props) {
  const tabs = useTabs();
  const [split, rest] = splitProps(props, ["class", "classList", "children"]);
  const listEl = template(`<div data-component=tabs-list>`);

  listEl.setAttribute("role", "tablist");
  listEl.setAttribute("data-slot", "tabs-list");
  listEl.classList.add("nav", "nav-pills");
  // Render effect (runs immediately, then re-runs) so the list follows a
  // dynamically changing orientation instead of freezing the initial value.
  _solidRenderEffect(() => {
    listEl.setAttribute("data-orientation", tabs?.orientation() || "horizontal");
    listEl.classList.toggle("flex-column", tabs?.orientation() === "vertical");
  });

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
    // closeButton may be a component/Node (e.g. a TooltipKeybind-wrapped icon)
    // — String() rendered "[object HTMLDivElement]" into the tab label.
    const closeValue = typeof closeButton === "function" ? closeButton() : closeButton;
    if (closeValue instanceof Node) closeEl.appendChild(closeValue);
    else if (closeValue != null) closeEl.textContent = String(closeValue);
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
