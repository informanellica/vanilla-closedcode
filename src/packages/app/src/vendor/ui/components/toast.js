import { insert as _solidInsert, Portal } from "solid-js/web";
import {
  createComponent,
  createContext,
  createEffect,
  createMemo,
  createRenderEffect,
  createSignal,
  createUniqueId,
  For,
  mergeProps,
  on,
  onCleanup,
  onMount,
  splitProps,
  untrack,
  useContext,
} from "solid-js";
import { useI18n } from "../context/i18n.js";
import { Icon } from "./icon.js";
import { IconButton } from "./icon-button.js";

// ---------------------------------------------------------------------------
// Vanilla reimplementation of the Kobalte toast component (no external UI dep).
//
// The exported surface is preserved exactly: the `toaster` singleton
// (`show`/`update`/`promise`/`dismiss`/`clear`), the `Toast` component
// namespace (`Toast` as root plus `Region`/`Icon`/`Content`/`Title`/
// `Description`/`Actions`/`CloseButton`/`ProgressTrack`/`ProgressFill`), and the
// `showToast`/`showPromiseToast` helpers — so existing consumers and the story
// keep working unchanged. The DOM mirrors what toast.css targets
// (`data-component`, `data-slot`, `data-opened`/`data-closed`/`data-swipe`
// attributes and the `--kb-toast-*` custom properties).
//
// Reactivity stays inside the flip-safe primitive set: the toaster store is a
// plain `createSignal` holding an immutable array (Kobalte uses a solid-js
// store, which is intentionally avoided here), region/toast state flows through
// `createContext`, and DOM is built natively with reactive `createRenderEffect`
// updates plus native `addEventListener`.
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Toaster store.
//
// Faithful port of the Kobalte toast-store.ts + toaster.ts, but the
// backing state is a plain signal holding an immutable `toasts` array instead
// of a solid-js store. Every mutation produces a new array so the signal change
// propagates to the region's filtered memo and the `For` list. `dismiss` flips
// a toast's `dismiss` flag (the root watches it to start its exit), while
// `remove` drops it entirely once the exit completes.
// ---------------------------------------------------------------------------
const [toastsState, setToastsState] = createSignal([]);

const toastStore = {
  toasts: () => toastsState(),
  add(toast) {
    setToastsState(prev => [...prev, toast]);
  },
  get(id) {
    return toastsState().find(toast => toast.id === id);
  },
  update(id, toast) {
    setToastsState(prev => {
      const index = prev.findIndex(t => t.id === id);
      if (index === -1) return prev;
      return [...prev.slice(0, index), toast, ...prev.slice(index + 1)];
    });
  },
  dismiss(id) {
    setToastsState(prev =>
      prev.map(toast => (toast.id === id ? { ...toast, dismiss: true } : toast)),
    );
  },
  remove(id) {
    setToastsState(prev => prev.filter(toast => toast.id !== id));
  },
  clear() {
    setToastsState([]);
  },
};

let toastsCounter = 0;

/** Adds a new toast and returns its id. */
function show(toastComponent, options) {
  const id = toastsCounter++;
  toastStore.add({
    id,
    toastComponent,
    dismiss: false,
    update: false,
    region: options?.region,
  });
  return id;
}

/** Update the toast of the given id with a new rendered component. */
function update(id, toastComponent) {
  toastStore.update(id, { id, toastComponent, dismiss: false, update: true });
}

/** Adds a new promise-based toast and returns its id. */
function promise(promiseValue, toastComponent, options) {
  const id = show(props => {
    return toastComponent({
      get toastId() {
        return props.toastId;
      },
      state: "pending",
    });
  }, options);

  (typeof promiseValue === "function" ? promiseValue() : promiseValue)
    .then(data =>
      update(id, props => {
        return toastComponent({
          get toastId() {
            return props.toastId;
          },
          state: "fulfilled",
          data,
        });
      }),
    )
    .catch(error =>
      update(id, props => {
        return toastComponent({
          get toastId() {
            return props.toastId;
          },
          state: "rejected",
          error,
        });
      }),
    );

  return id;
}

