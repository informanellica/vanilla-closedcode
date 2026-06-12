import { For, createComponent, createRenderEffect, createSignal, getOwner, mergeProps, onCleanup, splitProps } from "solid-js";
import { createStore, produce } from "solid-js/store";
import { Icon } from "@/bs/icon.js";
import { IconButton } from "@/bs/icon-button.js";

// Local, self-contained replacement for ui/toast.
//
// The original was a thin wrapper over the upstream toast primitive. To avoid pulling in
// any ui (and its third-party UI) dependency, we reimplement a minimal
// toaster store with the same public JS API (showToast/showPromiseToast/toaster
// and the `Toast` component namespace). The visual host uses Bootstrap toast
// markup (.toast-container / .toast). Icons come from @/bs/icon.js.
//
// The region mounts itself under document.body and is removed when the owning
// component is disposed — the same vanilla Portal replacement as
// bs/dropdown-menu.js's DropdownMenuPortal, so nothing is imported from
// solid-js/web here (this file does not even need the insert() exception:
// the local render effects below mirror insert() semantics).

// Build a detached element from compact HTML (no inter-element whitespace,
// matching the compiled Solid templates). Built fresh per call: no cloneNode.
function template(html) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;
  return wrapper.firstElementChild;
}

// Resolve a possibly-reactive value the way solid-js/web's insert() does:
// call accessors until a concrete value remains. Runs inside a render effect,
// so the reads stay tracked (same approach as lib/dialog.js).
function resolveValue(value) {
  while (typeof value === "function") value = value();
  return value;
}

// Render `value` as the sole content of `el`, mirroring insert() semantics for
// the shapes toast content can hold: nothing (null/undefined/boolean), a DOM
// node, a string/number, or an array of those (entries may be accessors, like
// the state-gated description parts of a promise toast). Strings always become
// text nodes, never markup.
function renderInto(el, value) {
  if (value == null || typeof value === "boolean") {
    el.replaceChildren();
    return;
  }
  if (Array.isArray(value)) {
    const nodes = [];
    for (const entry of value) {
      const resolved = resolveValue(entry);
      if (resolved == null || typeof resolved === "boolean") continue;
      nodes.push(resolved instanceof Node ? resolved : String(resolved));
    }
    el.replaceChildren(...nodes);
    return;
  }
  el.replaceChildren(value instanceof Node ? value : String(value));
}

// Keep `el`'s content in sync with a possibly-reactive children accessor,
// mirroring the compiled insert(el, () => value).
function insertChildren(el, read) {
  createRenderEffect(() => renderInto(el, resolveValue(read())));
}

// Append a static child the way the compiled insert() rendered it: skip
// nullish/boolean values, flatten arrays, keep nodes, stringify the rest.
// Toast action labels are plain strings captured from `opts`, so a one-shot
// append matches the compiled insert(button, () => action.label).
function appendValue(parent, value) {
  value = resolveValue(value);
  if (value == null || typeof value === "boolean") return;
  if (Array.isArray(value)) {
    for (const entry of value) appendValue(parent, entry);
    return;
  }
  if (value instanceof Node) {
    parent.appendChild(value);
    return;
  }
  parent.append(String(value));
}

// Sync the region's <ul> with the keyed <li> nodes produced by For: remove,
// append or reorder only what changed so live toasts keep their DOM state
// (focus, hover), matching the compiled insert()'s list diffing.
function reconcileChildren(parent, next) {
  const keep = new Set(next);
  for (const child of Array.from(parent.childNodes)) {
    if (!keep.has(child)) parent.removeChild(child);
  }
  let cursor = parent.firstChild;
  for (const node of next) {
    if (node === cursor) {
      cursor = cursor.nextSibling;
      continue;
    }
    parent.insertBefore(node, cursor);
  }
}

// ---------------------------------------------------------------------------
// Reactive spread helpers (same approach as markdown.js / vendor ui/toast.js):
// mirror the compiled spread(el, props, false, false) — re-run on any prop
// change and diff per key against the previous snapshot. Children are
// forwarded separately through insertChildren(), matching skipChildren = false
// in the compiled output.
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

// --- toaster store -------------------------------------------------------

const [toasts, setToasts] = createStore([]);
let nextId = 0;

function add(render, options = {}) {
  const id = nextId++;
  setToasts(
    produce(list => {
      list.push({ id, render, duration: options.duration, persistent: options.persistent });
    }),
  );
  const persistent = options.persistent;
  const duration = options.duration ?? 5000;
  if (!persistent && duration > 0 && duration !== Infinity) {
    setTimeout(() => dismiss(id), duration);
  }
  return id;
}

