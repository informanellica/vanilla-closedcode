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

class OwnerNode {
  constructor(parent) {
    this.parent = parent;
    this.children = null;   // child OwnerNode[]
    this.cleanups = null;   // function[] (LIFO on dispose)
    this.context = null;    // { [id]: value }
    this.disposed = false;
    if (parent) (parent.children ??= []).push(this);
  }
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

class Computation extends OwnerNode {
  // kind: "render" (sync at creation + sync updates) | "effect" (deferred
  // initial run) | "memo" (lazy-ish: runs at creation, caches, notifies)
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
  unsubscribe() {
    if (this.sources) {
      for (const s of this.sources) s.observers.delete(this);
      this.sources = null;
    }
  }
  dispose() {
    this.unsubscribe();
    super.dispose();
  }
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
    } finally {
      Owner = prevOwner; Listener = prevListener;
    }
  }
  // memo read
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

class Signal {
  constructor(value, options) {
    this.value = value;
    this.observers = new Set();
    this.equals = options?.equals === undefined ? (a, b) => a === b : options.equals || (() => false);
  }
  read() {
    if (Listener) {
      this.observers.add(Listener);
      (Listener.sources ??= new Set()).add(this);
    }
    return this.value;
  }
  write(next) {
    if (typeof next === "function") next = next(this.value);
    if (this.equals(this.value, next)) return this.value;
    this.value = next;
    if (this.observers.size) notify([...this.observers]);
    return next;
  }
}

export function createSignal(value, options) {
  const s = new Signal(value, options);
  return [() => s.read(), v => s.write(v)];
}

export function createRenderEffect(fn, value) {
  const c = new Computation(fn, "render", { value });
  c.value = value;
  c.run();
  return undefined;
}

export function createEffect(fn, value) {
  const c = new Computation(fn, "effect", { value });
  c.value = value;
  // solid defers the initial effect run past the current synchronous phase
  queueMicrotask(() => { if (!c.disposed || c.sources === null) c.run(); });
  return undefined;
}

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
export function createComputed(fn, value) {
  return createRenderEffect(fn, value);
}

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

export function onCleanup(fn) {
  if (Owner) (Owner.cleanups ??= []).push(fn);
  return fn;
}

export function onMount(fn) {
  // no SSR: mount == first render tick
  createEffect(() => untrack(fn));
}

export function getOwner() { return Owner; }

// Current tracking computation, or null. solid-js/store uses this to decide
// whether a property read should lazily create + subscribe a tracking signal.
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

export function runWithOwner(owner, fn) {
  const prevOwner = Owner, prevListener = Listener;
  Owner = owner; Listener = null;
  try { return fn(); } finally { Owner = prevOwner; Listener = prevListener; }
}

export function untrack(fn) {
  const prev = Listener;
  Listener = null;
  try { return fn(); } finally { Listener = prev; }
}

let uniqueId = 0;
// Stable per-call unique string id (solid uses this for SSR-stable ids; here it
// only needs to be unique within the document).
export function createUniqueId() {
  return `cl-${++uniqueId}`;
}

// solid's startTransition defers work into a concurrent transition. We have no
// concurrent scheduler, so the work runs synchronously and the returned promise
// resolves once it (and any microtasks it queued) settle. Callers that only use
// it to drive an "is transitioning" flag therefore observe an instantaneous
// transition — acceptable for our single consumer (router useIsRouting).
export function startTransition(fn) {
  const r = fn ? fn() : undefined;
  return Promise.resolve(r);
}

export function batch(fn) {
  // Already inside a flush (nested batch, or a write mid-propagation): just run;
  // writes enqueue into the existing PendingQueue and drain with it.
  if (PendingQueue) return fn();
  PendingQueue = new Set();
  try { return fn(); }
  finally { flush(); }
}

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
export function createContext(defaultValue) {
  const id = `ctx-${++contextId}`;
  const ctx = {
    id,
    defaultValue,
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
export function useContext(ctx) {
  let o = Owner;
  while (o) {
    if (o.context && ctx.id in o.context) return o.context[ctx.id];
    o = o.parent;
  }
  return ctx.defaultValue;
}

// ---- component helpers -----------------------------------------------------
export function createComponent(Comp, props) {
  return untrack(() => Comp(props || {}));
}

export function children(fn) {
  const memo = createMemo(() => resolveChildren(fn()));
  return () => memo();
}
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
export const memo = fn => createMemo(() => fn());
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
export function insert(parent, accessor, marker) {
  const start = document.createComment("");
  const end = document.createComment("");
  if (marker === undefined || marker === null) { parent.appendChild(start); parent.appendChild(end); }
  else { parent.insertBefore(start, marker); parent.insertBefore(end, marker); }
  insertExpression(parent, accessor, start, end);
}

// Remove every node strictly between the `start` and `end` markers.
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
function currentSuspense() {
  let o = Owner;
  while (o) {
    if (o.context && SUSPENSE_KEY in o.context) return o.context[SUSPENSE_KEY];
    o = o.parent;
  }
  return null;
}

// ---- control flow (accessor-returning, consumed through insert()) ----------
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
    return props.fallback;
  });
}

// solid's mapArray: keyed-by-reference list mapping. Each surviving item keeps
// its mapped output (and the owner/effects created while mapping it) across
// updates; removed items are disposed; the index passed to mapFn is a live
// accessor that updates on reorder only when mapFn reads it (arity > 1).
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

export function For(props) {
  const mapped = mapArray(() => props.each, (item, index) => props.children(item, index));
  return () => mapped();
}

// solid's indexArray: keyed-by-INDEX (position). The slot is stable per index;
// the item is a live signal so a value change at a position updates in place
// rather than rebuilding. Trailing slots are disposed when the list shrinks.
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

export function Switch(props) {
  return createMemo(() => {
    const branches = resolveChildren(props.children);
    const list = Array.isArray(branches) ? branches : [branches];
    for (const branch of list) {
      if (branch && typeof branch === "object" && "when" in branch && branch.when) {
        return branch.children;
      }
    }
    return props.fallback;
  });
}
export function Match(props) {
  // Evaluated inside Switch's memo, so reads stay tracked there.
  return { get when() { return props.when; }, get children() { return props.children; } };
}

export function ErrorBoundary(props) {
  const [error, setError] = createSignal();
  // Capture children ONCE. Reading props.children inside the memo would re-invoke
  // the `children` getter (-> createComponent) on every re-run, re-creating the
  // whole subtree. Create it once and return the SAME stable accessor; insert()'s
  // nested effects resolve it without subscribing this memo to descendant signals.
  let childrenOnce;
  try { childrenOnce = props.children; } catch (e) { setError(() => e); }
  return createMemo(() => {
    const err = error();
    if (err !== undefined) {
      const fb = props.fallback;
      return typeof fb === "function" ? fb(err, () => setError(undefined)) : fb;
    }
    return childrenOnce;
  });
}

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
  try { childrenOnce = runWithOwner(node, () => props.children); } catch { /* leave undefined -> fallback */ }
  return createMemo(() => (childrenOnce === undefined || pending() > 0) ? props.fallback : childrenOnce);
}

export function lazy(loader) {
  let comp;
  return props => {
    const [ready, setReady] = createSignal(!!comp);
    if (!comp) loader().then(m => { comp = m.default; setReady(true); });
    return createMemo(() => (ready() && comp ? createComponent(comp, props) : undefined));
  };
}

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