/** Marks the toast with given id for dismiss. */
function dismiss(id) {
  toastStore.dismiss(id);
  return id;
}

/** Removes all toasts. */
function clear() {
  toastStore.clear();
}

// User facing API (same shape as the Kobalte `toaster`).
const toaster = {
  show,
  update,
  promise,
  dismiss,
  clear,
};

// ---------------------------------------------------------------------------
// Region + toast contexts (replace Kobalte's toast-region-context /
// toast-context). Carry the same accessors so the sub-parts behave the same.
// ---------------------------------------------------------------------------
const ToastRegionContext = createContext();
function useToastRegionContext() {
  const context = useContext(ToastRegionContext);
  if (context === undefined) {
    throw new Error("`useToastRegionContext` must be used within a `Toast.Region` component");
  }
  return context;
}

const ToastContext = createContext();
function useToastContext() {
  const context = useContext(ToastContext);
  if (context === undefined) {
    throw new Error("`useToastContext` must be used within a `Toast.Root` component");
  }
  return context;
}

function createGenerateId(baseId) {
  return part => `${baseId()}-${part}`;
}

const TOAST_HOTKEY_PLACEHOLDER = "{hotkey}";

// ---------------------------------------------------------------------------
// Region: the fixed area where toasts appear. Portals to <body>, hosts the
// list, and owns the pause/resume coordination (focus, hover, window blur,
// hotkey focus) that Kobalte's ToastRegion + ToastList split across two files.
// ---------------------------------------------------------------------------
function ToastRegion(props) {
  // Solid's Portal is kept on purpose (established convention, see
  // file-search.js): it owns the document.body mount and disposal wiring.
  return createComponent(Portal, {
    get children() {
      return ToastRegionImpl(mergeProps({ "data-component": "toast-region" }, props));
    },
  });
}

function ToastRegionImpl(props) {
  const merged = mergeProps(
    {
      id: `toast-region-${createUniqueId()}`,
      hotkey: ["altKey", "KeyT"],
      duration: 5000,
      limit: 3,
      swipeDirection: "right",
      swipeThreshold: 50,
      pauseOnInteraction: true,
      pauseOnPageIdle: true,
    },
    props,
  );
  const [local, others] = splitProps(merged, [
    "hotkey",
    "duration",
    "limit",
    "swipeDirection",
    "swipeThreshold",
    "pauseOnInteraction",
    "pauseOnPageIdle",
    "regionId",
    "aria-label",
  ]);

  const toasts = createMemo(() =>
    toastStore
      .toasts()
      .filter(toast => toast.region === local.regionId && toast.dismiss === false)
      .slice(0, local.limit),
  );

  const [isPaused, setIsPaused] = createSignal(false);

  const hotkeyLabel = () =>
    local.hotkey.join("+").replace(/Key/g, "").replace(/Digit/g, "");

  const ariaLabel = () => {
    const label = local["aria-label"] || `Notifications (${TOAST_HOTKEY_PLACEHOLDER})`;
    return label.replace(TOAST_HOTKEY_PLACEHOLDER, hotkeyLabel());
  };

  const context = {
    isPaused,
    toasts,
    hotkey: () => local.hotkey,
    duration: () => local.duration,
    swipeDirection: () => local.swipeDirection,
    swipeThreshold: () => local.swipeThreshold,
    pauseOnInteraction: () => local.pauseOnInteraction,
    pauseOnPageIdle: () => local.pauseOnPageIdle,
    pauseAllTimer: () => setIsPaused(true),
    resumeAllTimer: () => setIsPaused(false),
    generateId: createGenerateId(() => others.id),
  };

  const region = document.createElement("div");
  region.setAttribute("role", "region");
  region.tabIndex = -1;

  // In case the region has size when empty (e.g. padding), drop pointer events
  // so it doesn't block the page beneath it; restore them when toasts exist.
  createRenderEffect(() => {
    region.style.setProperty("pointer-events", toasts().length > 0 ? "auto" : "none");
  });
  createRenderEffect(() => setAttr(region, "aria-label", ariaLabel()));

  const list = document.createElement("ol");
  list.setAttribute("data-slot", "toast-list");
  list.tabIndex = -1;

  // List-level pause/resume: hover and focus pause the close timers; leaving or
  // blurring resumes them (ToastList in Kobalte).
  const pauseFromInteraction = () => {
    if (context.pauseOnInteraction() && !untrack(isPaused)) context.pauseAllTimer();
  };
  list.addEventListener("focusin", pauseFromInteraction);
  list.addEventListener("focusout", e => {
    if (!list.contains(e.relatedTarget)) context.resumeAllTimer();
  });
  list.addEventListener("pointermove", pauseFromInteraction);
  list.addEventListener("pointerleave", () => {
    if (!list.contains(document.activeElement)) context.resumeAllTimer();
  });

  // Hotkey: pressing the configured chord moves focus to the list.
  createEffect(
    on(
      () => context.hotkey(),
      hotkey => {
        const onKeyDown = event => {
          const isHotkeyPressed = hotkey.every(key => event[key] || event.code === key);
          if (isHotkeyPressed) {
            try {
              list.focus({ preventScroll: true });
            } catch {
              list.focus();
            }
          }
        };
        document.addEventListener("keydown", onKeyDown);
        onCleanup(() => document.removeEventListener("keydown", onKeyDown));
      },
    ),
  );

  // Pause on page idle: window blur pauses every timer, focus resumes them.
  createEffect(() => {
    if (!context.pauseOnPageIdle()) return;
    const pause = context.pauseAllTimer;
    const resume = context.resumeAllTimer;
    window.addEventListener("blur", pause);
    window.addEventListener("focus", resume);
    onCleanup(() => {
      window.removeEventListener("blur", pause);
      window.removeEventListener("focus", resume);
    });
  });

  // Keyed list of toast roots. For keys by toast identity, so existing toasts
  // keep their live DOM (focus, hover, swipe state) across store updates —
  // matching the compiled insert(list, For(...)).
  _solidInsert(
    list,
    createComponent(ToastRegionContext.Provider, {
      value: context,
      get children() {
        return createComponent(For, {
          get each() {
            return toasts();
          },
          children: toast =>
            toast.toastComponent({
              get toastId() {
                return toast.id;
              },
            }),
        });
      },
    }),
  );

  region.appendChild(list);
  // The provider must also wrap attribute application so descendants resolve
  // the same context, but attributes are static here; spread the rest.
  spreadProps(region, others);
  return region;
}