function dismiss(id) {
  setToasts(list => list.filter(t => t.id !== id));
  return id;
}

function clear() {
  setToasts([]);
}

function update(id, render) {
  setToasts(t => t.id === id, "render", () => render);
  return id;
}

function show(render, options) {
  return add(render, options);
}

function promise(promiseOrFn, render, options) {
  const id = nextId++;
  const [state, setState] = createSignal("pending");
  const [data, setData] = createSignal(undefined);
  const [error, setError] = createSignal(undefined);
  const renderWrapper = props =>
    render({
      get toastId() {
        return id;
      },
      get state() {
        return state();
      },
      get data() {
        return data();
      },
      get error() {
        return error();
      },
      ...props,
    });
  setToasts(
    produce(list => {
      list.push({ id, render: renderWrapper, persistent: true });
    }),
  );
  const p = typeof promiseOrFn === "function" ? promiseOrFn() : promiseOrFn;
  Promise.resolve(p).then(
    value => {
      setData(() => value);
      setState("fulfilled");
      const d = options?.duration ?? 5000;
      if (d > 0 && d !== Infinity) setTimeout(() => dismiss(id), d);
    },
    err => {
      setError(() => err);
      setState("rejected");
      const d = options?.duration ?? 5000;
      if (d > 0 && d !== Infinity) setTimeout(() => dismiss(id), d);
    },
  );
  return id;
}

export const toaster = {
  show,
  dismiss,
  update,
  clear,
  promise,
};

// --- Toast component namespace ------------------------------------------

function ToastRegion(props) {
  // Vanilla replacement for solid-js/web's Portal (DropdownMenuPortal
  // precedent): build the region, append it to document.body, and remove it
  // with the owning component. The returned comment node keeps the caller's
  // insert() anchor in the layout tree, like Portal's marker.
  const el = template(
    `<div data-component="toast-region" class="toast-container position-fixed bottom-0 end-0 p-3"><ul data-slot="toast-list" class="list-unstyled m-0 d-flex flex-column gap-2"></ul></div>`,
  );
  const list = el.firstChild;
  spreadProps(el, mergeProps({ "data-component": "toast-region" }, props));
  // For keys the <li> nodes by store item identity (push/filter keep the
  // surviving item proxies), so existing toasts are reused untouched —
  // same keyed behavior as the compiled insert(list, For(...)).
  const items = createComponent(For, {
    get each() {
      return toasts;
    },
    children: toast => {
      const item = document.createElement("li");
      // Tracks toast.render, so toaster.update() swaps the content live.
      insertChildren(item, () => toast.render({ toastId: toast.id }));
      return item;
    },
  });
  createRenderEffect(() => {
    const value = resolveValue(items);
    reconcileChildren(list, value == null ? [] : Array.isArray(value) ? value : [value]);
  });
  document.body.appendChild(el);
  // All in-app usage goes through createComponent (pages/layout.js), so an
  // owner is always present; the guard only protects manual DOM callers.
  if (getOwner()) onCleanup(() => el.remove());
  return document.createComment("toast-region");
}

function ToastRoot(props) {
  const el = template(
    `<div data-component="toast" role="alert" aria-live="assertive" aria-atomic="true" class="toast show d-flex align-items-start gap-2 p-3" style="--bs-toast-bg:var(--bs-body-bg)"></div>`,
  );
  // Children first, then the prop spread, then the data-variant default —
  // same effect order as the compiled spread + effect pair.
  insertChildren(el, () => props.children);
  spreadProps(el, props);
  createRenderEffect(() => setAttr(el, "data-variant", props["data-variant"] ?? "default"));
  return el;
}

function ToastIcon(props) {
  const el = template(`<div data-slot="toast-icon" class="flex-shrink-0"></div>`);
  // Icon (@/bs/icon.js) builds a plain element synchronously, so a one-shot
  // append matches the compiled insert() here.
  el.appendChild(
    createComponent(Icon, {
      get name() {
        return props.name;
      },
    }),
  );
  return el;
}

function ToastContent(props) {
  const el = template(`<div data-slot="toast-content" class="flex-grow-1 min-w-0"></div>`);
  insertChildren(el, () => props.children);
  return el;
}

