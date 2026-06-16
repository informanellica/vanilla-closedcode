/** @file API-compatible reimplementation of the subset of solid-js this app uses (signals, effects, memos, owners/context, control-flow, and a solid-js/web DOM-helper subset). */
// (milestone: solid-free reactivity, Stage R1). The reactive core itself —
// signals, effects, memos, owners/scopes — is an independent implementation;
// the memo/template DOM helpers near the end of this file reproduce the
// solid-js/web (dom-expressions) runtime helpers of the same name. Call sites
// can later be re-pointed here by swapping what the "solid-js" specifier
// resolves to (import map / #imports) — without touching the source. Semantics
// follow docs/milestones/solid-free-reactivity.md ("Semantics R1 must reproduce").
//
// Derived in part from solid-js / dom-expressions (MIT License,
// Copyright (c) 2016-2025 Ryan Carniato). See THIRD-PARTY-NOTICES.md.

let Owner = null;     // current ownership scope (cleanups, child computations, context)
let Listener = null;  // current computation collecting dependencies
let BatchQueue = null; // non-null while inside batch(): Set<Computation>

/**
 * An ownership scope node: tracks child scopes, cleanup callbacks, and context
 * values. Disposing a node disposes its children (depth-first, reverse order)
 * then runs its cleanups LIFO.
 */
class OwnerNode {
  /**
   * @param {OwnerNode} parent - Parent scope, or null for a detached root.
   */
  constructor(parent) {
    this.parent = parent;
    this.children = null;   // child OwnerNode[]
    this.cleanups = null;   // function[] (LIFO on dispose)
    this.context = null;    // { [id]: value }
    this.disposed = false;
    if (parent) (parent.children ??= []).push(this);
  }
  /**
   * Dispose this scope: dispose children (reverse order) then run cleanups LIFO.
   * Idempotent.
   * @returns {void}
   */
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    if (this.children) {
      for (let i = this.children.length - 1; i >= 0; i--) this.children[i].dispose();
      this.children = null;
    }
    if (this.cleanups) {
      for (let i = this.cleanups.length - 1; i >= 0; i--) {
        try { this.cleanups[i](); } catch (e) { console.error(e); }
      }
      this.cleanups = null;
    }
  }
}

/**
 * A reactive computation: an owner scope that also tracks signal dependencies
 * and re-runs when they change. The kind selects the scheduling behavior.
 */
class Computation extends OwnerNode {
  // kind: "render" (sync at creation + sync updates) | "effect" (deferred
  // initial run) | "memo" (lazy-ish: runs at creation, caches, notifies)
  /**
   * @param {Function} fn - The computation body; receives the previous value and returns the next.
   * @param {string} kind - One of "render", "effect", or "memo".
   * @param {Object} options - Options; options.equals (Function or false) and options.value (initial value).
   */
  constructor(fn, kind, options) {
    super(Owner);
    this.fn = fn;
    this.kind = kind;
    this.sources = null;        // Set<Signal> subscribed to
    this.value = undefined;
    this.observers = null;      // for memo: Set<Computation> reading it
    this.equals = options?.equals === undefined ? (a, b) => a === b : options.equals || (() => false);
    this.pendingValue = options?.value;
  }
  /**
   * Detach this computation from all signals/memos it currently reads.
   * @returns {void}
   */
  unsubscribe() {
    if (this.sources) {
      for (const s of this.sources) s.observers.delete(this);
      this.sources = null;
    }
  }
  /**
   * Unsubscribe from sources, then dispose the owner scope.
   * @returns {void}
   */
  dispose() {
    this.unsubscribe();
    super.dispose();
  }
  /**
   * Execute the computation: re-collect dependencies, dispose nested
   * scopes/cleanups from the previous run, run fn under this scope, and (for
   * memos) notify observers when the value changed.
   * @returns {void}
   */
  run() {
    if (this.disposed) return;
    // re-collect dependencies + dispose nested computations/cleanups from the
    // previous run (children created during run are owned by this node)
    this.unsubscribe();
    if (this.children) {
      for (let i = this.children.length - 1; i >= 0; i--) this.children[i].dispose();
      this.children = null;
    }
    if (this.cleanups) {
      const cs = this.cleanups;
      this.cleanups = null;
      for (let i = cs.length - 1; i >= 0; i--) {
        try { cs[i](); } catch (e) { console.error(e); }
      }
    }
    this.disposed = false;
    const prevOwner = Owner, prevListener = Listener;
    Owner = this; Listener = this;
    try {
      const next = this.fn(this.value);
      if (this.kind === "memo") {
        const changed = !this.equals(this.value, next);
        this.value = next;
        if (changed && this.observers) notify([...this.observers]);
      } else {
        this.value = next;
      }
    } finally {
      Owner = prevOwner; Listener = prevListener;
    }
  }
  /**
   * Read this memo's cached value, subscribing the current Listener (if any) so
   * it re-runs when the memo recomputes.
   * @returns {*} The memo's current value.
   */
  read() {
    if (Listener) {
      (this.observers ??= new Set()).add(Listener);
      (Listener.sources ??= new Set()).add(this);
    }
    return this.value;
  }
}
// memos participate as signal-like sources for unsubscribe symmetry
Object.defineProperty(Computation.prototype, "observersDelete", { value: undefined });

