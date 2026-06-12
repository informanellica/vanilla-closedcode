import { insert as _solidInsert, Portal } from "solid-js/web";
import { createComponent, createMemo, createRenderEffect, mergeProps } from "solid-js";
import { Toast as Kobalte, toaster } from "@kobalte/core/toast";
import { useI18n } from "../context/i18n.js";
import { Icon } from "./icon.js";
import { IconButton } from "./icon-button.js";

// ---------------------------------------------------------------------------
// Reactive spread helpers (same approach as markdown.js): mirror the compiled
// spread(el, props, false, false) — re-run on any prop change and diff per key
// against the previous snapshot. Children are forwarded separately through
// insert(), matching skipChildren = false in the compiled output.
// ---------------------------------------------------------------------------
function applyClassList(el, value, prev) {
  const prevObj = prev || {};
  const nextObj = value || {};
  for (const name of Object.keys(prevObj)) {
    if (!name || name in nextObj || !prevObj[name]) continue;
    for (const cls of name.trim().split(/\s+/)) {
      if (cls) el.classList.remove(cls);
    }
  }
  for (const name of Object.keys(nextObj)) {
    const on = !!nextObj[name];
    if (!name || on === !!prevObj[name]) continue;
    for (const cls of name.trim().split(/\s+/)) {
      if (cls) el.classList.toggle(cls, on);
    }
  }
  return { ...nextObj };
}
function applyStyle(el, value, prev) {
  if (typeof value === "string") {
    if (value !== prev) el.style.cssText = value;
    return value;
  }
  if (typeof prev === "string") {
    el.style.cssText = "";
    prev = undefined;
  }
  const prevObj = prev || {};
  const nextObj = value || {};
  for (const name of Object.keys(prevObj)) {
    if (!(name in nextObj)) el.style.removeProperty(name);
  }
  for (const name of Object.keys(nextObj)) {
    if (nextObj[name] !== prevObj[name]) el.style.setProperty(name, nextObj[name]);
  }
  return { ...nextObj };
}
function setAttr(el, name, value) {
  if (value == null) el.removeAttribute(name);
  else el.setAttribute(name, value);
}
function assignProp(el, key, value, prev, listeners) {
  if (key === "style") return applyStyle(el, value, prev);
  if (key === "classList") return applyClassList(el, value, prev);
  if (value === prev) return prev;
  if (key === "ref") {
    if (typeof value === "function") value(el);
    return value;
  }
  if (key.startsWith("on") && key.length > 2) {
    const name = key.startsWith("on:") ? key.slice(3) : key.slice(2).toLowerCase();
    const existing = listeners.get(key);
    if (existing) el.removeEventListener(name, existing);
    let handler;
    if (typeof value === "function") handler = value;
    else if (Array.isArray(value)) handler = event => value[0](value[1], event);
    if (handler) {
      el.addEventListener(name, handler);
      listeners.set(key, handler);
    } else {
      listeners.delete(key);
    }
    return value;
  }
  if (key === "class" || key === "className") {
    if (value == null) el.removeAttribute("class");
    else el.className = value;
    return value;
  }
  setAttr(el, key, value);
  return value;
}
function spreadProps(el, props) {
  const prev = {};
  const listeners = new Map();
  createRenderEffect(() => {
    for (const key of Object.keys(prev)) {
      if (key === "children" || key in props) continue;
      assignProp(el, key, null, prev[key], listeners);
      delete prev[key];
    }
    for (const key of Object.keys(props)) {
      if (key === "children") continue;
      prev[key] = assignProp(el, key, props[key], prev[key], listeners);
    }
  });
}

// Append a static child the way the compiled insert() rendered it: skip
// nullish/boolean values, flatten arrays, keep nodes, stringify the rest.
// Function children stay live through insert().
function appendChildren(parent, children) {
  if (children == null || typeof children === "boolean") return;
  if (Array.isArray(children)) {
    for (const child of children) appendChildren(parent, child);
    return;
  }
  if (children instanceof Node) {
    parent.appendChild(children);
    return;
  }
  if (typeof children === "function") {
    _solidInsert(parent, children);
    return;
  }
  parent.append(String(children));
}

