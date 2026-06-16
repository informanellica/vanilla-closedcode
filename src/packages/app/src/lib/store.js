// Store layer (milestone: solid-free reactivity, Stage R1). This is a faithful
// PORT of solid-js/store's production build — not an independent rewrite.
// API-compatible with solid-js/store for the subset this app uses
// (createStore / produce / reconcile / unwrap, plus createMutable /
// modifyMutable for completeness), with the three runtime dependencies it needs —
// getListener / batch / createSignal — supplied by our own reactive core
// (lib/reactivity.js) instead of solid-js. The $PROXY / $TRACK marker symbols
// are private to this module (our reactive core does not use them); they only
// need to be internally consistent across the store proxies created here.
//
// Semantics reproduced (docs/milestones/solid-free-reactivity.md):
//   - nested proxy with lazily-created per-property tracking signals;
//   - path-based setters: keys, key arrays, array index ranges {from,to,by},
//     and array filter predicates (item,i)=>bool; final value may be a
//     (prev,traversed)=>next updater; plain-object values merge, arrays/scalars
//     replace; setting a key to undefined deletes it;
//   - reconcile(value,{key,merge}): keyed list diff that mutates in place so
//     only changed paths notify;
//   - produce(fn): mutable draft whose writes go straight through setProperty;
//   - unwrap(value): the raw, proxy-free object graph.
//
// Faithful port of solid-js/store (MIT License,
// Copyright (c) 2016-2025 Ryan Carniato). See THIRD-PARTY-NOTICES.md.

/**
 * @file Solid-free reactive store layer: a faithful port of solid-js/store
 * (createStore / produce / reconcile / unwrap, plus createMutable /
 * modifyMutable) built on lib/reactivity.js, with nested tracking proxies and
 * path-based setters.
 */

import { batch, createSignal, getListener, $PROXY, $TRACK } from "./reactivity.js";

const $RAW = Symbol("store-raw"),
  $NODE = Symbol("store-node"),
  $HAS = Symbol("store-has"),
  $SELF = Symbol("store-self");
// $PROXY (cached-proxy tag) and $TRACK (whole-object tracking) are imported
// from reactivity.js so they are the SAME symbols first-party consumers import
// from "./reactivity.js" — e.g. `items[$TRACK]` must hit this module's proxy traps.

/**
 * Wrap a raw object/array in a tracking Proxy (cached on the value via $PROXY).
 * For plain objects, rebinds own getters to the proxy so they read tracked.
 * @param {Object} value - The raw object or array to wrap.
 * @returns {Proxy} The cached tracking proxy for the value.
 */
function wrap(value) {
  let proxy = value[$PROXY];
  if (!proxy) {
    Object.defineProperty(value, $PROXY, {
      value: proxy = new Proxy(value, proxyTraps)
    });
    if (!Array.isArray(value)) {
      const keys = Object.keys(value),
        desc = Object.getOwnPropertyDescriptors(value);
      for (let i = 0, length = keys.length; i < length; i++) {
        const prop = keys[i];
        if (desc[prop].get) {
          Object.defineProperty(value, prop, {
            enumerable: desc[prop].enumerable,
            get: desc[prop].get.bind(proxy)
          });
        }
      }
    }
  }
  return proxy;
}

/**
 * Whether a value is eligible to be wrapped in a store proxy: a non-null plain
 * object or array (or an already-proxied value).
 * @param {*} obj - The value to test.
 * @returns {boolean} True when the value can be wrapped.
 */
function isWrappable(obj) {
  let proto;
  return (
    obj != null &&
    typeof obj === "object" &&
    (obj[$PROXY] ||
      !(proto = Object.getPrototypeOf(obj)) ||
      proto === Object.prototype ||
      Array.isArray(obj))
  );
}

/**
 * Return the raw, proxy-free object graph behind a store value, replacing any
 * nested proxies in place. Cycles are guarded with a visited set.
 * @param {*} item - The (possibly proxied) value to unwrap.
 * @param {Set} set - Internal set of already-visited objects (recursion guard).
 * @returns {*} The raw value with no store proxies.
 */