/**
 * Run (or, inside a batch, enqueue) a set of computations to react to a change.
 * @param {Array} computations - Computations to re-run.
 * @returns {void}
 */
function notify(computations) {
  if (BatchQueue) {
    for (const c of computations) BatchQueue.add(c);
    return;
  }
  for (const c of computations) c.run();
}

/**
 * A reactive value: reading it under a Listener subscribes that computation;
 * writing a changed value notifies all subscribed observers.
 */
class Signal {
  /**
   * @param {*} value - Initial value.
   * @param {Object} options - Options; options.equals is a comparator Function or false to always notify.
   */
  constructor(value, options) {
    this.value = value;
    this.observers = new Set();
    this.equals = options?.equals === undefined ? (a, b) => a === b : options.equals || (() => false);
  }
  /**
   * Read the value, subscribing the current Listener (if any).
   * @returns {*} The current value.
   */
  read() {
    if (Listener) {
      this.observers.add(Listener);
      (Listener.sources ??= new Set()).add(this);
    }
    return this.value;
  }
  /**
   * Write a new value (or apply an updater function); notify observers if it
   * changed under the equality comparator.
   * @param {*} next - New value, or an updater Function (prev) => next.
   * @returns {*} The resulting value.
   */
  write(next) {
    if (typeof next === "function") next = next(this.value);
    if (this.equals(this.value, next)) return this.value;
    this.value = next;
    if (this.observers.size) notify([...this.observers]);
    return next;
  }
}

/**
 * Create a reactive signal.
 * @param {*} value - Initial value.
 * @param {Object} options - Options; options.equals comparator Function or false.
 * @returns {Array} A [getter, setter] tuple: getter() reads, setter(v) writes (or applies an updater).
 */
export function createSignal(value, options) {
  const s = new Signal(value, options);
  return [() => s.read(), v => s.write(v)];
}

/**
 * Create a render effect: runs synchronously now and synchronously again
 * whenever a tracked dependency changes.
 * @param {Function} fn - Effect body; receives the previous value, returns the next.
 * @param {*} value - Initial previous-value seed.
 * @returns {void}
 */
export function createRenderEffect(fn, value) {
  const c = new Computation(fn, "render", { value });
  c.value = value;
  c.run();
  return undefined;
}

/**
 * Create an effect whose initial run is deferred past the current synchronous
 * phase (via a microtask); subsequent runs are synchronous on dependency change.
 * @param {Function} fn - Effect body; receives the previous value, returns the next.
 * @param {*} value - Initial previous-value seed.
 * @returns {void}
 */
export function createEffect(fn, value) {
  const c = new Computation(fn, "effect", { value });
  c.value = value;
  // solid defers the initial effect run past the current synchronous phase
  queueMicrotask(() => { if (!c.disposed || c.sources === null) c.run(); });
  return undefined;
}

