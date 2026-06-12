import { insert as _solidInsert } from "solid-js/web";
import { createComponent, createMemo, createRenderEffect, mergeProps, splitProps } from "solid-js";
import { Tabs as Kobalte } from "@kobalte/core/tabs";

// Build a detached element from compact HTML (no inter-element whitespace,
// matching the compiled Solid templates).
function template(html) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;
  return wrapper.firstElementChild;
}

// Mirror solid-js/web setAttribute semantics: nullish removes the attribute.
function setAttr(el, name, value) {
  if (value == null) el.removeAttribute(name);
  else el.setAttribute(name, value);
}

// Mirror solid-js/web classList(): change-guarded class toggling against the
// previous map; a key may hold several space-separated class names and empty
// keys are skipped.
function toggleClassKey(node, key, value) {
  const names = key.trim().split(/\s+/);
  for (let i = 0; i < names.length; i++) node.classList.toggle(names[i], value);
}
function applyClassList(node, value, prev = {}) {
  const classKeys = Object.keys(value || {});
  const prevKeys = Object.keys(prev);
  for (let i = 0; i < prevKeys.length; i++) {
    const key = prevKeys[i];
    if (!key || key === "undefined" || value[key]) continue;
    toggleClassKey(node, key, false);
    delete prev[key];
  }
  for (let i = 0; i < classKeys.length; i++) {
    const key = classKeys[i];
    const classValue = !!value[key];
    if (!key || key === "undefined" || prev[key] === classValue || !classValue) continue;
    toggleClassKey(node, key, true);
    prev[key] = classValue;
  }
  return prev;
}

function TabsRoot(props) {
  const [split, rest] = splitProps(props, ["class", "classList", "variant", "orientation"]);
  return createComponent(Kobalte, mergeProps(rest, {
    get orientation() {
      return split.orientation;
    },
    "data-component": "tabs",
    get ["data-variant"]() {
      return split.variant || "normal";
    },
    get ["data-orientation"]() {
      return split.orientation || "horizontal";
    },
    get classList() {
      return {
        ...split.classList,
        [split.class ?? ""]: !!split.class
      };
    }
  }));
}
function TabsList(props) {
  const [split, rest] = splitProps(props, ["class", "classList"]);
  return createComponent(Kobalte.List, mergeProps(rest, {
    "data-slot": "tabs-list",
    get classList() {
      return {
        ...split.classList,
        [split.class ?? ""]: !!split.class
      };
    }
  }));
}
function TabsTrigger(props) {
  const [split, rest] = splitProps(props, ["class", "classList", "classes", "children", "closeButton", "hideCloseButton", "onMiddleClick"]);
  const el = template(`<div data-slot="tabs-trigger-wrapper"></div>`);
  el.addEventListener("auxclick", e => {
    if (e.button === 1 && split.onMiddleClick) {
      e.preventDefault();
      split.onMiddleClick();
    }
  });
  // The compiled version registered this through Solid's event delegation; a
  // direct listener is equivalent here (suppress middle-button autoscroll so
  // auxclick can act as "close tab").
  el.addEventListener("mousedown", e => {
    if (e.button === 1 && split.onMiddleClick) {
      e.preventDefault();
    }
  });
  // Kobalte Trigger is polymorphic (its result is a reactive accessor), so it
  // must go through solid's insert() to stay live (established exception).
  _solidInsert(el, createComponent(Kobalte.Trigger, mergeProps(rest, {
    "data-slot": "tabs-trigger",
    get ["data-value"]() {
      return props.value;
    },
    get classList() {
      return {
        [split.classes?.button ?? ""]: split.classes?.button
      };
    },
    get children() {
      return split.children;
    }
  })), null);
  // Show(closeButton), non-keyed: the wrapper is rebuilt only when the
  // condition's truthiness flips; the button content itself stays live
  // through the inner insert.
  const hasCloseButton = createMemo(() => !!split.closeButton);
  _solidInsert(el, createMemo(() => {
    if (!hasCloseButton()) return undefined;
    const closeEl = template(`<div data-slot="tabs-trigger-close-button"></div>`);
    _solidInsert(closeEl, () => split.closeButton);
    createRenderEffect(() => setAttr(closeEl, "data-hidden", split.hideCloseButton));
    return closeEl;
  }), null);
  // Change-guarded data-value + classList on the wrapper, like the compiled
  // effect(): an unchanged value never re-touches the attribute.
  let prevValue;
  let prevClassList = {};
  createRenderEffect(() => {
    const value = props.value;
    const classes = {
      ...split.classList,
      [split.class ?? ""]: !!split.class
    };
    if (value !== prevValue) setAttr(el, "data-value", prevValue = value);
    prevClassList = applyClassList(el, classes, prevClassList);
  });
  return el;
}
function TabsContent(props) {
  const [split, rest] = splitProps(props, ["class", "classList", "children"]);
  return createComponent(Kobalte.Content, mergeProps(rest, {
    "data-slot": "tabs-content",
    get classList() {
      return {
        ...split.classList,
        [split.class ?? ""]: !!split.class
      };
    },
    get children() {
      return split.children;
    }
  }));
}
const TabsSectionTitle = props => {
  const el = template(`<div data-slot="tabs-section-title"></div>`);
  // Children may be reactive (components, accessors), so keep them live.
  _solidInsert(el, () => props.children);
  return el;
};
export const Tabs = Object.assign(TabsRoot, {
  List: TabsList,
  Trigger: TabsTrigger,
  Content: TabsContent,
  SectionTitle: TabsSectionTitle
});