// ---------------------------------------------------------------------------
// Root: a single toast <li>. Owns the close timer (with pause/resume and
// persistent handling), swipe-to-dismiss gesture, escape-to-close, the
// open/closed presence with exit animation, and the aria wiring.
// ---------------------------------------------------------------------------
function ToastRootImpl(props) {
  const rootContext = useToastRegionContext();

  const merged = mergeProps(
    { id: `toast-${createUniqueId()}`, priority: "high" },
    props,
  );
  const [local, others] = splitProps(merged, [
    "toastId",
    "priority",
    "duration",
    "persistent",
    "onPause",
    "onResume",
    "onEscapeKeyDown",
    "classList",
    "class",
  ]);

  const [isOpen, setIsOpen] = createSignal(true);
  const [titleId, setTitleId] = createSignal();
  const [descriptionId, setDescriptionId] = createSignal();
  const [isAnimationEnabled, setIsAnimationEnabled] = createSignal(true);

  const duration = createMemo(() => local.duration || rootContext.duration());

  let closeTimerId;
  let closeTimerStartTime = 0;
  let closeTimerRemainingTime = duration();

  let pointerStart = null;
  let swipeDelta = null;

  const el = document.createElement("li");

  const deleteToast = () => toastStore.remove(local.toastId);

  // Drive the exit: flip to closed (which triggers the data-closed pop-out
  // animation) then remove from the store once it finishes. A fallback timeout
  // covers the no-animation / reduced-motion case so the toast is never stuck.
  let removed = false;
  const finishClose = () => {
    if (removed) return;
    removed = true;
    deleteToast();
  };
  const close = () => {
    if (!isOpen()) return;
    setIsOpen(false);
    // Restore animation for the exit phase (disabled when it was a toast update).
    setIsAnimationEnabled(true);
  };

  const startTimer = ms => {
    if (!ms || local.persistent) return;
    window.clearTimeout(closeTimerId);
    closeTimerStartTime = new Date().getTime();
    closeTimerId = window.setTimeout(close, ms);
  };
  const resumeTimer = () => {
    startTimer(closeTimerRemainingTime);
    local.onResume?.();
  };
  const pauseTimer = () => {
    const elapsedTime = new Date().getTime() - closeTimerStartTime;
    closeTimerRemainingTime = closeTimerRemainingTime - elapsedTime;
    window.clearTimeout(closeTimerId);
    local.onPause?.();
  };

  // --- attributes / aria ---------------------------------------------------
  el.setAttribute("role", "status");
  el.tabIndex = 0;
  el.setAttribute("aria-atomic", "true");
  el.style.setProperty("user-select", "none");
  el.style.setProperty("touch-action", "none");
  createRenderEffect(() => {
    el.setAttribute("aria-live", local.priority === "high" ? "assertive" : "polite");
  });
  createRenderEffect(() => setAttr(el, "aria-labelledby", titleId()));
  createRenderEffect(() => setAttr(el, "aria-describedby", descriptionId()));
  createRenderEffect(() => {
    setAttr(el, "data-opened", isOpen() ? "" : null);
    setAttr(el, "data-closed", !isOpen() ? "" : null);
  });
  createRenderEffect(() =>
    setAttr(el, "data-swipe-direction", rootContext.swipeDirection()),
  );
  createRenderEffect(() => {
    if (isAnimationEnabled()) el.style.removeProperty("animation");
    else el.style.setProperty("animation", "none");
  });

  // --- swipe-to-dismiss ----------------------------------------------------
  const onKeyDown = e => {
    if (e.key !== "Escape") return;
    local.onEscapeKeyDown?.(e);
    if (!e.defaultPrevented) close();
  };
  const onPointerDown = e => {
    if (e.button !== 0) return;
    pointerStart = { x: e.clientX, y: e.clientY };
  };
  const onPointerMove = e => {
    if (!pointerStart) return;
    const x = e.clientX - pointerStart.x;
    const y = e.clientY - pointerStart.y;
    const direction = rootContext.swipeDirection();
    const hasSwipeMoveStarted = Boolean(swipeDelta);
    const isHorizontalSwipe = direction === "left" || direction === "right";
    const clamp = direction === "left" || direction === "up" ? Math.min : Math.max;
    const clampedX = isHorizontalSwipe ? clamp(0, x) : 0;
    const clampedY = !isHorizontalSwipe ? clamp(0, y) : 0;
    const moveStartBuffer = e.pointerType === "touch" ? 10 : 2;
    const delta = { x: clampedX, y: clampedY };

    if (hasSwipeMoveStarted) {
      swipeDelta = delta;
      el.setAttribute("data-swipe", "move");
      el.style.setProperty("--kb-toast-swipe-move-x", `${delta.x}px`);
      el.style.setProperty("--kb-toast-swipe-move-y", `${delta.y}px`);
    } else if (isDeltaInDirection(delta, direction, moveStartBuffer)) {
      swipeDelta = delta;
      el.setAttribute("data-swipe", "start");
      e.target.setPointerCapture?.(e.pointerId);
    } else if (Math.abs(x) > moveStartBuffer || Math.abs(y) > moveStartBuffer) {
      // Swiping the wrong way disables the gesture for this pointer interaction.
      pointerStart = null;
    }
  };
  const onPointerUp = e => {
    const delta = swipeDelta;
    const target = e.target;
    if (target.hasPointerCapture?.(e.pointerId)) {
      target.releasePointerCapture(e.pointerId);
    }
    swipeDelta = null;
    pointerStart = null;
    if (!delta) return;

    if (isDeltaInDirection(delta, rootContext.swipeDirection(), rootContext.swipeThreshold())) {
      el.setAttribute("data-swipe", "end");
      el.style.removeProperty("--kb-toast-swipe-move-x");
      el.style.removeProperty("--kb-toast-swipe-move-y");
      el.style.setProperty("--kb-toast-swipe-end-x", `${delta.x}px`);
      el.style.setProperty("--kb-toast-swipe-end-y", `${delta.y}px`);
      close();
    } else {
      el.setAttribute("data-swipe", "cancel");
      el.style.removeProperty("--kb-toast-swipe-move-x");
      el.style.removeProperty("--kb-toast-swipe-move-y");
      el.style.removeProperty("--kb-toast-swipe-end-x");
      el.style.removeProperty("--kb-toast-swipe-end-y");
    }
    // Prevent a click from firing on items within the toast when the pointer up
    // is part of a swipe gesture.
    el.addEventListener("click", event => event.preventDefault(), { once: true });
  };
  el.addEventListener("keydown", onKeyDown);
  el.addEventListener("pointerdown", onPointerDown);
  el.addEventListener("pointermove", onPointerMove);
  el.addEventListener("pointerup", onPointerUp);

  // When the exit animation ends (data-closed pop-out), drop the toast. A
  // fallback timeout removes it even if no animation runs.
  el.addEventListener("animationend", () => {
    if (!isOpen()) finishClose();
  });

  onMount(() => {
    // Disable the entrance animation for an updated toast.
    if (rootContext.toasts().find(toast => toast.id === local.toastId && toast.update)) {
      setIsAnimationEnabled(false);
    }
  });

  // Pause/resume the close timer with the region.
  createEffect(
    on(
      () => rootContext.isPaused(),
      isPaused => {
        if (isPaused) pauseTimer();
        else resumeTimer();
      },
      { defer: true },
    ),
  );

  // (Re)start the timer when the toast opens or the duration changes.
  createEffect(
    on([isOpen, duration], ([open, ms]) => {
      if (open && !rootContext.isPaused()) startTimer(ms);
    }),
  );

  // Begin the exit once the toaster marks this toast for dismiss.
  createEffect(
    on(
      () => toastStore.get(local.toastId)?.dismiss,
      shouldDismiss => shouldDismiss && close(),
    ),
  );

  // Schedule removal as a fallback after the toast is closed (covers the case
  // where no exit animation fires, e.g. reduced motion).
  createEffect(
    on(
      isOpen,
      open => {
        if (open) return;
        window.clearTimeout(closeTimerId);
        const fallback = window.setTimeout(finishClose, 250);
        onCleanup(() => window.clearTimeout(fallback));
      },
      { defer: true },
    ),
  );

  onCleanup(() => window.clearTimeout(closeTimerId));

  const context = {
    translations: () => ({ close: "Dismiss" }),
    close,
    duration,
    isPersistent: () => local.persistent ?? false,
    closeTimerStartTime: () => closeTimerStartTime,
    generateId: createGenerateId(() => others.id),
    registerTitleId: id => {
      setTitleId(id);
      return () => setTitleId(prev => (prev === id ? undefined : prev));
    },
    registerDescriptionId: id => {
      setDescriptionId(id);
      return () => setDescriptionId(prev => (prev === id ? undefined : prev));
    },
  };

  // class / classList from the merged props (Root forwards class via classList).
  let classListPrev;
  createRenderEffect(() => {
    classListPrev = applyClassList(el, local.classList, classListPrev);
  });

  // Children first, then the remaining prop spread — same effect order as the
  // compiled spread + insert pair.
  _solidInsert(
    el,
    createComponent(ToastContext.Provider, {
      value: context,
      get children() {
        return others.children;
      },
    }),
  );
  spreadProps(el, others);
  return el;
}