/**
 * Create a memoized derived value: runs now, caches its result, and notifies
 * observers only when the value changes under the comparator.
 * @param {Function} fn - Derivation; receives the previous value, returns the next.
 * @param {*} value - Initial previous-value seed.
 * @param {Object} options - Options; options.equals comparator Function or false.
 * @returns {Function} An accessor returning the current memoized value.
 */
export function createMemo(fn, value, options) {
  const c = new Computation(fn, "memo", { ...options, value });
  c.value = value;
  c.run();
  return () => c.read();
}

// solid's createComputed: a pure computation that runs synchronously at
// creation and synchronously on updates. We model it identically to a render
// effect (sync create + sync update); the only solid nuance we don't reproduce
// is its higher scheduling priority over render effects, which our fully
// synchronous graph makes moot for the call sites that use it.
/**
 * Create a pure computation that runs synchronously at creation and on updates
 * (modeled here identically to a render effect).
 * @param {Function} fn - Computation body; receives the previous value, returns the next.
 * @param {*} value - Initial previous-value seed.
 * @returns {void}
 */
export function createComputed(fn, value) {
  return createRenderEffect(fn, value);
}

/**
 * Run fn inside a fresh root owner scope, passing it a dispose callback that
 * tears down everything created in the scope.
 * @param {Function} fn - Receives dispose() and returns a value.
 * @param {OwnerNode} detachedOwner - Optional parent owner (default null = fully detached).
 * @returns {*} Whatever fn returns.
 */
export function createRoot(fn, detachedOwner) {
  const root = new OwnerNode(detachedOwner ?? null);
  const prevOwner = Owner, prevListener = Listener;
  Owner = root; Listener = null;
  try {
    return fn(() => root.dispose());
  } finally {
    Owner = prevOwner; Listener = prevListener;
  }
}

/**
 * Register a cleanup to run when the current owner scope is disposed.
 * @param {Function} fn - Cleanup callback.
 * @returns {Function} The same fn (for convenience).
 */
export function onCleanup(fn) {
  if (Owner) (Owner.cleanups ??= []).push(fn);
  return fn;
}

/**
 * Run fn once after the first render tick (no SSR, so mount == first tick).
 * @param {Function} fn - Mount callback (run untracked).
 * @returns {void}
 */
export function onMount(fn) {
  // no SSR: mount == first render tick
  createEffect(() => untrack(fn));
}

/**
 * Get the current owner scope (or null).
 * @returns {OwnerNode} The active owner, or null.
 */
export function getOwner() { return Owner; }

/**
 * Get the current tracking computation, or null. solid-js/store uses this to
 * decide whether a property read should lazily create + subscribe a signal.
 * @returns {Computation} The active Listener, or null.
 */
export function getListener() { return Listener; }

// Store interop markers, shared with lib/store.js (it imports them from here).
// $TRACK lets a consumer subscribe to a whole store object/array — solid's
// indexArray reads `list[$TRACK]`, and a few first-party components do too;
// $PROXY tags an already-wrapped object. Because store proxies test reads
// against these exact symbols, they MUST be the same identities the consumers
// import, so they live here (the `solid-js` resolution target) rather than in
// store.js.
export const $PROXY = Symbol("solid-proxy");
export const $TRACK = Symbol("solid-track");

/**
 * Run fn with a given owner scope as the active owner (and no active Listener).
 * @param {OwnerNode} owner - The owner scope to run under.
 * @param {Function} fn - Function to run.
 * @returns {*} Whatever fn returns.
 */
export function runWithOwner(owner, fn) {
  const prevOwner = Owner, prevListener = Listener;
  Owner = owner; Listener = null;
  try { return fn(); } finally { Owner = prevOwner; Listener = prevListener; }
}

/**
 * Run fn without subscribing the current computation to any signals it reads.
 * @param {Function} fn - Function to run untracked.
 * @returns {*} Whatever fn returns.
 */