export function unwrap(item, set = new Set()) {
  let result, unwrapped, v, prop;
  if ((result = item != null && item[$RAW])) return result;
  if (!isWrappable(item) || set.has(item)) return item;
  if (Array.isArray(item)) {
    if (Object.isFrozen(item)) item = item.slice(0);
    else set.add(item);
    for (let i = 0, length = item.length; i < length; i++) {
      v = item[i];
      if ((unwrapped = unwrap(v, set)) !== v) item[i] = unwrapped;
    }
  } else {
    if (Object.isFrozen(item)) item = Object.assign({}, item);
    else set.add(item);
    const keys = Object.keys(item),
      desc = Object.getOwnPropertyDescriptors(item);
    for (let i = 0, length = keys.length; i < length; i++) {
      prop = keys[i];
      if (desc[prop].get) continue;
      v = item[prop];
      if ((unwrapped = unwrap(v, set)) !== v) item[prop] = unwrapped;
    }
  }
  return item;
}

/**
 * Lazily create (and cache on the target under `symbol`) the per-property
 * tracking-signal map for a store node.
 * @param {Object} target - The raw store object the nodes belong to.
 * @param {symbol} symbol - The marker symbol ($NODE or $HAS) keying the map.
 * @returns {Object} The null-prototype map of property name to signal.
 */
function getNodes(target, symbol) {
  let nodes = target[symbol];
  if (!nodes)
    Object.defineProperty(target, symbol, {
      value: (nodes = Object.create(null))
    });
  return nodes;
}

/**
 * Get or lazily create the tracking signal accessor for one property. The
 * signal uses equals:false (every write notifies; the store decides changes),
 * and its setter is attached as `.$` on the accessor.
 * @param {Object} nodes - The per-property signal map (from getNodes).
 * @param {string|number|symbol} property - The property key.
 * @param {*} value - The initial value for a newly created signal.
 * @returns {Function} The signal accessor (with `.$` setter attached).
 */
function getNode(nodes, property, value) {
  if (nodes[property]) return nodes[property];
  // equals:false -> every write notifies; the store decides "changed" itself.
  const [s, set] = createSignal(value, { equals: false });
  s.$ = set;
  return (nodes[property] = s);
}

/**
 * getOwnPropertyDescriptor trap helper: rewrite a data descriptor into a getter
 * that routes through the proxy so enumeration/Object.keys stay tracked.
 * @param {Object} target - The raw store object.
 * @param {string|symbol} property - The property key being described.
 * @returns {Object} The (possibly rewritten) property descriptor.
 */
function proxyDescriptor(target, property) {
  const desc = Reflect.getOwnPropertyDescriptor(target, property);
  if (
    !desc ||
    desc.get ||
    !desc.configurable ||
    property === $PROXY ||
    property === $NODE
  )
    return desc;
  delete desc.value;
  delete desc.writable;
  desc.get = () => target[$PROXY][property];
  return desc;
}

/**
 * Subscribe the current reactive listener to the node's whole-object ($SELF)
 * signal, so key additions/removals trigger re-computation.
 * @param {Object} target - The raw store object to track.
 * @returns {void}
 */
function trackSelf(target) {
  getListener() && getNode(getNodes(target, $NODE), $SELF)();
}

/**
 * ownKeys trap: track the whole object then return its own keys.
 * @param {Object} target - The raw store object.
 * @returns {Array} The own property keys of the target.
 */
function ownKeys(target) {
  trackSelf(target);
  return Reflect.ownKeys(target);
}

/**
 * Proxy trap table for read-only store proxies (createStore): per-property
 * tracking on get/has, no-op writes (writes go through the setStore path), and
 * key tracking via ownKeys/getOwnPropertyDescriptor.
 */