function ToastRegion(props) {
  // Solid's Portal is kept on purpose (established convention, see
  // file-search.js): it owns the document.body mount and disposal wiring.
  return createComponent(Portal, {
    get children() {
      return createComponent(Kobalte.Region, mergeProps({
        "data-component": "toast-region"
      }, props, {
        get children() {
          return createComponent(Kobalte.List, {
            "data-slot": "toast-list"
          });
        }
      }));
    }
  });
}
function ToastRoot(props) {
  return createComponent(Kobalte, mergeProps({
    "data-component": "toast",
    get classList() {
      return {
        ...props.classList,
        [props.class ?? ""]: !!props.class
      };
    }
  }, props));
}
function ToastIcon(props) {
  const el = document.createElement("div");
  el.setAttribute("data-slot", "toast-icon");
  // Icon (bs/icon.js via ./icon.js) builds a plain element synchronously, so
  // a one-shot append matches the compiled insert() here.
  el.appendChild(createComponent(Icon, {
    get name() {
      return props.name;
    }
  }));
  return el;
}
function ToastContent(props) {
  const el = document.createElement("div");
  el.setAttribute("data-slot", "toast-content");
  // Children may include Kobalte component results (lazy accessors inside the
  // presence-gated toast), so they must go through solid's insert() to stay
  // live — same effect order as the compiled spread (children first).
  _solidInsert(el, () => props.children);
  spreadProps(el, props);
  return el;
}
function ToastTitle(props) {
  return createComponent(Kobalte.Title, mergeProps({
    "data-slot": "toast-title"
  }, props));
}
function ToastDescription(props) {
  return createComponent(Kobalte.Description, mergeProps({
    "data-slot": "toast-description"
  }, props));
}
function ToastActions(props) {
  const el = document.createElement("div");
  el.setAttribute("data-slot", "toast-actions");
  _solidInsert(el, () => props.children);
  spreadProps(el, props);
  return el;
}
function ToastCloseButton(props) {
  const i18n = useI18n();
  return createComponent(Kobalte.CloseButton, mergeProps({
    "data-slot": "toast-close-button",
    as: IconButton,
    icon: "close",
    variant: "ghost",
    get ["aria-label"]() {
      return i18n.t("ui.common.dismiss");
    }
  }, props));
}
function ToastProgressTrack(props) {
  return createComponent(Kobalte.ProgressTrack, mergeProps({
    "data-slot": "toast-progress-track"
  }, props));
}
function ToastProgressFill(props) {
  return createComponent(Kobalte.ProgressFill, mergeProps({
    "data-slot": "toast-progress-fill"
  }, props));
}
export const Toast = Object.assign(ToastRoot, {
  Region: ToastRegion,
  Icon: ToastIcon,
  Content: ToastContent,
  Title: ToastTitle,
  Description: ToastDescription,
  Actions: ToastActions,
  CloseButton: ToastCloseButton,
  ProgressTrack: ToastProgressTrack,
  ProgressFill: ToastProgressFill
});
export { toaster };
export function showToast(options) {
  const opts = typeof options === "string" ? {
    description: options
  } : options;
  return toaster.show(props => createComponent(Toast, {
    get toastId() {
      return props.toastId;
    },
    duration: opts.duration,
    persistent: opts.persistent,
    "data-variant": opts.variant ?? "default",
    get children() {
      // opts is a captured plain object, so every compiled Show condition is
      // static for the toast's lifetime; plain conditionals build the same DOM.
      const children = [];
      if (opts.icon) {
        children.push(createComponent(Toast.Icon, {
          name: opts.icon
        }));
      }
      const content = [];
      if (opts.title) {
        content.push(createComponent(Toast.Title, {
          children: opts.title
        }));
      }
      if (opts.description) {
        content.push(createComponent(Toast.Description, {
          children: opts.description
        }));
      }
      if (opts.actions?.length) {
        content.push(createComponent(Toast.Actions, {
          children: opts.actions.map(action => {
            const button = document.createElement("button");
            button.setAttribute("data-slot", "toast-action");
            // The compiled output used a delegated $$click; a direct listener
            // is equivalent for this self-contained dismiss handler.
            button.addEventListener("click", () => {
              if (typeof action.onClick === "function") {
                action.onClick();
              }
              toaster.dismiss(props.toastId);
            });
            appendChildren(button, action.label);
            return button;
          })
        }));
      }
      children.push(createComponent(Toast.Content, {
        children: content
      }));
      children.push(createComponent(Toast.CloseButton, {}));
      return children;
    }
  }));
}
export function showPromiseToast(promise, options) {
  return toaster.promise(promise, props => createComponent(Toast, {
    get toastId() {
      return props.toastId;
    },
    get ["data-variant"]() {
      return props.state === "pending" ? "loading" : props.state === "fulfilled" ? "success" : "error";
    },
    get children() {
      return [createComponent(Toast.Content, {
        get children() {
          return createComponent(Toast.Description, {
            get children() {
              // Mirror the compiled memo pairs: the inner memo flips only when
              // the state flag changes, so the success/error callbacks are not
              // re-invoked by unrelated updates while their branch is active.
              const pending = createMemo(() => props.state === "pending");
              const fulfilled = createMemo(() => props.state === "fulfilled");
              const rejected = createMemo(() => props.state === "rejected");
              return [createMemo(() => pending() && options.loading), createMemo(() => fulfilled() && options.success?.(props.data)), createMemo(() => rejected() && options.error?.(props.error))];
            }
          });
        }
      }), createComponent(Toast.CloseButton, {})];
    }
  }));
}