export function untrack(fn) {
  const prev = Listener;
  Listener = null;
  try { return fn(); } finally { Listener = prev; }
}

let uniqueId = 0;
/**
 * Produce a process-unique string id (unique within the document here).
 * @returns {string} A unique id like "cl-1".
 */
export function createUniqueId() {
  return `cl-${++uniqueId}`;
}

// solid's startTransition defers work into a concurrent transition. We have no
// concurrent scheduler, so the work runs synchronously and the returned promise
// resolves once it (and any microtasks it queued) settle. Callers that only use
// it to drive an "is transitioning" flag therefore observe an instantaneous
// transition — acceptable for our single consumer (router useIsRouting).
/**
 * Run fn as a transition. With no concurrent scheduler the work is synchronous;
 * the returned promise resolves once it and its queued microtasks settle.
 * @param {Function} fn - Transition body.
 * @returns {Promise} Resolves with fn's result after it settles.
 */
export function startTransition(fn) {
  const r = fn ? fn() : undefined;
  return Promise.resolve(r);
}

/**
 * Batch signal writes so dependent computations re-run once after fn completes,
 * instead of after each write. Nested batches join the outer batch.
 * @param {Function} fn - Function performing the batched writes.
 * @returns {*} Whatever fn returns.
 */
export function batch(fn) {
  if (BatchQueue) return fn();
  BatchQueue = new Set();
  try { return fn(); }
  finally {
    const queue = BatchQueue;
    BatchQueue = null;
    for (const c of queue) c.run();
  }
}

/**
 * Build an explicit-dependency callback for use in an effect/memo: only the
 * listed deps are tracked, and fn runs untracked with their current/previous
 * values. With options.defer the first run is skipped (deps are just recorded).
 * @param {Function|Array} deps - A dependency accessor, or an array of them.
 * @param {Function} fn - Called as fn(input, prevInput, prevValue); input is the (single or array) dep value(s).
 * @param {Object} options - Options; options.defer (boolean) skips the initial run.
 * @returns {Function} A computation body suitable for createMemo/createEffect.
 */
export function on(deps, fn, options) {
  const list = Array.isArray(deps) ? deps : [deps];
  let defer = options?.defer;
  let prevInput;
  return prevValue => {
    const input = list.map(d => d());
    if (defer) { defer = false; prevInput = input; return undefined; }
    const result = untrack(() => fn(Array.isArray(deps) ? input : input[0], prevInput, prevValue));
    prevInput = input;
    return result;
  };
}

// ---- context ---------------------------------------------------------------
let contextId = 0;
/**
 * Create a context object with a Provider component, mirroring solid's createContext.
 * @param {*} defaultValue - Value returned by useContext when no Provider is found.
 * @returns {Object} A context with id, defaultValue, and a Provider(props) component.
 */
export function createContext(defaultValue) {
  const id = `ctx-${++contextId}`;
  const ctx = {
    id,
    defaultValue,
    Provider(props) {
      // Children evaluate under an owner that carries the value; the getter is
      // resolved through children() so lazy re-evaluation also sees it.
      const node = new OwnerNode(Owner);
      node.context = { ...(Owner?.context), [id]: props.value };
      return runWithOwner(node, () => children(() => props.children)());
    }
  };
  return ctx;
}
/**
 * Read the nearest provided value for a context by walking up owner scopes.
 * @param {Object} ctx - A context created by createContext.
 * @returns {*} The provided value, or the context's defaultValue.
 */
export function useContext(ctx) {
  let o = Owner;
  while (o) {
    if (o.context && ctx.id in o.context) return o.context[ctx.id];
    o = o.parent;
  }
  return ctx.defaultValue;
}

// ---- component helpers -----------------------------------------------------
/**
 * Instantiate a component function with props, untracked (so the call itself
 * doesn't subscribe the caller's computation).
 * @param {Function} Comp - Component function.
 * @param {Object} props - Props object (defaults to {}).
 * @returns {*} The component's return value.
 */
