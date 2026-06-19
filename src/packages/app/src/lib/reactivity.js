// API-compatible reimplementation of the subset of solid-js this app uses
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

/**
 * API-compatible reimplementation of the solid-js subset the app uses: signals/effects/memos, owners, context, control-flow, and DOM helpers.
 * @module lib/reactivity
 */

let Owner = null;     // current ownership scope (cleanups, child computations, context)
let Listener = null;  // current computation collecting dependencies
// Pending computations to (re-)run. Non-null while a flush is open — opened
// either explicitly by batch() or implicitly by the first write/notify outside
// a flush. Draining is iterative + de-duplicated: each computation runs at most
// once per drain wave, and any node re-dirtied during the wave is picked up by
// the next wave. This is what makes propagation glitch-free (a node downstream
// of a diamond runs once after BOTH parents update) and re-entrancy-safe (a
// write made while running a computation is enqueued, never recursed into).
let PendingQueue = null; // Set<Computation> | null
let Flushing = false;    // true while draining PendingQueue (re-entrancy guard)

/**
 * An ownership scope node: tracks child scopes, cleanups, and context, and
 * disposes them recursively (children first, cleanups LIFO) on dispose.
 */
class OwnerNode {
  /**
   * @param {OwnerNode} parent - The parent scope (registers this as a child), or null.
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
   * Dispose this scope: dispose children, then run cleanups (LIFO). Idempotent.
   *
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
 * A reactive computation (render effect / effect / memo). Tracks the signals it
 * reads, re-runs when they change, owns child scopes created during its run, and
 * (for memos) caches its value and notifies its own observers when it changes.
 */
class Computation extends OwnerNode {
  // kind: "render" (sync at creation + sync updates) | "effect" (deferred
  // initial run) | "memo" (lazy-ish: runs at creation, caches, notifies)
  /**
   * @param {Function} fn - The computation body; receives the previous value.
   * @param {string} kind - "render", "effect", or "memo".
   * @param {Object} options - `{ value, equals }` initial value and equality check.
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
   * Drop all dependency subscriptions (removes this from each source's observers).
   *
   * @returns {void}
   */
  unsubscribe() {
    if (this.sources) {
      for (const s of this.sources) s.observers.delete(this);
      this.sources = null;
    }
  }
  /**
   * Dispose: unsubscribe from sources, then dispose the owned scope.
   *
   * @returns {void}
   */
  dispose() {
    this.unsubscribe();
    super.dispose();
  }
  /**
   * Re-run the computation: tear down the previous run's deps/children/cleanups,
   * collect new dependencies, store/notify the new value (memo) or just store it.
   *
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
        // Enqueue observers instead of running them recursively: this is the
        // memo's "I changed" notification, deferred into the current flush wave
        // so each downstream computation runs at most once per propagation.
        if (changed && this.observers && this.observers.size) notify(this.observers);
      } else {
        this.value = next;
      }
    } catch (err) {
      // Route a render/effect/memo error to the nearest enclosing ErrorBoundary
      // (walk the owner chain, same as currentSuspense). If there is none,
      // rethrow so the error still surfaces to the update's caller as before.
      let o = this.parent, handler = null;
      while (o) {
        if (o.context && ERROR_KEY in o.context) { handler = o.context[ERROR_KEY]; break; }
        o = o.parent;
      }
      if (!handler) throw err;
      handler(err);
    } finally {
      Owner = prevOwner; Listener = prevListener;
    }
  }
  // memo read
  /**
   * Read the memo's cached value, subscribing the current listener to it.
   *
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

// Enqueue computations into the active flush. If no flush is open, open one and
// drive it to completion synchronously (preserving the previous "writes settle
// before write() returns" behavior). `computations` is any iterable of
// Computation (a memo's observer Set, or a one-off array).
/**
 * Enqueue computations into the active flush, opening and draining one if none
 * is currently open.
 *
 * @param {Iterable} computations - Computations to (re-)run.
 * @returns {void}
 */
function notify(computations) {
  if (PendingQueue) {
    for (const c of computations) PendingQueue.add(c);
    return;
  }
  PendingQueue = new Set();
  for (const c of computations) PendingQueue.add(c);
  flush();
}

// Drain PendingQueue in waves. Within a wave we snapshot the current set and run
// each member once; runs may enqueue more work (memo observers, effects) into a
// fresh set, which the next wave drains. A computation re-dirtied mid-wave is
// simply re-added and handled next wave — so genuine cycles still terminate per
// run (no recursion blowup) and converge unless a computation unconditionally
// re-dirties itself. Re-entrant notify() during draining just feeds the queue.
/**
 * Drain the pending queue in waves until it converges, running each enqueued
 * computation once per wave (re-entrancy-safe and glitch-free).
 *
 * @returns {void}
 */
function flush() {
  if (Flushing) return; // a notify() during drain only enqueues; outer loop runs it
  Flushing = true;
  try {
    let guard = 0;
    while (PendingQueue && PendingQueue.size) {
      const wave = PendingQueue;
      PendingQueue = new Set();
      for (const c of wave) {
        if (!c.disposed) c.run();
      }
      // Safety valve: a pathological self-re-dirtying graph would otherwise spin
      // forever. Cap waves and surface it rather than hard-freezing the renderer.
      if (++guard > 1e6) {
        PendingQueue = null;
        throw new Error("reactivity: update did not converge (possible reactive cycle)");
      }
    }
  } finally {
    PendingQueue = null;
    Flushing = false;
  }
}

/**
 * A reactive signal: a mutable value plus the set of computations observing it.
 * Reads subscribe the current listener; writes notify observers when the value
 * actually changes (per the `equals` check).
 */
class Signal {
  /**
   * @param {*} value - Initial value.
   * @param {Object} options - `{ equals }` equality predicate (or false to always notify).
   */
  constructor(value, options) {
    this.value = value;
    this.observers = new Set();
    this.equals = options?.equals === undefined ? (a, b) => a === b : options.equals || (() => false);
  }
  /**
   * Read the value, subscribing the current listener.
   *
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
   * Write a new value (or apply a function updater), notifying observers on change.
   *
   * @param {*} next - The new value, or a function `(prev) => next`.
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
 *
 * @param {*} value - Initial value.
 * @param {Object} options - `{ equals }` equality predicate.
 * @returns {Array} A `[getter, setter]` pair.
 */
export function createSignal(value, options) {
  const s = new Signal(value, options);
  return [() => s.read(), v => s.write(v)];
}

/**
 * Create a render effect: runs synchronously at creation and on every update.
 *
 * @param {Function} fn - Effect body; receives the previous return value.
 * @param {*} value - Initial previous value passed to `fn`.
 * @returns {void}
 */
export function createRenderEffect(fn, value) {
  const c = new Computation(fn, "render", { value });
  c.value = value;
  c.run();
  return undefined;
}

/**
 * Create an effect whose initial run is deferred past the current sync phase.
 *
 * @param {Function} fn - Effect body; receives the previous return value.
 * @param {*} value - Initial previous value passed to `fn`.
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
 * Create a memo: a cached derived value that re-runs when its deps change and
 * notifies its own observers only when its value changes.
 *
 * @param {Function} fn - Derivation; receives the previous memo value.
 * @param {*} value - Initial previous value passed to `fn`.
 * @param {Object} options - `{ equals }` equality predicate.
 * @returns {Function} An accessor returning the memo's current value.
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
 * Create a synchronous computation (modeled identically to a render effect).
 *
 * @param {Function} fn - Computation body; receives the previous value.
 * @param {*} value - Initial previous value passed to `fn`.
 * @returns {void}
 */
export function createComputed(fn, value) {
  return createRenderEffect(fn, value);
}

/**
 * Run `fn` inside a fresh, independently-disposable ownership scope. Unless an
 * explicit `detachedOwner` is passed, the root inherits the current owner for
 * context resolution but is not registered as its child.
 *
 * @param {Function} fn - Receives a dispose callback for the new root.
 * @param {OwnerNode} detachedOwner - Explicit parent owner (or null to fully detach).
 * @returns {*} Whatever `fn` returns.
 */
export function createRoot(fn, detachedOwner) {
  // Match solid: when no explicit `detachedOwner` is passed, the root INHERITS the
  // current owner so descendants still resolve context (useContext walks the parent
  // chain) — pass `null` to fully detach. The root owns its own disposal via the
  // dispose callback, so it is deliberately NOT registered in the parent's children
  // (a caller re-run must not tear it down). Earlier this used the parent ctor arg
  // (`detachedOwner ?? null`), which both detached context (undefined -> null parent,
  // so e.g. useQueryClient inside a createRoot threw "No QueryClient set") and
  // auto-registered as a child. Set the parent link manually to get context without
  // the registration.
  const root = new OwnerNode(null);
  root.parent = detachedOwner !== undefined ? detachedOwner : Owner;
  const prevOwner = Owner, prevListener = Listener;
  Owner = root; Listener = null;
  try {
    return fn(() => root.dispose());
  } finally {
    Owner = prevOwner; Listener = prevListener;
  }
}

/**
 * Register a cleanup to run when the current owner scope disposes.
 *
 * @param {Function} fn - Cleanup callback.
 * @returns {Function} The same cleanup function.
 */
export function onCleanup(fn) {
  if (Owner) (Owner.cleanups ??= []).push(fn);
  return fn;
}

/**
 * Run `fn` once after the first render tick (mount).
 *
 * @param {Function} fn - Mount callback.
 * @returns {void}
 */
export function onMount(fn) {
  // no SSR: mount == first render tick
  createEffect(() => untrack(fn));
}

/**
 * @returns {OwnerNode} The current ownership scope, or null.
 */
export function getOwner() { return Owner; }

// Current tracking computation, or null. solid-js/store uses this to decide
// whether a property read should lazily create + subscribe a tracking signal.
/**
 * @returns {Computation} The current tracking computation, or null.
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
 * Run `fn` with `owner` as the current scope (and no active listener).
 *
 * @param {OwnerNode} owner - Scope to run under.
 * @param {Function} fn - Function to run.
 * @returns {*} Whatever `fn` returns.
 */
export function runWithOwner(owner, fn) {
  const prevOwner = Owner, prevListener = Listener;
  Owner = owner; Listener = null;
  try { return fn(); } finally { Owner = prevOwner; Listener = prevListener; }
}

/**
 * Run `fn` without tracking signal reads as dependencies.
 *
 * @param {Function} fn - Function to run untracked.
 * @returns {*} Whatever `fn` returns.
 */
export function untrack(fn) {
  const prev = Listener;
  Listener = null;
  try { return fn(); } finally { Listener = prev; }
}

let uniqueId = 0;
// Stable per-call unique string id (solid uses this for SSR-stable ids; here it
// only needs to be unique within the document).
/**
 * Generate a string id unique within the document.
 *
 * @returns {string} A unique id like `cl-1`.
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
 * Run `fn` (synchronously, no concurrent scheduler) and resolve once it settles.
 *
 * @param {Function} fn - Work to run as a transition.
 * @returns {Promise} A promise resolved after the work settles.
 */
export function startTransition(fn) {
  const r = fn ? fn() : undefined;
  return Promise.resolve(r);
}

/**
 * Batch reactive writes so dependent computations flush once at the end.
 *
 * @param {Function} fn - Function performing the batched writes.
 * @returns {*} Whatever `fn` returns.
 */
export function batch(fn) {
  // Already inside a flush (nested batch, or a write mid-propagation): just run;
  // writes enqueue into the existing PendingQueue and drain with it.
  if (PendingQueue) return fn();
  PendingQueue = new Set();
  try { return fn(); }
  finally { flush(); }
}

/**
 * Build a computation body that tracks only `deps` and calls `fn` untracked with
 * their current and previous values (solid's `on` helper, with optional defer).
 *
 * @param {*} deps - A dependency accessor or array of accessors to track.
 * @param {Function} fn - Called as `(input, prevInput, prevValue)`.
 * @param {Object} options - `{ defer }` to skip the initial run.
 * @returns {Function} A computation body usable with createEffect/createMemo.
 */
export function on(deps, fn, options) {
  const isArray = Array.isArray(deps);
  const list = isArray ? deps : [deps];
  let defer = options?.defer;
  let prevInput;
  return prevValue => {
    const input = list.map(d => d());
    if (defer) { defer = false; prevInput = input; return undefined; }
    // Pass the PREVIOUS input unwrapped the same way as the current one: for a
    // single (non-array) dep solid hands the callback the bare previous value, not
    // a one-element array. Passing the wrapped `prevInput` made `prev` an array
    // here, so callers like the router's routeStates (prevMatches[i].route.key)
    // read .route off the whole matches array -> "undefined reading 'key'" -> the
    // route outlet stopped re-rendering on navigation.
    const prev = prevInput === undefined ? undefined : (isArray ? prevInput : prevInput[0]);
    const result = untrack(() => fn(isArray ? input : input[0], prev, prevValue));
    prevInput = input;
    return result;
  };
}

// ---- context ---------------------------------------------------------------
let contextId = 0;
/**
 * Create a context object with a Provider that exposes a value to descendants.
 *
 * @param {*} defaultValue - Value returned by useContext when no Provider is found.
 * @returns {Object} A context object `{ id, defaultValue, Provider }`.
 */
export function createContext(defaultValue) {
  const id = `ctx-${++contextId}`;
  const ctx = {
    id,
    defaultValue,
    /**
     * Provide `props.value` to descendants and render `props.children` once.
     *
     * @param {Object} props - `{ value, children }` provider props.
     * @returns {*} The rendered children.
     */
    Provider(props) {
      // Children are created ONCE under an owner node that carries the context
      // value, then returned as-is (a stable accessor/value). Reading props.children
      // more than once re-invokes the getter (-> createComponent), re-creating the
      // whole child subtree (incl. createResource instances) — a re-create loop in
      // which a persisted resource never settles, so a gate keyed on `resource.ready`
      // never opens (desktop white screen). Creating once preserves component
      // identity (matches solid: a Provider's children JSX is created once); the
      // descendants were created with `node` as owner, so useContext resolves the
      // value, and insert()'s nested effects keep inner dynamics live.
      const node = new OwnerNode(Owner);
      node.context = { ...(Owner?.context), [id]: props.value };
      return runWithOwner(node, () => props.children);
    }
  };
  return ctx;
}
/**
 * Resolve a context value by walking the owner chain for a matching Provider.
 *
 * @param {Object} ctx - The context object from createContext.
 * @returns {*} The nearest provided value, or the context default.
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
 * Instantiate a component function with props, untracked (solid's createComponent).
 *
 * @param {Function} Comp - The component function.
 * @param {Object} props - Props passed to the component.
 * @returns {*} The component's output.
 */
export function createComponent(Comp, props) {
  return untrack(() => Comp(props || {}));
}

/**
 * Wrap a children accessor in a memo that resolves nested functions/arrays.
 *
 * @param {Function} fn - Accessor returning the (possibly nested) children.
 * @returns {Function} An accessor returning the resolved children.
 */
export function children(fn) {
  const memo = createMemo(() => resolveChildren(fn()));
  return () => memo();
}
/**
 * Recursively resolve children: call zero-arg functions and flatten arrays.
 *
 * @param {*} value - A child value, accessor, or nested array.
 * @returns {*} The resolved child value (or flattened array).
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
 * Merge multiple props sources into one object, preserving getters so reactive
 * values stay live and later sources override earlier ones.
 *
 * @param {...Object} sources - Props objects to merge (later wins).
 * @returns {Object} The merged props object.
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
 * Split a props object into groups for each key list plus a rest object, keeping
 * reactive getters intact.
 *
 * @param {Object} props - The props object to split.
 * @param {...Array} keysList - One array of keys per output group.
 * @returns {Array} `[...groups, rest]` matching the key lists, then the remainder.
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
 * Wrap a reactive sub-expression in a memo (solid-js/web's compiled `memo`).
 *
 * @param {Function} fn - Reactive expression to memoize.
 * @returns {Function} An accessor returning the memoized value.
 */
export const memo = fn => createMemo(() => fn());
/**
 * Build a cloneable DOM-node factory from an HTML string (solid-js/web `template`).
 *
 * @param {string} html - The HTML markup for the template.
 * @param {boolean} isImportNode - Whether to importNode (vs cloneNode) on each call.
 * @param {boolean} isSVG - Whether the template content is wrapped SVG.
 * @returns {Function} A factory returning a fresh DOM node per call.
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

// Reactive child renderer — the solid-js/web insert() equivalent. Each DYNAMIC
// (function) child renders inside its OWN render effect, bounded by a pair of
// comment markers, so its reactive reads stay isolated: a deep signal change
// re-runs only that boundary's effect, never an ancestor's. The previous version
// resolved children inline in a single render effect, which subscribed that one
// effect to the WHOLE transitive subtree — so any leaf change re-ran it, and
// re-running re-read the `get children()` getters along the way (-> createComponent),
// re-creating whole component subtrees (and their resources) until nothing settled
// (the desktop white screen). Mirrors dom-expressions' insertExpression (MIT),
// simplified to the value shapes this app produces (nullish/boolean, string/number,
// Node, Array, accessor fn) with full-replace reconciliation; keyed lists go
// through For/mapArray.
/**
 * Insert a reactive child into `parent`, bounded by a pair of comment markers so
 * each dynamic child re-renders in isolation (solid-js/web's `insert`).
 *
 * @param {Node} parent - The container element.
 * @param {*} accessor - A value, Node, array, or accessor function to render.
 * @param {Node} marker - Optional node to insert before (else appended).
 * @returns {void}
 */
export function insert(parent, accessor, marker) {
  const start = document.createComment("");
  const end = document.createComment("");
  if (marker === undefined || marker === null) { parent.appendChild(start); parent.appendChild(end); }
  else { parent.insertBefore(start, marker); parent.insertBefore(end, marker); }
  insertExpression(parent, accessor, start, end);
}

// Remove every node strictly between the `start` and `end` markers.
/**
 * Remove every node strictly between the two marker comments.
 *
 * @param {Node} start - The start marker.
 * @param {Node} end - The end marker.
 * @returns {void}
 */
function clearBetween(start, end) {
  const region = end.parentNode;
  if (!region) return;
  let n = start.nextSibling;
  while (n && n !== end) { const next = n.nextSibling; region.removeChild(n); n = next; }
}

// Render `value` into the region delimited by the [start, end) markers. A
// function value is a dynamic boundary: it gets its own render effect (which
// subscribes only to what THAT accessor reads), and the recursion gives every
// nested dynamic its own effect too. Static values reconcile by full replace.
/**
 * Render a value into the region between [start, end). Function values become
 * their own dynamic render-effect boundary; static values reconcile by full
 * replace; arrays get a sub-region per element.
 *
 * @param {Node} parent - The container element.
 * @param {*} value - Nullish/boolean, string/number, Node, array, or accessor.
 * @param {Node} start - The region start marker.
 * @param {Node} end - The region end marker.
 * @returns {void}
 */
function insertExpression(parent, value, start, end) {
  if (typeof value === "function" && !value.length) {
    createRenderEffect(() => { insertExpression(parent, value(), start, end); });
    return;
  }
  const region = end.parentNode;
  if (!region) return;
  clearBetween(start, end);
  if (value == null || typeof value === "boolean") return;
  if (Array.isArray(value)) {
    // Each element gets its own sub-region (own marker pair) so a dynamic
    // element re-renders in place without disturbing its siblings.
    for (const item of value) {
      const itemStart = document.createComment("");
      const itemEnd = document.createComment("");
      region.insertBefore(itemStart, end);
      region.insertBefore(itemEnd, end);
      insertExpression(parent, item, itemStart, itemEnd);
    }
    return;
  }
  region.insertBefore(value instanceof Node ? value : document.createTextNode(String(value)), end);
}

/**
 * Mount a root component into a DOM element, returning a dispose callback.
 *
 * @param {Function} code - Component factory; called once to build the tree.
 * @param {HTMLElement} element - The mount target.
 * @returns {Function} A dispose function tearing down the root.
 */
export function render(code, element) {
  return createRoot(dispose => {
    // Create the root component ONCE (code()), then insert its result. Passing
    // `code` itself to insert() makes insert's render effect re-run code() on every
    // re-render — re-creating the entire root component tree (and its resources)
    // on each inner update, which loops (a re-created context/resource never
    // settles). Calling code() once keeps the tree stable; the returned accessor's
    // reactivity drives in-place DOM updates through insert's render effect.
    insert(element, code());
    return dispose;
  });
}

/**
 * Render a dynamic component or element chosen at runtime, forwarding props.
 *
 * @param {Object} props - Component props.
 * @param {*} props.component - A component function or an HTML tag name string.
 * @returns {*} The rendered component, element, or null.
 */
export function Dynamic(props) {
  const [local, others] = splitProps(props, ["component"]);
  const comp = local.component;
  if (typeof comp === "function") return createComponent(comp, others);
  if (typeof comp === "string") {
    const el = document.createElement(comp);
    // Forward non-children props (the function-component branch forwards them via
    // createComponent, but the string branch used to drop them — so e.g. the SSR
    // diff's `ref` never fired and its `id` was missing). Handle ref, event
    // handlers, and attributes (reactive accessors stay live via a render effect).
    /**
     * Apply a single attribute/class/style value to the element.
     *
     * @param {string} key - Attribute name (or "class"/"style").
     * @param {*} v - Value to apply (nullish/false removes the attribute).
     * @returns {void}
     */
    const applyAttr = (key, v) => {
      if (key === "class" || key === "className") el.setAttribute("class", v == null ? "" : String(v));
      else if (key === "style" && v && typeof v === "object") { for (const s in v) el.style[s] = v[s]; }
      else if (v == null || v === false) el.removeAttribute(key);
      else if (v === true) el.setAttribute(key, "");
      else el.setAttribute(key, String(v));
    };
    for (const key in others) {
      if (key === "children") continue;
      if (key === "ref") { if (typeof others.ref === "function") others.ref(el); continue; }
      if (key.length > 2 && key[0] === "o" && key[1] === "n" && typeof others[key] === "function") {
        el.addEventListener(key.slice(2).toLowerCase(), others[key]);
        continue;
      }
      const val = others[key];
      if (typeof val === "function") createRenderEffect(() => applyAttr(key, val()));
      else applyAttr(key, val);
    }
    insert(el, () => others.children);
    return el;
  }
  return null;
}

/**
 * Render children into a detached host element appended to `props.mount` (or
 * document.body), removing the host on cleanup.
 *
 * @param {Object} props - Component props.
 * @param {HTMLElement} props.mount - Mount target (defaults to document.body).
 * @param {*} props.children - Children rendered into the host.
 * @returns {Node} A placeholder comment node in the original tree.
 */
export function Portal(props) {
  const host = document.createElement("div");
  (props.mount ?? document.body).appendChild(host);
  insert(host, () => props.children);
  onCleanup(() => host.remove());
  return document.createComment("portal");
}

// Suspense pending-resource tracking. A <Suspense> publishes an { inc, dec }
// handle on its owner-node context; resources created beneath it bump the count
// while a fetch is in flight so Suspense can show its fallback until they
// settle. Looked up by walking the owner chain (same as useContext).
const SUSPENSE_KEY = Symbol("suspense");
// ErrorBoundary publishes a handler on its owner-node context; a computation that
// throws during run() walks the owner chain (like currentSuspense) to the nearest
// one and routes the error to it instead of crashing the flush. No boundary ->
// the error rethrows, preserving the previous propagate-to-caller behavior.
const ERROR_KEY = Symbol("errorboundary");
/**
 * Find the nearest enclosing Suspense handle by walking the owner chain.
 *
 * @returns {Object} The Suspense `{ inc, dec }` handle, or null.
 */
function currentSuspense() {
  let o = Owner;
  while (o) {
    if (o.context && SUSPENSE_KEY in o.context) return o.context[SUSPENSE_KEY];
    o = o.parent;
  }
  return null;
}

// ---- control flow (accessor-returning, consumed through insert()) ----------
/**
 * Conditionally render children when `props.when` is truthy, else `props.fallback`.
 * Supports keyed mode and render-prop children. Children are captured once.
 *
 * @param {Object} props - Component props.
 * @param {*} props.when - Condition value (also the key in keyed mode).
 * @param {boolean} props.keyed - Whether a changed `when` remounts the subtree.
 * @param {*} props.children - Subtree or render-prop `(value) => node`.
 * @param {*} props.fallback - Rendered when the condition is falsy.
 * @returns {Function} An accessor consumed through insert().
 */
export function Show(props) {
  const condition = createMemo(() => props.when, undefined, { equals: props.keyed ? undefined : (a, b) => !!a === !!b });
  // Read props.children EXACTLY ONCE (lazily, on the first truthy run) and cache
  // it. Reading the getter re-invokes it (-> createComponent), so reading it every
  // run — even just to test whether it's a render-prop — re-creates the whole child
  // subtree + its resources; the resource's loading then flips the condition, which
  // re-runs this memo, which re-creates again: an infinite loop (desktop white
  // screen). Capture under `node` (a child of Show's owner, so context still
  // resolves). A render-prop child (arity >= 1, e.g. keyed <Show>{v => ...}</Show>)
  // is the cached FUNCTION and is re-invoked per run so keyed values stay dynamic;
  // a plain subtree is the cached value and is returned as a stable accessor for
  // insert()'s nested effects to resolve in place.
  const showOwner = Owner;
  let node = new OwnerNode(showOwner);
  let captured, hasCaptured = false, isRenderProp = false, prevKey;
  return createMemo(() => {
    const conditionValue = condition();
    if (conditionValue) {
      // keyed <Show>: a CHANGED key must remount — dispose the old subtree (so
      // its onCleanup runs, e.g. a provider aborting its event stream) and
      // re-capture under a fresh owner. Non-keyed Show never re-captures (the
      // condition memo only re-runs on truthiness flips), so this is keyed-only.
      if (props.keyed && hasCaptured && conditionValue !== prevKey) {
        node.dispose();
        node = new OwnerNode(showOwner);
        hasCaptured = false;
      }
      if (!hasCaptured) {
        captured = runWithOwner(node, () => props.children);
        isRenderProp = typeof captured === "function" && captured.length > 0;
        hasCaptured = true;
        prevKey = conditionValue;
      }
      if (isRenderProp) return captured(props.keyed ? conditionValue : () => props.when);
      return captured;
    }
    // Hidden: dispose the captured subtree so its cleanups run, then re-capture on
    // the next truthy flip. Applies to BOTH keyed and non-keyed Show — when `when`
    // goes falsy the children should tear down (keyed key-CHANGES still remount via
    // the branch above). Without this a hidden child's onCleanup never fires — e.g.
    // a Portal'd find bar stays mounted to <body>, or a keyed terminal panel keeps
    // its websocket/resize listener/timers alive after the last tab closes.
    if (hasCaptured) {
      node.dispose();
      node = new OwnerNode(showOwner);
      hasCaptured = false;
    }
    return props.fallback;
  });
}

// solid's mapArray: keyed-by-reference list mapping. Each surviving item keeps
// its mapped output (and the owner/effects created while mapping it) across
// updates; removed items are disposed; the index passed to mapFn is a live
// accessor that updates on reorder only when mapFn reads it (arity > 1).
/**
 * Keyed-by-reference list mapping: each surviving item keeps its mapped output
 * (and owned effects) across updates; removed items are disposed.
 *
 * @param {Function} list - Accessor returning the input array.
 * @param {Function} mapFn - Mapper `(item, index)`; reads `index` only if arity > 1.
 * @returns {Function} A memo accessor returning the mapped outputs.
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
    // Snapshot (shallow copy): list() may be a createStore array that reconcile
    // mutates IN PLACE, so keeping `next` by reference would make next run's prev
    // map reflect the already-mutated contents — removed rows would be missing from
    // it and their disposers never run (leaking the row's effects/listeners).
    items = next.slice(); mapped = newMapped; disposers = newDisposers; indexSetters = newIndexSetters;
    return mapped;
  });
}

/**
 * Render a keyed-by-reference list (solid's <For>).
 *
 * @param {Object} props - Component props.
 * @param {Array} props.each - The list to render.
 * @param {Function} props.children - Render function `(item, indexAccessor)`.
 * @returns {Function} An accessor returning the rendered items.
 */
export function For(props) {
  const mapped = mapArray(() => props.each, (item, index) => props.children(item, index));
  return () => mapped();
}

// solid's indexArray: keyed-by-INDEX (position). The slot is stable per index;
// the item is a live signal so a value change at a position updates in place
// rather than rebuilding. Trailing slots are disposed when the list shrinks.
/**
 * Render a keyed-by-index list (solid's <Index>): each slot is stable per
 * position and its item is a live signal, so a value change updates in place.
 *
 * @param {Object} props - Component props.
 * @param {Array} props.each - The list to render.
 * @param {Function} props.children - Render function `(itemAccessor, index)`.
 * @returns {Function} An accessor returning the rendered slots.
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
 * Render the first <Match> child whose `when` is truthy, else `props.fallback`.
 *
 * @param {Object} props - Component props.
 * @param {*} props.children - One or more <Match> descriptors.
 * @param {*} props.fallback - Rendered when no branch matches.
 * @returns {Function} An accessor returning the matched branch's children.
 */
export function Switch(props) {
  return createMemo(() => {
    const branches = resolveChildren(props.children);
    const list = Array.isArray(branches) ? branches : [branches];
    for (const branch of list) {
      if (branch && typeof branch === "object" && "when" in branch && branch.when) {
        // A render-prop child (arity >= 1, e.g. <Match>{value => ...}</Match>) is
        // invoked with an accessor to the matched value, mirroring Show. insert()
        // only auto-invokes zero-arg accessors, so a bare function child would
        // otherwise render as its source text instead of the branch UI.
        const branchChildren = branch.children;
        return typeof branchChildren === "function" && branchChildren.length > 0
          ? branchChildren(() => branch.when)
          : branchChildren;
      }
    }
    return props.fallback;
  });
}
/**
 * Declare a Switch branch: a descriptor exposing reactive `when`/`children`.
 *
 * @param {Object} props - Component props.
 * @param {*} props.when - Branch condition.
 * @param {*} props.children - Branch content.
 * @returns {Object} A `{ when, children }` descriptor read by <Switch>.
 */
export function Match(props) {
  // Evaluated inside Switch's memo, so reads stay tracked there.
  return { get when() { return props.when; }, get children() { return props.children; } };
}

/**
 * Catch errors thrown while rendering children and show a fallback instead.
 *
 * @param {Object} props - Component props.
 * @param {*} props.children - Subtree to guard (captured once).
 * @param {*} props.fallback - Value, or `(error, reset)` render function.
 * @returns {Function} An accessor returning children or the fallback.
 */
export function ErrorBoundary(props) {
  const [error, setError] = createSignal();
  // Own the children under a dedicated scope that publishes an error handler, so a
  // throw from a DESCENDANT computation (a later render effect/memo, not just the
  // synchronous first read) walks the owner chain to here and shows the fallback
  // instead of leaving the renderer crashed/blank. Capture the boundary's owner
  // now: the handler runs from Computation.run()'s catch where the global `Owner`
  // is the FAILED computation (run() restores it only in finally), so a fresh node
  // parented on `Owner` there would attach under a disposed computation and leak.
  const boundaryOwner = Owner;
  let node = new OwnerNode(boundaryOwner);
  // Capture children ONCE. Reading props.children inside the memo would re-invoke
  // the `children` getter (-> createComponent) on every re-run, re-creating the
  // whole subtree. Create it once and return the SAME stable accessor; insert()'s
  // nested effects resolve it without subscribing this memo to descendant signals.
  let childrenOnce;
  const capture = () => { childrenOnce = runWithOwner(node, () => props.children); };
  const handler = e => {
    // Entering the error state: dispose the failed subtree so its effects,
    // resources, event listeners and onCleanup registrations stop running behind
    // the fallback, then swap in a fresh owner (under the boundary, not the failed
    // computation) so reset() can re-render cleanly inside the live owner tree.
    node.dispose();
    node = new OwnerNode(boundaryOwner);
    (node.context ??= {})[ERROR_KEY] = handler;
    setError(() => e);
  };
  (node.context ??= {})[ERROR_KEY] = handler;
  try { capture(); } catch (e) { handler(e); }
  return createMemo(() => {
    const err = error();
    if (err !== undefined) {
      const fb = props.fallback;
      return typeof fb === "function" ? fb(err, () => {
        // reset(): re-read children under the fresh owner, then clear the error.
        try { capture(); setError(undefined); } catch (e) { handler(e); }
      }) : fb;
    }
    return childrenOnce;
  });
}

/**
 * Show `props.fallback` while any resource read beneath it is pending, then show
 * the (once-captured) children. No transitions.
 *
 * @param {Object} props - Component props.
 * @param {*} props.children - Subtree, captured once and tracked for pending resources.
 * @param {*} props.fallback - Rendered while resources are pending.
 * @returns {Function} An accessor returning the fallback or the children.
 */
export function Suspense(props) {
  // suspense-lite: no transitions. Capture children once (see ErrorBoundary) so a
  // descendant signal flicker doesn't re-create the subtree on every re-run, and
  // track resources created beneath us so we show the fallback while any are
  // pending (otherwise a child <Show> gated on a not-yet-resolved resource would
  // render its own fallback — e.g. the connection-error screen — instead of the
  // splash during startup). Toggling fallback<->children only swaps which DOM
  // insert() shows; children are never re-created, so there's no loading loop.
  const node = new OwnerNode(Owner);
  const [pending, setPending] = createSignal(0);
  node.context = {
    ...(Owner?.context),
    [SUSPENSE_KEY]: {
      inc: () => setPending(c => c + 1),
      dec: () => setPending(c => Math.max(0, c - 1)),
    },
  };
  let childrenOnce;
  try {
    childrenOnce = runWithOwner(node, () => props.children);
  } catch (err) {
    // A synchronous throw while first reading children is an error, not a pending
    // state. Route it to the nearest ErrorBoundary (walk the owner chain like
    // Computation.run) instead of swallowing it — otherwise childrenOnce stays
    // undefined and Suspense pins its fallback forever (e.g. a no-server startup
    // throw would leave the app stuck on the splash). With no boundary, rethrow.
    let o = node.parent, handler = null;
    while (o) {
      if (o.context && ERROR_KEY in o.context) { handler = o.context[ERROR_KEY]; break; }
      o = o.parent;
    }
    if (!handler) throw err;
    handler(err);
  }
  return createMemo(() => (childrenOnce === undefined || pending() > 0) ? props.fallback : childrenOnce);
}

/**
 * Create a lazily-loaded component: the loader runs on first render and the
 * component renders once its module resolves.
 *
 * @param {Function} loader - Async loader returning `{ default: Component }`.
 * @returns {Function} A component that renders the loaded component when ready.
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
 * Create an async resource: a reactive accessor (`read.loading`/`.error`/
 * `.latest`) backed by `fetcher`, with `{ refetch, mutate }` controls and
 * Suspense integration. Supports both `createResource(fetcher, options?)` and
 * `createResource(source, fetcher, options?)` forms.
 *
 * @param {*} sourceOrFetcher - A source accessor or the fetcher.
 * @param {*} fetcherOrOptions - The fetcher (source form) or an options bag.
 * @param {Object} optionsArg - Options bag for the source form (e.g. `{ initialValue }`).
 * @returns {Array} `[read, { refetch, mutate }]` accessor and controls.
 */
export function createResource(sourceOrFetcher, fetcherOrOptions, optionsArg) {
  // Signatures (solid): createResource(fetcher, options?) |
  // createResource(source, fetcher, options?). A function in the 2nd slot means
  // the source form; otherwise the 2nd slot is the options bag. (The previous
  // implementation dropped the options arg entirely — losing `initialValue`.)
  let source, fetcher, options;
  if (typeof fetcherOrOptions === "function") { source = sourceOrFetcher; fetcher = fetcherOrOptions; options = optionsArg || {}; }
  else { source = undefined; fetcher = sourceOrFetcher; options = (fetcherOrOptions && typeof fetcherOrOptions === "object") ? fetcherOrOptions : {}; }
  const hasSource = source !== undefined;
  const sourceAccessor = hasSource ? source : () => true;
  const hasInitial = Object.prototype.hasOwnProperty.call(options, "initialValue");
  const [value, setValue] = createSignal(hasInitial ? options.initialValue : undefined);
  // With an initialValue the resource already has data to serve, so it starts
  // NOT loading (matches solid); otherwise it loads until the first fetch settles.
  const [loading, setLoading] = createSignal(!hasInitial);
  const [error, setError] = createSignal(undefined);
  let latestRequestId = 0;
  let firstRun = true;
  // refetch() works by bumping this signal, which the effect reads — without it
  // the no-source form (sourceAccessor === () => true) has no dependency, so the
  // effect never re-runs and refetch would be a no-op (broken retry buttons).
  const [refetchTick, setRefetchTick] = createSignal(0);
  createRenderEffect(() => {
    refetchTick();
    const sourceValue = typeof sourceAccessor === "function" ? sourceAccessor() : sourceAccessor;
    if (sourceValue === false || sourceValue == null) return;
    const requestId = ++latestRequestId;
    // Don't flip loading->true on the FIRST fetch when an initialValue exists.
    // That transient true->false flip drove an infinite loop: a <Show> gated on
    // `resource.ready` (createSimpleContext) would close then re-open, re-mounting
    // its children, which re-create persisted resources, which flip loading again.
    // Source-change refetches after the first run still surface loading normally.
    const skipLoading = firstRun && hasInitial;
    firstRun = false;
    if (!skipLoading) setLoading(true);
    Promise.resolve(untrack(() => fetcher(sourceValue))).then(
      resolvedValue => { if (requestId === latestRequestId) { setValue(() => resolvedValue); setLoading(false); } },
      rejection => { if (requestId === latestRequestId) { setError(() => rejection); setLoading(false); } }
    );
  });
  // <Suspense> integration (read-based, matching solid): when this resource is
  // READ while loading from inside a Suspense subtree, bump that Suspense's
  // pending count so it shows its fallback (e.g. the startup splash), and release
  // it once loading ends. The loading check is untracked so reading the value
  // doesn't subscribe consumers to `loading`; resources read outside any Suspense
  // are unaffected (currentSuspense() is null).
  let suspendedIn = null;
  const read = () => {
    if (!suspendedIn && untrack(loading)) {
      const s = currentSuspense();
      if (s) { suspendedIn = s; s.inc(); }
    }
    return value();
  };
  createRenderEffect(() => {
    // Read loading() UNCONDITIONALLY so this effect subscribes to it on the first
    // run (when suspendedIn is still null). A short-circuit `suspendedIn && !loading()`
    // would skip the read, never subscribe, and never release the Suspense -> the
    // fallback (splash) would stick forever.
    const isLoading = loading();
    if (suspendedIn && !isLoading) { suspendedIn.dec(); suspendedIn = null; }
  });
  Object.defineProperties(read, {
    loading: { get: loading },
    error: { get: error },
    latest: { get: value },
  });
  const refetch = () => { setRefetchTick(c => c + 1); };
  return [read, { refetch, mutate: v => setValue(typeof v === "function" ? v : () => v) }];
}
