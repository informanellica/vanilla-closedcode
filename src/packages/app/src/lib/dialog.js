import { createComponent, createContext, createEffect, createMemo, createRenderEffect, createRoot, createSignal, getOwner, onCleanup, runWithOwner, useContext } from "solid-js";

// Self-contained replacement for ui/context/dialog.
//
// Faithful port of the original dialog context, with two transitive
// dependencies handled so we never import from ui (or its
// own deps) here:
//
//   * `@kobalte/core/dialog` (Kobalte Dialog/Portal/Overlay): the original
//     wrapped the shown element in Kobalte's Portal + Overlay. Our local
//     dialog component (@/bs/dialog.js, the Bootstrap modal) renders its own
//     fixed backdrop/overlay and closes by re-emitting an `Escape` keydown on
//     `window` — the exact event this context already listens for in capture
//     phase. Wrapping in Kobalte would produce a duplicate backdrop and a
//     competing Escape handler, so we render the element directly instead.
//
//   * `@solid-primitives/event-listener` (`makeEventListener`): inlined below
//     as a tiny addEventListener + onCleanup helper.
function makeEventListener(target, type, handler, options) {
  target.addEventListener(type, handler, options);
  const remove = () => target.removeEventListener(type, handler, options);
  onCleanup(remove);
  return remove;
}

// Resolve a possibly-reactive value the way solid-js/web's insert() does:
// call accessors (here, the active dialog's memo) until a concrete value
// remains. Runs inside a render effect, so the reads stay tracked.
function resolveValue(value) {
  while (typeof value === "function") value = value();
  return value;
}

// Render `value` as the sole content of `el`, mirroring insert() semantics
// for the shapes the dialog stack can hold: nothing (null/undefined/boolean),
// a DOM node, a string/number, or an array of those.
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

const Context = createContext();
function init() {
  const [active, setActive] = createSignal();
  const timer = {
    current: undefined
  };
  const lock = {
    value: false
  };
  onCleanup(() => {
    if (timer.current === undefined) return;
    clearTimeout(timer.current);
    timer.current = undefined;
  });
  const close = () => {
    const current = active();
    if (!current || lock.value) return;
    lock.value = true;
    current.onClose?.();
    current.setClosing(true);
    const id = current.id;
    if (timer.current !== undefined) {
      clearTimeout(timer.current);
      timer.current = undefined;
    }
    timer.current = setTimeout(() => {
      timer.current = undefined;
      current.dispose();
      if (active()?.id === id) setActive(undefined);
      lock.value = false;
    }, 100);
  };
  createEffect(() => {
    if (!active()) return;
    const onKeyDown = event => {
      if (event.key !== "Escape") return;
      close();
      event.preventDefault();
      event.stopPropagation();
    };
    makeEventListener(window, "keydown", onKeyDown, {
      capture: true
    });
  });
  const show = (element, owner, onClose) => {
    // Immediately dispose any existing dialog when showing a new one
    const current = active();
    if (current) {
      current.dispose();
      setActive(undefined);
    }
    if (timer.current !== undefined) {
      clearTimeout(timer.current);
      timer.current = undefined;
    }
    lock.value = false;
    const id = Math.random().toString(36).slice(2);
    let dispose;
    let setClosing;
    const node = runWithOwner(owner, () => createRoot(d => {
      dispose = d;
      const [closing, setClosingSignal] = createSignal(false);
      setClosing = setClosingSignal;
      // The shown element (a @/bs/dialog.js Dialog) owns its own backdrop and
      // closing animation; render it directly while it's not closing.
      // `equals: false` matches the compiled memo() wrapper's semantics.
      return createMemo(() => closing() ? null : element(), undefined, {
        equals: false
      });
    }));
    if (!dispose || !setClosing) return;
    setActive({
      id,
      node,
      dispose,
      owner,
      onClose,
      setClosing
    });
  };
  return {
    get active() {
      return active();
    },
    close,
    show
  };
}
export function DialogProvider(props) {
  const ctx = init();
  return createComponent(Context.Provider, {
    value: ctx,
    get children() {
      // Stack element that hosts the currently shown dialog. The render
      // effect replaces solid-js/web insert(): it tracks both the `active`
      // signal (via ctx.active) and the per-dialog closing memo, clearing or
      // swapping the stack contents whenever either changes.
      const stack = document.createElement("div");
      stack.setAttribute("data-component", "dialog-stack");
      createRenderEffect(() => {
        renderInto(stack, resolveValue(ctx.active?.node));
      });
      return [createMemo(() => props.children, undefined, {
        equals: false
      }), stack];
    }
  });
}
export function useDialog() {
  const ctx = useContext(Context);
  const owner = getOwner();
  if (!owner) {
    throw new Error("useDialog must be used within a DialogProvider");
  }
  if (!ctx) {
    throw new Error("useDialog must be used within a DialogProvider");
  }
  return {
    get active() {
      return ctx.active;
    },
    show(element, onClose) {
      const base = ctx.active?.owner ?? owner;
      ctx.show(element, base, onClose);
    },
    close() {
      ctx.close();
    }
  };
}