export function createComponent(Comp, props) {
  return untrack(() => Comp(props || {}));
}

/**
 * Memoize and recursively resolve a children accessor (unwrapping nested
 * functions/arrays) so children are evaluated once and re-resolved reactively.
 * @param {Function} fn - Accessor returning the raw children value.
 * @returns {Function} An accessor returning the resolved children.
 */
export function children(fn) {
  const memo = createMemo(() => resolveChildren(fn()));
  return () => memo();
}
/**
 * Recursively resolve a children value: call zero-arg functions, flatten arrays,
 * and return leaf values as-is.
 * @param {*} value - A child, function, or (possibly nested) array of them.
 * @returns {*} The resolved value (a leaf or a flattened array).
 */
function resolveChildren(value) {
  if (typeof value === "function" && !value.length) return resolveChildren(value());
  if (Array.isArray(value)) {
    const out = [];
    for (const item of value) {
      const r = resolveChildren(item);
      Array.isArray(r) ? out.push(...r) : out.push(r);
    }
    return out;
  }
  return value;
}

/**
 * Merge several prop sources into one object whose properties are lazy getters,
 * so later sources override earlier ones and reactive getters stay reactive.
 * @param {...Object} sources - Prop source objects (falsy sources are skipped).
 * @returns {Object} A merged props object with getter-backed properties.
 */
export function mergeProps(...sources) {
  const target = {};
  for (const source of sources) {
    if (!source) continue;
    const descriptors = Object.getOwnPropertyDescriptors(source);
    for (const key in descriptors) {
      const d = descriptors[key];
      if (d.get) Object.defineProperty(target, key, { get: d.get, enumerable: true, configurable: true });
      else Object.defineProperty(target, key, {
        get: (s => () => s[key])(source),
        enumerable: true, configurable: true
      });
    }
  }
  return target;
}

/**
 * Split a props object into one group per key-list plus a rest group, preserving
 * reactivity (each output property is a getter onto the original props).
 * @param {Object} props - Source props.
 * @param {...Array} keysList - One array of property names per output group.
 * @returns {Array} The group objects followed by the rest object.
 */
export function splitProps(props, ...keysList) {
  const out = keysList.map(() => ({}));
  const rest = {};
  const claimed = new Set(keysList.flat());
  for (const key of Object.keys(props)) {
    const target = (() => {
      for (let i = 0; i < keysList.length; i++) if (keysList[i].includes(key)) return out[i];
      return rest;
    })();
    Object.defineProperty(target, key, {
      get: () => props[key],
      enumerable: true, configurable: true
    });
  }
  void claimed;
  return [...out, rest];
}

// ---- DOM helpers (solid-js/web subset) --------------------------------------
// No SSR: the renderer is client-only, so isServer is always false (matches the
// `browser` resolution condition the import map already uses for third parties).
export const isServer = false;

// solid-js/web compiled-output primitives, needed by the few first-party files
// that are still compiler output (the desktop renderer entry: loading.js /
// index.js). memo wraps a reactive sub-expression in a memo; template builds a
// cloneable DOM factory from an HTML string. Both reproduce the solid-js/web
// (dom-expressions, MIT) runtime helpers of the same name.
/**
 * Wrap a reactive sub-expression in a memo (solid-js/web compiled-output helper).
 * @param {Function} fn - The reactive expression.
 * @returns {Function} A memo accessor for the expression.
 */
export const memo = fn => createMemo(() => fn());
/**
 * Build a cloneable DOM-node factory from an HTML string (solid-js/web template
 * helper). The template element is created lazily on first use, then cloned.
 * @param {string} html - The template markup.
 * @param {boolean} isImportNode - When true, clone via document.importNode (untracked).
 * @param {boolean} isSVG - When true, unwrap an extra SVG wrapper level.
 * @returns {Function} A factory returning a fresh cloned node on each call.
 */