function ToastTitle(props) {
  const el = template(`<div data-slot="toast-title" class="fw-medium"></div>`);
  insertChildren(el, () => props.children);
  return el;
}

function ToastDescription(props) {
  const el = template(`<div data-slot="toast-description" class="text-body-secondary"></div>`);
  insertChildren(el, () => props.children);
  return el;
}

function ToastActions(props) {
  const el = template(`<div data-slot="toast-actions" class="d-flex flex-wrap gap-3 mt-2"></div>`);
  insertChildren(el, () => props.children);
  return el;
}

function ToastCloseButton(props) {
  const [local, others] = splitProps(props, ["onClick"]);
  return createComponent(IconButton, mergeProps({
    "data-slot": "toast-close-button",
    icon: "close",
    variant: "ghost",
    "aria-label": "Dismiss",
    get onClick() {
      return local.onClick;
    },
  }, others));
}

function ToastProgressTrack(props) {
  const el = template(`<div data-slot="toast-progress-track" class="progress"></div>`);
  insertChildren(el, () => props.children);
  spreadProps(el, props);
  return el;
}

function ToastProgressFill(props) {
  const el = template(`<div data-slot="toast-progress-fill" class="progress-bar"></div>`);
  insertChildren(el, () => props.children);
  spreadProps(el, props);
  return el;
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
  ProgressFill: ToastProgressFill,
});

export function showToast(options) {
  const opts = typeof options === "string" ? { description: options } : options;
  return toaster.show(
    props =>
      createComponent(Toast, {
        get toastId() {
          return props.toastId;
        },
        get duration() {
          return opts.duration;
        },
        get persistent() {
          return opts.persistent;
        },
        get ["data-variant"]() {
          return opts.variant ?? "default";
        },
        get children() {
          // opts is a captured plain object, so every compiled Show condition
          // is static for the toast's lifetime; plain conditionals build the
          // same DOM (vendor ui/toast.js precedent).
          const children = [];
          if (opts.icon) {
            children.push(
              createComponent(Toast.Icon, {
                get name() {
                  return opts.icon;
                },
              }),
            );
          }
          const content = [];
          if (opts.title) {
            content.push(
              createComponent(Toast.Title, {
                get children() {
                  return opts.title;
                },
              }),
            );
          }
          if (opts.description) {
            content.push(
              createComponent(Toast.Description, {
                get children() {
                  return opts.description;
                },
              }),
            );
          }
          if (opts.actions?.length) {
            content.push(
              createComponent(Toast.Actions, {
                get children() {
                  return opts.actions.map(action => {
                    const button = document.createElement("button");
                    button.type = "button";
                    button.setAttribute("data-slot", "toast-action");
                    // Bootstrap button styled by the action's variant
                    // (danger / primary / secondary); default = link.
                    button.className = action.variant
                      ? "btn btn-sm btn-" + action.variant
                      : "btn btn-link p-0";
                    // The compiled output used a delegated click; a direct
                    // listener is equivalent for this self-contained handler.
                    button.addEventListener("click", () => {
                      if (typeof action.onClick === "function") {
                        action.onClick();
                      }
                      toaster.dismiss(props.toastId);
                    });
                    appendValue(button, action.label);
                    return button;
                  });
                },
              }),
            );
          }
          children.push(
            createComponent(Toast.Content, {
              get children() {
                return content;
              },
            }),
          );
          children.push(
            createComponent(Toast.CloseButton, {
              onClick: () => toaster.dismiss(props.toastId),
            }),
          );
          return children;
        },
      }),
    { duration: opts.duration, persistent: opts.persistent },
  );
}

export function showPromiseToast(promise, options) {
  return toaster.promise(promise, props =>
    createComponent(Toast, {
      get toastId() {
        return props.toastId;
      },
      get ["data-variant"]() {
        return props.state === "pending" ? "loading" : props.state === "fulfilled" ? "success" : "error";
      },
      get children() {
        return [
          createComponent(Toast.Content, {
            get children() {
              return createComponent(Toast.Description, {
                get children() {
                  // Lazy state-gated entries, resolved live inside the
                  // description's render effect (insert() semantics).
                  return [
                    () => props.state === "pending" && options.loading,
                    () => props.state === "fulfilled" && options.success?.(props.data),
                    () => props.state === "rejected" && options.error?.(props.error),
                  ];
                },
              });
            },
          }),
          createComponent(Toast.CloseButton, {
            onClick: () => toaster.dismiss(props.toastId),
          }),
        ];
      },
    }),
  );
}