function ToastRoot(props) {
  return createComponent(
    ToastRootImpl,
    mergeProps(
      {
        "data-component": "toast",
        get classList() {
          return {
            ...props.classList,
            [props.class ?? ""]: !!props.class,
          };
        },
      },
      props,
    ),
  );
}

function ToastIcon(props) {
  const el = document.createElement("div");
  el.setAttribute("data-slot", "toast-icon");
  // Icon (bs/icon.js via ./icon.js) builds a plain element synchronously, so
  // a one-shot append matches the compiled insert() here.
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
  const el = document.createElement("div");
  el.setAttribute("data-slot", "toast-content");
  // Children may include reactive accessors (lazy state-gated promise parts),
  // so they go through solid's insert() to stay live — same effect order as the
  // compiled spread (children first).
  _solidInsert(el, () => props.children);
  spreadProps(el, props);
  return el;
}
function ToastTitle(props) {
  const context = useToastContext();
  const merged = mergeProps(
    { "data-slot": "toast-title", id: context.generateId("title") },
    props,
  );
  const [local, others] = splitProps(merged, ["id"]);
  const el = document.createElement("div");
  el.id = local.id;
  // Register the id for aria-labelledby; unregister on disposal.
  createEffect(() => onCleanup(context.registerTitleId(local.id)));
  _solidInsert(el, () => others.children);
  spreadProps(el, others);
  return el;
}
function ToastDescription(props) {
  const context = useToastContext();
  const merged = mergeProps(
    { "data-slot": "toast-description", id: context.generateId("description") },
    props,
  );
  const [local, others] = splitProps(merged, ["id"]);
  const el = document.createElement("div");
  el.id = local.id;
  // Register the id for aria-describedby; unregister on disposal.
  createEffect(() => onCleanup(context.registerDescriptionId(local.id)));
  _solidInsert(el, () => others.children);
  spreadProps(el, others);
  return el;
}
function ToastActions(props) {
  const el = document.createElement("div");
  el.setAttribute("data-slot", "toast-actions");
  _solidInsert(el, () => props.children);
  spreadProps(el, props);
  return el;
}
function ToastCloseButton(props) {
  const context = useToastContext();
  const i18n = useI18n();
  const merged = mergeProps(
    {
      "data-slot": "toast-close-button",
      icon: "close",
      variant: "ghost",
      get ["aria-label"]() {
        return i18n.t("ui.common.dismiss");
      },
    },
    props,
  );
  const [local, others] = splitProps(merged, ["onClick"]);
  // Closing goes through the toast context (mirrors Kobalte's CloseButton, which
  // called context.close() after any user onClick). Rendered with the vendor
  // IconButton — previously selected via Kobalte's `as: IconButton`.
  const onClick = e => {
    if (typeof local.onClick === "function") local.onClick(e);
    context.close();
  };
  return createComponent(IconButton, mergeProps({ onClick }, others));
}
function ToastProgressTrack(props) {
  const el = document.createElement("div");
  el.setAttribute("data-slot", "toast-progress-track");
  el.setAttribute("aria-hidden", "true");
  el.setAttribute("role", "presentation");
  _solidInsert(el, () => props.children);
  spreadProps(el, props);
  return el;
}
function ToastProgressFill(props) {
  const rootContext = useToastRegionContext();
  const context = useToastContext();
  const el = document.createElement("div");
  el.setAttribute("data-slot", "toast-progress-fill");

  const [lifeTime, setLifeTime] = createSignal(100);
  let totalElapsedTime = 0;

  // Tick the remaining-life custom property while the timer runs (paused when
  // the region is paused or the toast is persistent) — Kobalte's ProgressFill.
  createEffect(() => {
    if (rootContext.isPaused() || context.isPersistent()) return;
    const intervalId = setInterval(() => {
      const elapsedTime =
        new Date().getTime() - context.closeTimerStartTime() + totalElapsedTime;
      const life = Math.trunc(100 - (elapsedTime / context.duration()) * 100);
      setLifeTime(life < 0 ? 0 : life);
    });
    onCleanup(() => {
      totalElapsedTime += new Date().getTime() - context.closeTimerStartTime();
      clearInterval(intervalId);
    });
  });
  createRenderEffect(() => {
    el.style.setProperty("--kb-toast-progress-fill-width", `${lifeTime()}%`);
  });

  _solidInsert(el, () => props.children);
  spreadProps(el, props);
  return el;
}

function isDeltaInDirection(delta, direction, threshold = 0) {
  const deltaX = Math.abs(delta.x);
  const deltaY = Math.abs(delta.y);
  const isDeltaX = deltaX > deltaY;
  if (direction === "left" || direction === "right") {
    return isDeltaX && deltaX > threshold;
  }
  return !isDeltaX && deltaY > threshold;
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