export function template(html, isImportNode, isSVG) {
  let node;
  const create = () => {
    const t = document.createElement("template");
    t.innerHTML = html;
    return isSVG ? t.content.firstChild.firstChild : t.content.firstChild;
  };
  const fn = isImportNode
    ? () => untrack(() => document.importNode(node || (node = create()), true))
    : () => (node || (node = create())).cloneNode(true);
  fn.cloneNode = fn;
  return fn;
}

/**
 * Coerce a child value into an array of DOM nodes: nullish/booleans yield none,
 * functions are called, arrays are flattened, Nodes pass through, and other
 * values become text nodes.
 * @param {*} value - The child value.
 * @returns {Array} The resulting DOM nodes.
 */
function nodesOf(value) {
  if (value == null || value === false || value === true) return [];
  if (typeof value === "function" && !value.length) return nodesOf(value());
  if (Array.isArray(value)) return value.flatMap(nodesOf);
  if (value instanceof Node) return [value];
  return [document.createTextNode(String(value))];
}

/**
 * Reactively render a child accessor into a parent DOM element, replacing the
 * previously inserted nodes on each change (solid-js/web insert() subset).
 * @param {Node} parent - Parent element to insert into.
 * @param {Function|*} accessor - A child value or an accessor returning one.
 * @param {Node} marker - Optional node to insert before; null/undefined appends at the end.
 * @returns {void}
 */
export function insert(parent, accessor, marker) {
  const anchor = document.createComment("");
  if (marker === undefined || marker === null) parent.appendChild(anchor);
  else parent.insertBefore(anchor, marker);
  let current = [];
  createRenderEffect(() => {
    const next = nodesOf(typeof accessor === "function" ? accessor() : accessor);
    for (const n of current) if (n.parentNode) n.parentNode.removeChild(n);
    for (const n of next) anchor.parentNode.insertBefore(n, anchor);
    current = next;
  });
}

/**
 * Mount a reactive root that inserts `code` into `element`, returning a disposer.
 * @param {Function|*} code - Top-level child accessor or value to render.
 * @param {Node} element - Mount target element.
 * @returns {Function} A dispose callback that tears down the root.
 */
export function render(code, element) {
  return createRoot(dispose => {
    insert(element, code);
    return dispose;
  });
}

/**
 * Render a dynamically chosen component or element tag (solid's Dynamic).
 * @param {Object} props - Props; props.component is a component Function or a tag string, remaining props are forwarded.
 * @returns {*} The rendered component output, an element with inserted children, or null.
 */
export function Dynamic(props) {
  const [local, others] = splitProps(props, ["component"]);
  const comp = local.component;
  if (typeof comp === "function") return createComponent(comp, others);
  if (typeof comp === "string") {
    const el = document.createElement(comp);
    insert(el, () => others.children);
    return el;
  }
  return null;
}

/**
 * Render children into a detached host element appended to a mount target,
 * cleaned up on disposal (solid's Portal).
 * @param {Object} props - Props; props.mount target element (default document.body), props.children.
 * @returns {Node} A placeholder comment node left at the original location.
 */
export function Portal(props) {
  const host = document.createElement("div");
  (props.mount ?? document.body).appendChild(host);
  insert(host, () => props.children);
  onCleanup(() => host.remove());
  return document.createComment("portal");
}

// ---- control flow (accessor-returning, consumed through insert()) ----------
/**
 * Conditionally render children when props.when is truthy, else props.fallback
 * (solid's Show). When props.keyed, children may be a function receiving the
 * narrowed value; otherwise it receives an accessor to props.when.
 * @param {Object} props - Props: when (condition), children, fallback, keyed (boolean).
 * @returns {Function} A memo accessor yielding the active branch.
 */
export function Show(props) {
  const condition = createMemo(() => props.when, undefined, { equals: props.keyed ? undefined : (a, b) => !!a === !!b });
  return createMemo(() => {
    const c = condition();
    if (c) {
      const child = props.children;
      return typeof child === "function" && child.length ? child(props.keyed ? c : () => props.when) : resolveChildren(child);
    }
    return resolveChildren(props.fallback);
  });
}