const proxyTraps = {
  get(target, property, receiver) {
    if (property === $RAW) return target;
    if (property === $PROXY) return receiver;
    if (property === $TRACK) {
      trackSelf(target);
      return receiver;
    }
    const nodes = getNodes(target, $NODE);
    const tracked = nodes[property];
    let value = tracked ? tracked() : target[property];
    if (property === $NODE || property === $HAS || property === "__proto__")
      return value;
    if (!tracked) {
      const desc = Object.getOwnPropertyDescriptor(target, property);
      if (
        getListener() &&
        (typeof value !== "function" || target.hasOwnProperty(property)) &&
        !(desc && desc.get)
      )
        value = getNode(nodes, property, value)();
    }
    return isWrappable(value) ? wrap(value) : value;
  },
  has(target, property) {
    if (
      property === $RAW ||
      property === $PROXY ||
      property === $TRACK ||
      property === $NODE ||
      property === $HAS ||
      property === "__proto__"
    )
      return true;
    getListener() && getNode(getNodes(target, $HAS), property)();
    return property in target;
  },
  set() {
    return true;
  },
  deleteProperty() {
    return true;
  },
  ownKeys: ownKeys,
  getOwnPropertyDescriptor: proxyDescriptor
};

/**
 * Write one property on a raw store node and notify its tracking signals
 * (value, $HAS presence, $SELF, and array length on resize). undefined deletes.
 * @param {Object} state - The raw store node to mutate.
 * @param {string|number} property - The property/index to set.
 * @param {*} value - The new value (undefined removes the property).
 * @param {boolean} deleting - True to force notify even on an equal value.
 * @returns {void}
 */
function setProperty(state, property, value, deleting = false) {
  if (!deleting && state[property] === value) return;
  const prev = state[property],
    len = state.length;
  if (value === undefined) {
    delete state[property];
    if (state[$HAS] && state[$HAS][property] && prev !== undefined)
      state[$HAS][property].$();
  } else {
    state[property] = value;
    if (state[$HAS] && state[$HAS][property] && prev === undefined)
      state[$HAS][property].$();
  }
  let nodes = getNodes(state, $NODE),
    node;
  if ((node = getNode(nodes, property, prev))) node.$(() => value);
  if (Array.isArray(state) && state.length !== len) {
    for (let i = state.length; i < len; i++) (node = nodes[i]) && node.$();
    (node = getNode(nodes, "length", len)) && node.$(state.length);
  }
  (node = nodes[$SELF]) && node.$();
}

/**
 * Shallow-merge the own keys of `value` into a store node via setProperty.
 * @param {Object} state - The raw store node to merge into.
 * @param {Object} value - The source object whose keys are applied.
 * @returns {void}
 */
function mergeStoreNode(state, value) {
  const keys = Object.keys(value);
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    setProperty(state, key, value[key]);
  }
}

/**
 * Apply a whole-array update to a store array: replace per index then truncate
 * length when `next` is an array, otherwise merge a plain-object update.
 * @param {Array} current - The raw store array to update in place.
 * @param {Array|Object|Function} next - The next array/object, or an updater
 *   thunk receiving the current array.
 * @returns {void}
 */
function updateArray(current, next) {
  if (typeof next === "function") next = next(current);
  next = unwrap(next);
  if (Array.isArray(next)) {
    if (current === next) return;
    let i = 0,
      len = next.length;
    for (; i < len; i++) {
      const value = next[i];
      if (current[i] !== value) setProperty(current, i, value);
    }
    setProperty(current, "length", len);
  } else mergeStoreNode(current, next);
}

/**
 * Recursively apply a path-based setter against a store node. Path parts may be
 * keys, key arrays, array index ranges {from,to,by}, or filter predicates
 * (item,i)=>bool; the final value may be a (prev,traversed)=>next updater.
 * @param {Object|Array} current - The current raw store node at this path step.
 * @param {Array} path - The remaining path segments, last entry the value/updater.
 * @param {Array} traversed - Keys traversed so far (passed to value updaters).
 * @returns {void}
 */
