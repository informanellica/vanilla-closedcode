// Self-written reactive core (milestone: solid-free reactivity, Stage R1).
// API-compatible with the subset of solid-js this app uses, so call sites can
// later be re-pointed here by swapping what the "solid-js" specifier resolves
// to (import map / #imports) — without touching the source. Semantics follow
// docs/milestones/solid-free-reactivity.md ("Semantics R1 must reproduce").

let Owner = null;     // current ownership scope (cleanups, child computations, context)
let Listener = null;  // current computation collecting dependencies
let BatchQueue = null; // non-null while inside batch(): Set<Computation>

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
        if (changed && this.observers) notify([...this.observers]);
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

function notify(computations) {
  if (BatchQueue) {
    for (const c of computations) BatchQueue.add(c);
    return;
  }
  for (const c of computations) c.run();
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
  const root = new OwnerNode(detachedOwner ?? null);
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
  if (BatchQueue) return fn();
  BatchQueue = new Set();
  try { return fn(); }
  finally {
    const queue = BatchQueue;
    BatchQueue = null;
    for (const c of queue) c.run();
  }
}

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

function nodesOf(value) {
  if (value == null || value === false || value === true) return [];
  if (typeof value === "function" && !value.length) return nodesOf(value());
  if (Array.isArray(value)) return value.flatMap(nodesOf);
  if (value instanceof Node) return [value];
  return [document.createTextNode(String(value))];
}

// Reactive child renderer (solid-js/web insert() equivalent for our usage:
// element parents, optional null marker meaning "append region at the end").
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

export function render(code, element) {
  return createRoot(dispose => {
    insert(element, code);
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

// ---- control flow (accessor-returning, consumed through insert()) ----------
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
        return resolveChildren(branch.children);
      }
    }
    return resolveChildren(props.fallback);
  });
}
export function Match(props) {
  // Evaluated inside Switch's memo, so reads stay tracked there.
  return { get when() { return props.when; }, get children() { return props.children; } };
}

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

export function Suspense(props) {
  // suspense-lite: no transitions; resources render their loading state inline.
  return createMemo(() => resolveChildren(props.children) ?? resolveChildren(props.fallback));
}

export function lazy(loader) {
  let comp;
  return props => {
    const [ready, setReady] = createSignal(!!comp);
    if (!comp) loader().then(m => { comp = m.default; setReady(true); });
    return createMemo(() => (ready() && comp ? createComponent(comp, props) : undefined));
  };
}

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