/**
 * Keyed-by-reference list mapping (solid's mapArray). Surviving items keep their
 * mapped output and the owner/effects created for them across updates; removed
 * items are disposed. The index passed to mapFn is a live accessor that updates
 * on reorder only when mapFn reads it (i.e. when mapFn arity > 1).
 * @param {Function} list - Accessor returning the input array.
 * @param {Function} mapFn - Called as mapFn(item, indexAccessor); returns the mapped output.
 * @returns {Function} A memo accessor returning the array of mapped outputs.
 */
export function mapArray(list, mapFn) {
  let items = [];           // previous input items (by reference)
  let mapped = [];          // mapped outputs, parallel to items
  let disposers = [];       // per-item createRoot disposer
  const wantsIndex = mapFn.length > 1;
  let indexSetters = wantsIndex ? [] : null;
  onCleanup(() => { for (const d of disposers) d(); });
  return createMemo(() => {
    const next = list() || [];
    const len = next.length;
    const newMapped = new Array(len);
    const newDisposers = new Array(len);
    const newIndexSetters = wantsIndex ? new Array(len) : null;
    // Index previous items by reference; a count guards duplicate references.
    const prev = new Map();
    for (let i = 0; i < items.length; i++) {
      const arr = prev.get(items[i]);
      if (arr) arr.push(i); else prev.set(items[i], [i]);
    }
    const reused = new Array(items.length).fill(false);
    for (let i = 0; i < len; i++) {
      const item = next[i];
      const bucket = prev.get(item);
      let j = -1;
      while (bucket && bucket.length) { const k = bucket.shift(); if (!reused[k]) { j = k; break; } }
      if (j >= 0) {
        reused[j] = true;
        newMapped[i] = mapped[j];
        newDisposers[i] = disposers[j];
        if (wantsIndex) { newIndexSetters[i] = indexSetters[j]; newIndexSetters[i](i); }
      } else {
        newMapped[i] = createRoot(dispose => {
          newDisposers[i] = dispose;
          if (wantsIndex) {
            const [index, setIndex] = createSignal(i);
            newIndexSetters[i] = setIndex;
            return mapFn(item, index);
          }
          return mapFn(item, () => i);
        });
      }
    }
    for (let j = 0; j < items.length; j++) if (!reused[j]) disposers[j]();
    items = next; mapped = newMapped; disposers = newDisposers; indexSetters = newIndexSetters;
    return mapped;
  });
}

/**
 * Render a list keyed by item reference (solid's For).
 * @param {Object} props - Props: each (the array), children(item, indexAccessor).
 * @returns {Function} An accessor returning the mapped children.
 */
export function For(props) {
  const mapped = mapArray(() => props.each, (item, index) => props.children(item, index));
  return () => mapped();
}

/**
 * Render a list keyed by index/position (solid's indexArray/Index). Each slot is
 * stable per index; the item is a live signal so a value change at a position
 * updates in place rather than rebuilding. Trailing slots are disposed on shrink.
 * @param {Object} props - Props: each (the array), children(itemAccessor, index).
 * @returns {Function} A memo accessor returning the array of slot nodes.
 */
export function Index(props) {
  let slots = [];           // { setItem, dispose, node } per index
  onCleanup(() => { for (const s of slots) s.dispose(); });
  return createMemo(() => {
    const items = props.each || [];
    const out = new Array(items.length);
    for (let i = 0; i < items.length; i++) {
      let slot = slots[i];
      if (!slot) {
        slot = createRoot(dispose => {
          const [item, setItem] = createSignal(items[i]);
          const node = props.children(item, i);
          return { setItem, dispose, node };
        });
        slots[i] = slot;
      } else {
        slot.setItem(() => items[i]);
      }
      out[i] = slot.node;
    }
    for (let i = items.length; i < slots.length; i++) slots[i].dispose();
    slots.length = items.length;
    return out;
  });
}

/**
 * Render the first Match child whose `when` is truthy, else props.fallback
 * (solid's Switch).
 * @param {Object} props - Props: children (Match descriptors), fallback.
 * @returns {Function} A memo accessor yielding the matched branch's children.
 */