function updatePath(current, path, traversed = []) {
  let part,
    prev = current;
  if (path.length > 1) {
    part = path.shift();
    const partType = typeof part,
      isArray = Array.isArray(current);
    if (Array.isArray(part)) {
      for (let i = 0; i < part.length; i++) {
        updatePath(current, [part[i]].concat(path), traversed);
      }
      return;
    } else if (isArray && partType === "function") {
      for (let i = 0; i < current.length; i++) {
        if (part(current[i], i)) updatePath(current, [i].concat(path), traversed);
      }
      return;
    } else if (isArray && partType === "object") {
      const { from = 0, to = current.length - 1, by = 1 } = part;
      for (let i = from; i <= to; i += by) {
        updatePath(current, [i].concat(path), traversed);
      }
      return;
    } else if (path.length > 1) {
      updatePath(current[part], path, [part].concat(traversed));
      return;
    }
    prev = current[part];
    traversed = [part].concat(traversed);
  }
  let value = path[0];
  if (typeof value === "function") {
    value = value(prev, traversed);
    if (value === prev) return;
  }
  if (part === undefined && value == undefined) return;
  value = unwrap(value);
  if (
    part === undefined ||
    (isWrappable(prev) && isWrappable(value) && !Array.isArray(value))
  ) {
    mergeStoreNode(prev, value);
  } else setProperty(current, part, value);
}

/**
 * Create a reactive store: a tracking proxy over the initial value plus a
 * path-based setter that applies updates inside a batch.
 * @param {Object|Array} store - The initial store value (defaults to {}).
 * @param {Object} options - Reserved options (unused).
 * @returns {Array} A [store, setStore] pair: the tracking proxy and the setter.
 */
export function createStore(...[store, options]) {
  const unwrappedStore = unwrap(store || {});
  const isArray = Array.isArray(unwrappedStore);
  const wrappedStore = wrap(unwrappedStore);
  function setStore(...args) {
    batch(() => {
      isArray && args.length === 1
        ? updateArray(unwrappedStore, args[0])
        : updatePath(unwrappedStore, args);
    });
  }
  return [wrappedStore, setStore];
}

// ---- createMutable (not used by app today, kept for API completeness) -------
/**
 * getOwnPropertyDescriptor trap helper for mutable proxies: rewrite a data
 * descriptor into a get/set pair routed through the proxy.
 * @param {Object} target - The raw store object.
 * @param {string|symbol} property - The property key being described.
 * @returns {Object} The (possibly rewritten) property descriptor.
 */
function proxyDescriptorMut(target, property) {
  const desc = Reflect.getOwnPropertyDescriptor(target, property);
  if (
    !desc ||
    desc.get ||
    desc.set ||
    !desc.configurable ||
    property === $PROXY ||
    property === $NODE
  )
    return desc;
  delete desc.value;
  delete desc.writable;
  desc.get = () => target[$PROXY][property];
  desc.set = v => (target[$PROXY][property] = v);
  return desc;
}
/**
 * Proxy trap table for mutable store proxies (createMutable): tracking reads
 * like proxyTraps, but writes/deletes go through setProperty in a batch and
 * array-mutating methods are wrapped so their effects batch.
 */
const proxyTrapsMut = {
  get(target, property, receiver) {
    if (property === $RAW) return target;
    if (property === $PROXY) return receiver;
    if (property === $TRACK) {
      trackSelf(target);
      return receiver;
    }
    const nodes = getNodes(target, $NODE);
    const tracked = nodes[property];
    let value = tracked ? tracked() : target[property];
    if (property === $NODE || property === $HAS || property === "__proto__")
      return value;
    if (!tracked) {
      const desc = Object.getOwnPropertyDescriptor(target, property);
      const isFunction = typeof value === "function";
      if (
        getListener() &&
        (!isFunction || target.hasOwnProperty(property)) &&
        !(desc && desc.get)
      )
        value = getNode(nodes, property, value)();
      else if (value != null && isFunction && value === Array.prototype[property]) {
        return (...args) =>
          batch(() => Array.prototype[property].apply(receiver, args));
      }
    }
    return isWrappable(value) ? wrapMut(value) : value;
  },
  has(target, property) {
    if (
      property === $RAW ||
      property === $PROXY ||
      property === $TRACK ||
      property === $NODE ||
      property === $HAS ||
      property === "__proto__"
    )
      return true;
    getListener() && getNode(getNodes(target, $HAS), property)();
    return property in target;
  },
  set(target, property, value) {
    batch(() => setProperty(target, property, unwrap(value)));
    return true;
  },
  deleteProperty(target, property) {
    batch(() => setProperty(target, property, undefined, true));
    return true;
  },
  ownKeys: ownKeys,
  getOwnPropertyDescriptor: proxyDescriptorMut
};
/**
 * Wrap a raw object/array in a mutable tracking Proxy (cached via $PROXY),
 * rebinding own getters/setters to the proxy so they read/write tracked.
 * @param {Object} value - The raw object or array to wrap.
 * @returns {Proxy} The cached mutable tracking proxy.
 */