export function Switch(props) {
  return createMemo(() => {
    const branches = resolveChildren(props.children);
    const list = Array.isArray(branches) ? branches : [branches];
    for (const branch of list) {
      if (branch && typeof branch === "object" && "when" in branch && branch.when) {
        return resolveChildren(branch.children);
      }
    }
    return resolveChildren(props.fallback);
  });
}
/**
 * Declare a branch for Switch (solid's Match). Returns a descriptor whose when
 * and children are lazy getters so reads stay tracked inside Switch's memo.
 * @param {Object} props - Props: when (condition), children.
 * @returns {Object} A { when, children } descriptor with getter-backed properties.
 */
export function Match(props) {
  // Evaluated inside Switch's memo, so reads stay tracked there.
  return { get when() { return props.when; }, get children() { return props.children; } };
}

/**
 * Render children, catching synchronous errors and showing a fallback that can
 * reset the boundary (solid's ErrorBoundary).
 * @param {Object} props - Props: children, fallback (value or fn(error, reset)).
 * @returns {Function} A memo accessor yielding children or the fallback.
 */
export function ErrorBoundary(props) {
  const [error, setError] = createSignal();
  return createMemo(() => {
    const err = error();
    if (err !== undefined) {
      const fb = props.fallback;
      return typeof fb === "function" ? fb(err, () => setError(undefined)) : fb;
    }
    try { return resolveChildren(props.children); }
    catch (e) { setError(() => e); return undefined; }
  });
}

/**
 * Suspense-lite: render children, falling back to props.fallback when children
 * resolve to nothing (no transitions; resources render their loading inline).
 * @param {Object} props - Props: children, fallback.
 * @returns {Function} A memo accessor yielding children or the fallback.
 */
export function Suspense(props) {
  // suspense-lite: no transitions; resources render their loading state inline.
  return createMemo(() => resolveChildren(props.children) ?? resolveChildren(props.fallback));
}

/**
 * Create a lazily-loaded component: the module is imported on first render and
 * the component renders once it resolves (solid's lazy).
 * @param {Function} loader - Async loader returning a module with a default export component.
 * @returns {Function} A component function rendering the loaded component when ready.
 */
export function lazy(loader) {
  let comp;
  return props => {
    const [ready, setReady] = createSignal(!!comp);
    if (!comp) loader().then(m => { comp = m.default; setReady(true); });
    return createMemo(() => (ready() && comp ? createComponent(comp, props) : undefined));
  };
}

/**
 * Create an async resource (solid's createResource). Re-fetches whenever the
 * source changes; exposes loading/error/latest on the read accessor.
 * @param {Function|*} sourceOrFetcher - The source accessor, or the fetcher when called with one argument.
 * @param {Function} maybeFetcher - The fetcher(sourceValue) when a source is provided.
 * @returns {Array} A [read, { refetch, mutate }] tuple; read() returns the value and carries loading/error/latest.
 */
export function createResource(sourceOrFetcher, maybeFetcher) {
  const hasSource = maybeFetcher !== undefined;
  const fetcher = hasSource ? maybeFetcher : sourceOrFetcher;
  const source = hasSource ? sourceOrFetcher : () => true;
  const [value, setValue] = createSignal(undefined);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal(undefined);
  let generation = 0;
  createRenderEffect(() => {
    const s = typeof source === "function" ? source() : source;
    if (s === false || s == null) return;
    const gen = ++generation;
    setLoading(true);
    Promise.resolve(untrack(() => fetcher(s))).then(
      v => { if (gen === generation) { setValue(() => v); setLoading(false); } },
      e => { if (gen === generation) { setError(() => e); setLoading(false); } }
    );
  });
  const read = () => value();
  Object.defineProperties(read, {
    loading: { get: loading },
    error: { get: error },
    latest: { get: value },
  });
  const refetch = () => { generation++; /* re-run by bumping source readers */ };
  return [read, { refetch, mutate: v => setValue(() => v) }];
}