function wrapMut(value) {
  let proxy = value[$PROXY];
  if (!proxy) {
    Object.defineProperty(value, $PROXY, {
      value: proxy = new Proxy(value, proxyTrapsMut)
    });
    const keys = Object.keys(value),
      desc = Object.getOwnPropertyDescriptors(value);
    for (let i = 0, length = keys.length; i < length; i++) {
      const prop = keys[i];
      if (desc[prop].get) {
        const get = desc[prop].get.bind(proxy);
        Object.defineProperty(value, prop, { get, configurable: true });
      }
      if (desc[prop].set) {
        const og = desc[prop].set,
          set = v => batch(() => og.call(proxy, v));
        Object.defineProperty(value, prop, { set, configurable: true });
      }
    }
  }
  return proxy;
}
/**
 * Create a directly-mutable reactive store: a tracking proxy whose property
 * writes/deletes update reactively without a separate setter.
 * @param {Object|Array} state - The initial state (defaults to {}).
 * @returns {Proxy} The mutable tracking proxy.
 */
export function createMutable(state) {
  const unwrappedStore = unwrap(state || {});
  return wrapMut(unwrappedStore);
}
/**
 * Run a modifier against the raw (unwrapped) mutable state inside a single
 * batch, so multiple writes notify once.
 * @param {Proxy} state - A createMutable store proxy.
 * @param {Function} modifier - Callback receiving the raw state to mutate.
 * @returns {void}
 */
export function modifyMutable(state, modifier) {
  batch(() => modifier(unwrap(state)));
}

// ---- reconcile -------------------------------------------------------------
const $ROOT = Symbol("store-root");
/**
 * Recursively diff `target` into the existing store node at parent[property],
 * mutating in place (keyed list diff for arrays) so only changed paths notify.
 * @param {*} target - The desired next value for this slot.
 * @param {Object} parent - The store node holding the slot under `property`.
 * @param {string|number|symbol} property - The slot key within parent.
 * @param {boolean} merge - When true, merge instead of replacing by identity.
 * @param {string} key - Identity key used to match array items (e.g. "id").
 * @returns {void}
 */
function applyState(target, parent, property, merge, key) {
  const previous = parent[property];
  if (target === previous) return;
  const isArray = Array.isArray(target);
  if (
    property !== $ROOT &&
    (!isWrappable(target) ||
      !isWrappable(previous) ||
      isArray !== Array.isArray(previous) ||
      (key && target[key] !== previous[key]))
  ) {
    setProperty(parent, property, target);
    return;
  }
  if (isArray) {
    if (
      target.length &&
      previous.length &&
      (!merge || (key && target[0] && target[0][key] != null))
    ) {
      let i, j, start, end, newEnd, item, newIndicesNext, keyVal;
      for (
        start = 0, end = Math.min(previous.length, target.length);
        start < end &&
        (previous[start] === target[start] ||
          (key &&
            previous[start] &&
            target[start] &&
            previous[start][key] &&
            previous[start][key] === target[start][key]));
        start++
      ) {
        applyState(target[start], previous, start, merge, key);
      }
      const temp = new Array(target.length),
        newIndices = new Map();
      for (
        end = previous.length - 1, newEnd = target.length - 1;
        end >= start &&
        newEnd >= start &&
        (previous[end] === target[newEnd] ||
          (key &&
            previous[end] &&
            target[newEnd] &&
            previous[end][key] &&
            previous[end][key] === target[newEnd][key]));
        end--, newEnd--
      ) {
        temp[newEnd] = previous[end];
      }
      if (start > newEnd || start > end) {
        for (j = start; j <= newEnd; j++) setProperty(previous, j, target[j]);
        for (; j < target.length; j++) {
          setProperty(previous, j, temp[j]);
          applyState(target[j], previous, j, merge, key);
        }
        if (previous.length > target.length)
          setProperty(previous, "length", target.length);
        return;
      }
      newIndicesNext = new Array(newEnd + 1);
      for (j = newEnd; j >= start; j--) {
        item = target[j];
        keyVal = key && item ? item[key] : item;
        i = newIndices.get(keyVal);
        newIndicesNext[j] = i === undefined ? -1 : i;
        newIndices.set(keyVal, j);
      }
      for (i = start; i <= end; i++) {
        item = previous[i];
        keyVal = key && item ? item[key] : item;
        j = newIndices.get(keyVal);
        if (j !== undefined && j !== -1) {
          temp[j] = previous[i];
          j = newIndicesNext[j];
          newIndices.set(keyVal, j);
        }
      }
      for (j = start; j < target.length; j++) {
        if (j in temp) {
          setProperty(previous, j, temp[j]);
          applyState(target[j], previous, j, merge, key);
        } else setProperty(previous, j, target[j]);
      }
    } else {
      for (let i = 0, len = target.length; i < len; i++) {
        applyState(target[i], previous, i, merge, key);
      }
    }
    if (previous.length > target.length)
      setProperty(previous, "length", target.length);
    return;
  }
  const targetKeys = Object.keys(target);
  for (let i = 0, len = targetKeys.length; i < len; i++) {
    applyState(target[targetKeys[i]], previous, targetKeys[i], merge, key);
  }
  const previousKeys = Object.keys(previous);
  for (let i = 0, len = previousKeys.length; i < len; i++) {
    if (target[previousKeys[i]] === undefined)
      setProperty(previous, previousKeys[i], undefined);
  }
}
/**
 * Build a store setter that reconciles the current state toward `value` with a
 * keyed in-place diff (see applyState), so unchanged paths keep their identity.
 * @param {*} value - The desired next value.
 * @param {Object} options - Reconcile options. `merge` merges objects instead
 *   of replacing by identity; `key` is the array-item identity key (default "id").
 * @returns {Function} A setter usable with setStore that returns the next state.
 */
export function reconcile(value, options = {}) {
  const { merge, key = "id" } = options,
    v = unwrap(value);
  return state => {
    if (!isWrappable(state) || !isWrappable(v)) return v;
    const res = applyState(v, { [$ROOT]: state }, $ROOT, merge, key);
    return res === undefined ? state : res;
  };
}

// ---- produce ---------------------------------------------------------------
const producers = new WeakMap();
const setterTraps = {
  get(target, property) {
    if (property === $RAW) return target;
    const value = target[property];
    let proxy;
    return isWrappable(value)
      ? producers.get(value) ||
          (producers.set(value, (proxy = new Proxy(value, setterTraps))), proxy)
      : value;
  },
  set(target, property, value) {
    setProperty(target, property, unwrap(value));
    return true;
  },
  deleteProperty(target, property) {
    setProperty(target, property, undefined, true);
    return true;
  }
};
/**
 * Build a store setter that runs `fn` against a mutable draft proxy whose
 * writes/deletes flow straight through setProperty, then returns the state.
 * @param {Function} fn - Mutator receiving the draft proxy of the store node.
 * @returns {Function} A setter usable with setStore.
 */
export function produce(fn) {
  return state => {
    if (isWrappable(state)) {
      let proxy;
      if (!(proxy = producers.get(state))) {
        producers.set(state, (proxy = new Proxy(state, setterTraps)));
      }
      fn(proxy);
    }
    return state;
  };
}

export { $RAW };
