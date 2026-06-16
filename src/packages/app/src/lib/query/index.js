// First-party reimplementation of the subset of @tanstack/solid-query (and its
// @tanstack/query-core dependency) used by this app. Behavior is reproduced
// faithfully from solid-query 5.x's default integration: query-key hashing,
// stale-while-revalidate (staleTime/gcTime), in-flight fetch de-duplication,
// invalidate -> refetch, setQueryData cache writes, useQueries, and the
// mutation lifecycle (onMutate/onSuccess/onError/onSettled, isPending,
// variables, mutate/mutateAsync).
//
// Port/derivative of @tanstack/solid-query and @tanstack/query-core (MIT
// License, Copyright (c) 2021-present Tanner Linsley). See THIRD-PARTY-NOTICES.md.
//
// Omitted vs upstream (unused by this app, verified by usage audit): infinite
// queries, suspense/transitions/prefetch-in-render, devtools, persistence/
// hydration/SSR, placeholderData, select, structural sharing, notifyOnChange
// props, refetchInterval, query/mutation defaults registry, online/focus
// managers (the app disables refetchOnReconnect/Mount/WindowFocus).
//
// FLIP-SAFETY: reactivity is imported ONLY from "../reactivity.js" / "solid-js/store"
// using the names the self-written reactive core provides, so a later
// import-map flip can swap the runtime without touching this code. No compiled
// primitives from "../reactivity.js" are used.
/** @module lib/query First-party reimplementation of the @tanstack/solid-query subset the app uses (queries, mutations, cache, client, Solid bindings). */

import {
  batch,
  createComponent,
  createContext,
  createMemo,
  createRenderEffect,
  getOwner,
  onCleanup,
  runWithOwner,
  useContext,
} from "../reactivity.js";
import { createStore } from "../store.js";

// ---------------------------------------------------------------------------
// utils (faithful to query-core/utils.ts)
// ---------------------------------------------------------------------------

// Disabling sentinel. A query whose queryFn === skipToken is disabled and never
// fetches (see defaultQueryOptions / isStale / shouldFetch*).
export const skipToken = Symbol("skipToken");

/**
 * No-op function.
 *
 * @returns {void}
 */
function noop() {}

/**
 * Apply a functional updater (or return a non-function updater verbatim).
 *
 * @param {*} updater - A new value, or a function `(input) => value`.
 * @param {*} input - Current value passed to a function updater.
 * @returns {*} The updated value.
 */
function functionalUpdate(updater, input) {
  return typeof updater === "function" ? updater(input) : updater;
}

/**
 * Test whether a value is a valid (finite, non-negative) timeout in ms.
 *
 * @param {*} value - Candidate timeout value.
 * @returns {boolean} True when `value` is a non-negative finite number.
 */
function isValidTimeout(value) {
  return typeof value === "number" && value >= 0 && value !== Infinity;
}

/**
 * Compute the remaining time (ms) until data updated at `updatedAt` goes stale.
 *
 * @param {number} updatedAt - Timestamp (ms) when the data was last updated.
 * @param {number} staleTime - Stale duration in ms.
 * @returns {number} Milliseconds until stale (0 if already stale).
 */
function timeUntilStale(updatedAt, staleTime) {
  return Math.max(updatedAt + (staleTime || 0) - Date.now(), 0);
}

/**
 * Resolve a `staleTime` option that may be a static value or a function of the query.
 *
 * @param {*} staleTime - Static stale time or a function `(query) => number`.
 * @param {Object} query - Query instance passed to a function `staleTime`.
 * @returns {*} The resolved stale time.
 */
function resolveStaleTime(staleTime, query) {
  return typeof staleTime === "function" ? staleTime(query) : staleTime;
}

/**
 * Resolve an `enabled` option that may be a static value or a function of the query.
 *
 * @param {*} enabled - Static flag or a function `(query) => boolean`.
 * @param {Object} query - Query instance passed to a function `enabled`.
 * @returns {*} The resolved enabled value.
 */
function resolveEnabled(enabled, query) {
  return typeof enabled === "function" ? enabled(query) : enabled;
}

/**
 * Test whether the toString tag of a value is "[object Object]".
 *
 * @param {*} o - Candidate value.
 * @returns {boolean} True for plain-object-tagged values.
 */
function hasObjectPrototype(o) {
  return Object.prototype.toString.call(o) === "[object Object]";
}

/**
 * Strict plain-object check (rejects class instances, null prototypes, etc.).
 *
 * @param {*} o - Candidate value.
 * @returns {boolean} True when `o` is a plain object literal.
 */
function isPlainObject(o) {
  if (!hasObjectPrototype(o)) return false;
  const ctor = o.constructor;
  if (ctor === undefined) return true;
  const prot = ctor.prototype;
  if (!hasObjectPrototype(prot)) return false;
  if (!Object.prototype.hasOwnProperty.call(prot, "isPrototypeOf")) return false;
  if (Object.getPrototypeOf(o) !== Object.prototype) return false;
  return true;
}

// Deterministic, key-order-insensitive serialization of the query key. Sorting
// plain-object keys makes [{ a, b }] and [{ b, a }] hash identically, exactly
// like query-core. Arrays / primitives serialize positionally.
/**
 * Produce a deterministic, key-order-insensitive string hash of a query key.
 *
 * @param {*} queryKey - The query key (array / object / primitive).
 * @returns {string} A stable JSON serialization usable as a cache key.
 */
function hashKey(queryKey) {
  return JSON.stringify(queryKey, (_, val) =>
    isPlainObject(val)
      ? Object.keys(val)
          .sort()
          .reduce((result, key) => {
            result[key] = val[key];
            return result;
          }, {})
      : val,
  );
}

/**
 * Hash a query key using the options' custom hash function or the default.
 *
 * @param {*} queryKey - The query key to hash.
 * @param {Object} options - Query options possibly providing `queryKeyHashFn`.
 * @returns {string} The hashed query key.
 */
function hashQueryKeyByOptions(queryKey, options) {
  const hashFn = options?.queryKeyHashFn || hashKey;
  return hashFn(queryKey);
}

// Partial structural match: every key present in `b` must (recursively) match
// in `a`. Used by invalidate/refetch filters without `exact`.
/**
 * Recursive partial structural match: every key present in `b` must match in `a`.
 *
 * @param {*} a - The value being matched against (e.g. a query key).
 * @param {*} b - The partial filter value.
 * @returns {boolean} True when `a` partially matches `b`.
 */
function partialMatchKey(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a && b && typeof a === "object" && typeof b === "object") {
    return Object.keys(b).every((key) => partialMatchKey(a[key], b[key]));
  }
  return false;
}

/**
 * Test whether a query matches a set of filters (type/exact/fetchStatus/stale/
 * predicate/queryKey), mirroring query-core's filter semantics.
 *
 * @param {Object} filters - Filter criteria.
 * @param {Object} query - Query instance to test.
 * @returns {boolean} True when the query satisfies every filter.
 */
function matchQuery(filters, query) {
  const { type = "all", exact, fetchStatus, predicate, queryKey, stale } = filters;
  if (queryKey) {
    if (exact) {
      if (query.queryHash !== hashQueryKeyByOptions(queryKey, query.options)) {
        return false;
      }
    } else if (!partialMatchKey(query.queryKey, queryKey)) {
      return false;
    }
  }
  if (type !== "all") {
    const isActive = query.isActive();
    if (type === "active" && !isActive) return false;
    if (type === "inactive" && isActive) return false;
  }
  if (typeof stale === "boolean" && query.isStale() !== stale) return false;
  if (fetchStatus && fetchStatus !== query.state.fetchStatus) return false;
  if (predicate && !predicate(query)) return false;
  return true;
}

/**
 * Resolve the query function for a query, returning a rejecting stub when none
 * is configured or it is the disabling skipToken.
 *
 * @param {Object} options - Query options containing `queryFn`/`queryHash`.
 * @returns {Function} The query function (or a rejecting placeholder).
 */
function ensureQueryFn(options) {
  if (!options.queryFn || options.queryFn === skipToken) {
    return () => Promise.reject(new Error(`Missing queryFn: '${options.queryHash}'`));
  }
  return options.queryFn;
}

// ---------------------------------------------------------------------------
// retryer (faithful subset of query-core/retryer.ts)
//
// Observer-driven fetches default retry=3 with exponential backoff (matching
// upstream's non-server default), fetchQuery forces retry=false. The app's
// own queryFns already wrap work in core/util/retry, so this layer mostly
// passes a single attempt through. No network/focus pausing (the app disables
// refetchOnReconnect/WindowFocus and runs online-only).
// ---------------------------------------------------------------------------

/**
 * Error thrown when a retryer's in-flight fetch is cancelled. `revert` restores
 * the prior state; `silent` suppresses error dispatch.
 */
class CancelledError extends Error {
  /**
   * @param {Object} options - `{ revert, silent }` cancellation flags.
   */
  constructor(options) {
    super("CancelledError");
    this.revert = options?.revert;
    this.silent = options?.silent;
  }
}

/**
 * Default exponential backoff delay, capped at 30s.
 *
 * @param {number} failureCount - Number of failures so far.
 * @returns {number} Delay in ms before the next retry.
 */
function defaultRetryDelay(failureCount) {
  return Math.min(1000 * 2 ** failureCount, 30000);
}

/**
 * Promise that resolves after `timeout` ms.
 *
 * @param {number} timeout - Delay in ms.
 * @returns {Promise} A promise resolved after the delay.
 */
function sleep(timeout) {
  return new Promise((resolve) => setTimeout(resolve, timeout));
}

/**
 * Create a retryer that runs `config.fn`, retrying on failure per the retry/
 * retryDelay policy, and exposes promise/cancel/start controls.
 *
 * @param {Object} config - `{ fn, retry, retryDelay, onCancel, onFail }`.
 * @returns {Object} `{ promise, cancel, cancelRetry, start }` retryer handle.
 */
function createRetryer(config) {
  let isResolved = false;
  let isRetryCancelled = false;
  let failureCount = 0;
  let promiseResolve;
  let promiseReject;
  const promise = new Promise((resolve, reject) => {
    promiseResolve = resolve;
    promiseReject = reject;
  });

  const resolve = (value) => {
    if (!isResolved) {
      isResolved = true;
      promiseResolve(value);
    }
  };
  const reject = (value) => {
    if (!isResolved) {
      isResolved = true;
      promiseReject(value);
    }
  };
  const cancel = (cancelOptions) => {
    if (!isResolved) {
      const error = new CancelledError(cancelOptions);
      reject(error);
      config.onCancel?.(error);
    }
  };
  const cancelRetry = () => {
    isRetryCancelled = true;
  };

  const run = () => {
    if (isResolved) return;
    let promiseOrValue;
    try {
      promiseOrValue = config.fn();
    } catch (error) {
      promiseOrValue = Promise.reject(error);
    }
    Promise.resolve(promiseOrValue)
      .then(resolve)
      .catch((error) => {
        if (isResolved) return;
        const retry = config.retry ?? 3;
        const retryDelay = config.retryDelay ?? defaultRetryDelay;
        const delay =
          typeof retryDelay === "function" ? retryDelay(failureCount, error) : retryDelay;
        const shouldRetry =
          retry === true ||
          (typeof retry === "number" && failureCount < retry) ||
          (typeof retry === "function" && retry(failureCount, error));
        if (isRetryCancelled || !shouldRetry) {
          reject(error);
          return;
        }
        failureCount++;
        config.onFail?.(failureCount, error);
        sleep(delay).then(() => {
          if (isRetryCancelled) reject(error);
          else run();
        });
      });
  };

  return {
    promise,
    cancel,
    cancelRetry,
    start: () => {
      run();
      return promise;
    },
  };
}

// ---------------------------------------------------------------------------
// Subscribable
// ---------------------------------------------------------------------------

/**
 * Minimal observable base class: maintains a listener set and notifies subclass
 * hooks when the first/last listener subscribes/unsubscribes.
 */
class Subscribable {
  constructor() {
    this.listeners = new Set();
  }
  /**
   * Register a listener and return an unsubscribe function.
   *
   * @param {Function} listener - Callback invoked on notification.
   * @returns {Function} Unsubscribe function.
   */
  subscribe(listener) {
    this.listeners.add(listener);
    this.onSubscribe();
    return () => {
      this.listeners.delete(listener);
      this.onUnsubscribe();
    };
  }
  /**
   * @returns {boolean} True when there is at least one listener.
   */
  hasListeners() {
    return this.listeners.size > 0;
  }
  /**
   * Hook called after a listener subscribes (override in subclasses).
   *
   * @returns {void}
   */
  onSubscribe() {}
  /**
   * Hook called after a listener unsubscribes (override in subclasses).
   *
   * @returns {void}
   */
  onUnsubscribe() {}
}

// ---------------------------------------------------------------------------
// Query
//
// `state` is a plain object (faithful to query-core). Reactivity lives at the
// result layer: observers recompute their result snapshot on every dispatch and
// push it into the createStore-backed result in createBaseQuery/useQueries, so
// only consumers that read a changed field re-run.
// ---------------------------------------------------------------------------

/**
 * Build the initial (pending/idle) query state object.
 *
 * @returns {Object} A fresh default query state.
 */
function getDefaultQueryState() {
  return {
    data: undefined,
    dataUpdateCount: 0,
    dataUpdatedAt: 0,
    error: null,
    errorUpdateCount: 0,
    errorUpdatedAt: 0,
    fetchFailureCount: 0,
    fetchFailureReason: null,
    fetchMeta: null,
    isInvalidated: false,
    status: "pending",
    fetchStatus: "idle",
  };
}

/**
 * A single cached query: holds plain (non-reactive) state, in-flight fetch
 * de-duplication, garbage-collection scheduling, and its set of observers.
 * Reactivity is layered at the observer/result level, not on this state.
 */
class Query {
  /**
   * @param {Object} config - `{ cache, client, queryKey, queryHash, options, defaultOptions, state }`.
   */
  constructor(config) {
    this.observers = [];
    this.cache = config.cache;
    this.client = config.client;
    this.queryKey = config.queryKey;
    this.queryHash = config.queryHash;
    this.options = { ...config.defaultOptions, ...config.options };
    this.gcTime = Math.max(this.options.gcTime ?? 5 * 60 * 1000, 0);
    this.gcTimeout = undefined;
    this.retryer = undefined;
    this.promise = undefined; // in-flight fetch promise (for de-duplication)
    // Plain (non-reactive) state, faithful to query-core: reactivity is layered
    // at the result/observer level (createBaseQuery's createStore), never on the
    // query state itself. Keeping it plain avoids reconciling non-plain values
    // (Error instances, arbitrary queryFn data) through a Solid store.
    this.state = getDefaultQueryState();
    this.scheduleGc();
  }

  /**
   * Merge new options into the query and recompute its gc time.
   *
   * @param {Object} options - Options to merge in.
   * @returns {void}
   */
  setOptions(options) {
    this.options = { ...this.options, ...options };
    this.gcTime = Math.max(this.options.gcTime ?? this.gcTime, 0);
  }

  /**
   * (Re)schedule the garbage-collection timeout for this query.
   *
   * @returns {void}
   */
  scheduleGc() {
    this.clearGcTimeout();
    if (isValidTimeout(this.gcTime)) {
      this.gcTimeout = setTimeout(() => this.optionalRemove(), this.gcTime);
    }
  }

  clearGcTimeout() {
    if (this.gcTimeout !== undefined) {
      clearTimeout(this.gcTimeout);
      this.gcTimeout = undefined;
    }
  }

  optionalRemove() {
    if (!this.observers.length && this.state.fetchStatus === "idle") {
      this.cache.remove(this);
    }
  }

  /**
   * Attach an observer to this query (cancels pending gc).
   *
   * @param {Object} observer - The QueryObserver to attach.
   * @returns {void}
   */
  addObserver(observer) {
    if (!this.observers.includes(observer)) {
      this.observers.push(observer);
      this.clearGcTimeout();
      this.cache.notify({ type: "observerAdded", query: this, observer });
    }
  }

  /**
   * Detach an observer; reschedules gc when the last one leaves.
   *
   * @param {Object} observer - The QueryObserver to detach.
   * @returns {void}
   */
  removeObserver(observer) {
    if (this.observers.includes(observer)) {
      this.observers = this.observers.filter((x) => x !== observer);
      if (!this.observers.length) {
        if (this.retryer) this.retryer.cancelRetry();
        this.scheduleGc();
      }
      this.cache.notify({ type: "observerRemoved", query: this, observer });
    }
  }

  getObserversCount() {
    return this.observers.length;
  }

  isActive() {
    return this.observers.some(
      (observer) => resolveEnabled(observer.options.enabled, this) !== false,
    );
  }

  isDisabled() {
    if (this.getObserversCount() > 0) return !this.isActive();
    return this.options.queryFn === skipToken || !this.isFetched();
  }

  isFetched() {
    return this.state.dataUpdateCount + this.state.errorUpdateCount > 0;
  }

  isStale() {
    if (this.getObserversCount() > 0) {
      return this.observers.some((observer) => observer.getCurrentResult().isStale);
    }
    return this.state.data === undefined || this.state.isInvalidated;
  }

  /**
   * Whether the cached data is stale given a stale-time window.
   *
   * @param {number} staleTime - Stale duration in ms (default 0).
   * @returns {boolean} True when no data, invalidated, or past the stale window.
   */
  isStaleByTime(staleTime = 0) {
    if (this.state.data === undefined) return true;
    if (this.state.isInvalidated) return true;
    return !timeUntilStale(this.state.dataUpdatedAt, staleTime);
  }

  /**
   * Mark the query invalidated so the next fetch refetches.
   *
   * @returns {void}
   */
  invalidate() {
    if (!this.state.isInvalidated) this.#dispatch({ type: "invalidate" });
  }

  /**
   * Write new data into the query state.
   *
   * @param {*} newData - The data to store.
   * @param {Object} options - `{ updatedAt, manual }` write options.
   * @returns {*} The data that was written.
   */
  setData(newData, options) {
    this.#dispatch({
      data: newData,
      type: "success",
      dataUpdatedAt: options?.updatedAt,
      manual: options?.manual,
    });
    return newData;
  }

  setState(state) {
    this.#dispatch({ type: "setState", state });
  }

  // De-duplicated fetch: a second fetch while one is in flight reuses the
  // pending promise (stale-while-revalidate from the observers' perspective).
  /**
   * Fetch (or refetch) the query, de-duplicating concurrent in-flight requests.
   *
   * @param {Object} options - Query options to apply before fetching.
   * @param {Object} fetchOptions - `{ meta, cancelRefetch }` per-fetch options.
   * @returns {Promise} Promise resolving to the fetched data.
   */
  fetch(options, fetchOptions) {
    if (this.state.fetchStatus !== "idle") {
      if (this.state.data !== undefined && fetchOptions?.cancelRefetch) {
        this.cancel({ silent: true });
      } else if (this.promise) {
        return this.promise;
      }
    }

    if (options) this.setOptions(options);

    // Inherit a queryFn from an observer if the query itself has none (e.g.
    // ensureQueryData built the query before an observer attached). Mirrors
    // query-core: lets bootstrap's ensureQueryData seed an observer-less query.
    if (!this.options.queryFn || this.options.queryFn === skipToken) {
      const observer = this.observers.find(
        (x) => x.options.queryFn && x.options.queryFn !== skipToken,
      );
      if (observer) this.setOptions(observer.options);
    }

    const queryFn = ensureQueryFn(this.options);
    const fetchFn = () =>
      queryFn({ client: this.client, queryKey: this.queryKey, meta: this.options.meta });

    this.#revertState = this.state;
    if (this.state.fetchStatus === "idle") {
      this.#dispatch({ type: "fetch", meta: fetchOptions?.meta });
    }

    this.retryer = createRetryer({
      fn: fetchFn,
      onCancel: (error) => {
        if (error instanceof CancelledError && error.revert) {
          this.setState({ ...this.#revertState, fetchStatus: "idle" });
        }
      },
      onFail: (failureCount, error) => {
        this.#dispatch({ type: "failed", failureCount, error });
      },
      retry: options?.retry ?? this.options.retry,
      retryDelay: this.options.retryDelay,
    });

    this.promise = this.retryer
      .start()
      .then((data) => {
        if (data === undefined) {
          throw new Error(`${this.queryHash} data is undefined`);
        }
        this.setData(data);
        return data;
      })
      .catch((error) => {
        if (error instanceof CancelledError) {
          if (error.silent) return this.promise;
          if (error.revert) {
            if (this.state.data === undefined) throw error;
            return this.state.data;
          }
        }
        this.#dispatch({ type: "error", error });
        throw error;
      })
      .finally(() => {
        this.promise = undefined;
        this.retryer = undefined;
        this.scheduleGc();
      });

    return this.promise;
  }

  /**
   * Cancel the in-flight fetch (if any), resolving once it settles.
   *
   * @param {Object} options - `{ revert, silent }` cancellation flags.
   * @returns {Promise} Promise resolved when cancellation completes.
   */
  cancel(options) {
    const promise = this.promise;
    this.retryer?.cancel(options);
    return promise ? promise.then(noop).catch(noop) : Promise.resolve();
  }

  #revertState = undefined;

  /**
   * Reduce an action into the next query state and notify observers/cache in a batch.
   *
   * @param {Object} action - The state-transition action (typed by `action.type`).
   * @returns {void}
   */
  #dispatch(action) {
    const reduce = (state) => {
      switch (action.type) {
        case "failed":
          return {
            ...state,
            fetchFailureCount: action.failureCount,
            fetchFailureReason: action.error,
          };
        case "fetch":
          return {
            ...state,
            fetchFailureCount: 0,
            fetchFailureReason: null,
            fetchStatus: "fetching",
            fetchMeta: action.meta ?? null,
            ...(state.data === undefined && { error: null, status: "pending" }),
          };
        case "success":
          return {
            ...state,
            data: action.data,
            dataUpdatedAt: action.dataUpdatedAt ?? Date.now(),
            error: null,
            isInvalidated: false,
            status: "success",
            dataUpdateCount: state.dataUpdateCount + 1,
            ...(!action.manual && {
              fetchStatus: "idle",
              fetchFailureCount: 0,
              fetchFailureReason: null,
            }),
          };
        case "error":
          return {
            ...state,
            error: action.error,
            errorUpdateCount: state.errorUpdateCount + 1,
            errorUpdatedAt: Date.now(),
            fetchFailureCount: state.fetchFailureCount + 1,
            fetchFailureReason: action.error,
            fetchStatus: "idle",
            status: "error",
            isInvalidated: true,
          };
        case "invalidate":
          return { ...state, isInvalidated: true };
        case "setState":
          return { ...state, ...action.state };
        default:
          return state;
      }
    };
    this.state = reduce(this.state);
    // batch so all observer result-store writes (and any dependent store getters
    // they feed, e.g. global-sync's createStore) commit in one reactive tick.
    batch(() => {
      this.observers.forEach((observer) => observer.onQueryUpdate());
      this.cache.notify({ query: this, type: "updated", action });
    });
  }
}

// ---------------------------------------------------------------------------
// QueryCache
// ---------------------------------------------------------------------------

/**
 * Map of query-hash -> Query, with build/add/remove/find helpers and event
 * notifications. The single source of cached query instances for a QueryClient.
 */
class QueryCache extends Subscribable {
  constructor() {
    super();
    this.queries = new Map();
  }

  /**
   * Get an existing query for the options' hash or create and register a new one.
   *
   * @param {Object} client - The owning QueryClient.
   * @param {Object} options - Query options (must include queryKey).
   * @param {Object} state - Optional initial state for a newly built query.
   * @returns {Query} The existing or newly created query.
   */
  build(client, options, state) {
    const queryKey = options.queryKey;
    const queryHash = options.queryHash ?? hashQueryKeyByOptions(queryKey, options);
    let query = this.get(queryHash);
    if (!query) {
      query = new Query({
        cache: this,
        client,
        queryKey,
        queryHash,
        options: client.defaultQueryOptions(options),
        defaultOptions: undefined,
        state,
      });
      this.add(query);
    }
    return query;
  }

  add(query) {
    if (!this.queries.has(query.queryHash)) {
      this.queries.set(query.queryHash, query);
      this.notify({ type: "added", query });
    }
  }

  remove(query) {
    const queryInMap = this.queries.get(query.queryHash);
    if (queryInMap) {
      query.clearGcTimeout();
      if (queryInMap === query) this.queries.delete(query.queryHash);
      this.notify({ type: "removed", query });
    }
  }

  /**
   * Look up a query by its hash.
   *
   * @param {string} queryHash - The query hash key.
   * @returns {Query} The query, or undefined if absent.
   */
  get(queryHash) {
    return this.queries.get(queryHash);
  }

  /**
   * @returns {Array} All cached queries.
   */
  getAll() {
    return [...this.queries.values()];
  }

  /**
   * Find all queries matching the given filters.
   *
   * @param {Object} filters - Filter criteria (see matchQuery).
   * @returns {Array} Matching queries (all queries when no filters).
   */
  findAll(filters = {}) {
    const queries = this.getAll();
    return Object.keys(filters).length > 0
      ? queries.filter((query) => matchQuery(filters, query))
      : queries;
  }

  /**
   * Broadcast a cache event to all subscribers.
   *
   * @param {Object} event - The cache event payload.
   * @returns {void}
   */
  notify(event) {
    this.listeners.forEach((listener) => listener(event));
  }
}

// ---------------------------------------------------------------------------
// QueryObserver
//
// Holds the current query, computes a plain result snapshot via createResult,
// and notifies listeners. A useQuery/createQuery wrapper turns the result into
// a reactive object whose field reads track the query store.
// ---------------------------------------------------------------------------

/**
 * Whether an enabled query is stale given its staleTime option.
 *
 * @param {Object} query - The query instance.
 * @param {Object} options - Observer options (enabled/staleTime).
 * @returns {boolean} True when enabled and stale.
 */
function isStale(query, options) {
  return (
    resolveEnabled(options.enabled, query) !== false &&
    query.isStaleByTime(resolveStaleTime(options.staleTime, query))
  );
}

/**
 * Whether the query should load on mount (no data yet, not a non-retrying error).
 *
 * @param {Object} query - The query instance.
 * @param {Object} options - Observer options.
 * @returns {boolean} True when an initial mount load is warranted.
 */
function shouldLoadOnMount(query, options) {
  return (
    resolveEnabled(options.enabled, query) !== false &&
    query.state.data === undefined &&
    !(query.state.status === "error" && options.retryOnMount === false)
  );
}

/**
 * Resolve a refetch-on-<event> trigger (e.g. refetchOnMount) into whether to fetch.
 *
 * @param {Object} query - The query instance.
 * @param {Object} options - Observer options.
 * @param {*} field - The trigger value or a function of the query ("always"/boolean).
 * @returns {boolean} True when a fetch should be triggered.
 */
function shouldFetchOn(query, options, field) {
  if (resolveEnabled(options.enabled, query) !== false) {
    const value = typeof field === "function" ? field(query) : field;
    return value === "always" || (value !== false && isStale(query, options));
  }
  return false;
}

/**
 * Whether the observer should fetch when mounted.
 *
 * @param {Object} query - The query instance.
 * @param {Object} options - Observer options.
 * @returns {boolean} True when a mount-time fetch should occur.
 */
function shouldFetchOnMount(query, options) {
  return (
    shouldLoadOnMount(query, options) ||
    (query.state.data !== undefined && shouldFetchOn(query, options, options.refetchOnMount))
  );
}

/**
 * Whether an options/query change should trigger an optional refetch.
 *
 * @param {Object} query - The new query instance.
 * @param {Object} prevQuery - The previous query instance.
 * @param {Object} options - New observer options.
 * @param {Object} prevOptions - Previous observer options.
 * @returns {boolean} True when an optional fetch is warranted.
 */
function shouldFetchOptionally(query, prevQuery, options, prevOptions) {
  return (
    (query !== prevQuery || resolveEnabled(prevOptions.enabled, query) === false) &&
    isStale(query, options)
  );
}

/**
 * Shallow equality of two objects (same keys and reference-equal values).
 *
 * @param {Object} a - First object.
 * @param {Object} b - Second object.
 * @returns {boolean} True when shallowly equal.
 */
function shallowEqualObjects(a, b) {
  if (a === b) return true;
  if (!a || !b || Object.keys(a).length !== Object.keys(b).length) return false;
  for (const key in a) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}

/**
 * Observes a single query: tracks the current query, computes a plain result
 * snapshot via createResult, manages stale timeouts and fetches, and notifies
 * listeners (the reactive wrappers) when its result changes.
 */
class QueryObserver extends Subscribable {
  /**
   * @param {Object} client - The owning QueryClient.
   * @param {Object} options - Observer/query options.
   */
  constructor(client, options) {
    super();
    this.client = client;
    this.currentQuery = undefined;
    this.currentResult = undefined;
    this.currentResultState = undefined;
    this.staleTimeoutId = undefined;
    this.setOptions(options);
  }

  onSubscribe() {
    if (this.listeners.size === 1) {
      this.currentQuery.addObserver(this);
      if (shouldFetchOnMount(this.currentQuery, this.options)) {
        this.#executeFetch();
      } else {
        this.updateResult();
      }
      this.#updateStaleTimeout();
    }
  }

  onUnsubscribe() {
    if (!this.hasListeners()) this.destroy();
  }

  /**
   * Tear down the observer: clear listeners, stale timeout, and detach from its query.
   *
   * @returns {void}
   */
  destroy() {
    this.listeners = new Set();
    this.#clearStaleTimeout();
    this.currentQuery.removeObserver(this);
  }

  /**
   * Apply new options, re-point to the matching query, optionally refetch, and
   * refresh the result/stale timeout.
   *
   * @param {Object} options - New observer/query options.
   * @returns {void}
   */
  setOptions(options) {
    const prevOptions = this.options;
    const prevQuery = this.currentQuery;
    this.options = this.client.defaultQueryOptions(options);
    this.#updateQuery();
    this.currentQuery.setOptions(this.options);
    const mounted = this.hasListeners();
    if (
      mounted &&
      shouldFetchOptionally(this.currentQuery, prevQuery, this.options, prevOptions)
    ) {
      this.#executeFetch();
    }
    this.updateResult();
    if (
      mounted &&
      (this.currentQuery !== prevQuery ||
        resolveEnabled(this.options.enabled, this.currentQuery) !==
          resolveEnabled(prevOptions?.enabled, this.currentQuery) ||
        resolveStaleTime(this.options.staleTime, this.currentQuery) !==
          resolveStaleTime(prevOptions?.staleTime, this.currentQuery))
    ) {
      this.#updateStaleTimeout();
    }
  }

  /**
   * Compute an optimistic result for the given options (including any optimistic
   * fetching state), caching it as the current result.
   *
   * @param {Object} options - Observer/query options.
   * @returns {Object} The optimistic result snapshot.
   */
  getOptimisticResult(options) {
    const query = this.client.getQueryCache().build(this.client, options);
    const result = this.createResult(query, options);
    if (!shallowEqualObjects(this.currentResult, result)) {
      this.currentResult = result;
      this.currentResultState = this.currentQuery.state;
    }
    return result;
  }

  /**
   * @returns {Object} The latest computed result snapshot.
   */
  getCurrentResult() {
    return this.currentResult;
  }

  /**
   * @returns {Query} The currently observed query.
   */
  getCurrentQuery() {
    return this.currentQuery;
  }

  /**
   * Force a refetch of the observed query.
   *
   * @param {Object} options - Refetch options.
   * @returns {Promise} Promise resolving to the updated result.
   */
  refetch(options = {}) {
    return this.#fetch({ ...options });
  }

  #fetch(fetchOptions) {
    return this.#executeFetch({
      ...fetchOptions,
      cancelRefetch: fetchOptions.cancelRefetch ?? true,
    }).then(() => {
      this.updateResult();
      return this.currentResult;
    });
  }

  #executeFetch(fetchOptions) {
    this.#updateQuery();
    let promise = this.currentQuery.fetch(this.options, fetchOptions);
    if (!fetchOptions?.throwOnError) promise = promise.catch(noop);
    return promise;
  }

  #updateStaleTimeout() {
    this.#clearStaleTimeout();
    const staleTime = resolveStaleTime(this.options.staleTime, this.currentQuery);
    if (this.currentResult.isStale || !isValidTimeout(staleTime)) return;
    const time = timeUntilStale(this.currentResult.dataUpdatedAt, staleTime);
    this.staleTimeoutId = setTimeout(() => {
      if (!this.currentResult.isStale) this.updateResult();
    }, time + 1);
  }

  #clearStaleTimeout() {
    if (this.staleTimeoutId !== undefined) {
      clearTimeout(this.staleTimeoutId);
      this.staleTimeoutId = undefined;
    }
  }

  // Plain snapshot of the observed query's state -> result shape. Reads the
  // untracked query.state; the reactive wrapper re-runs createResult inside a
  // tracking scope so field reads subscribe.
  /**
   * Compute a plain result snapshot (status/data/error/isFetching/... plus a
   * bound refetch) from a query's current state.
   *
   * @param {Query} query - The query to snapshot.
   * @param {Object} options - Observer options influencing the result.
   * @returns {Object} The computed result object.
   */
  createResult(query, options) {
    const prevQuery = this.currentQuery;
    const queryInitialState = query !== prevQuery ? query.state : this.currentQueryInitialState;
    const state = query.state;
    let newState = { ...state };

    if (options.optimisticResults) {
      const mounted = this.hasListeners();
      const fetchOnMount = !mounted && shouldFetchOnMount(query, options);
      const fetchOptionally =
        mounted && shouldFetchOptionally(query, prevQuery, options, this.options);
      if (fetchOnMount || fetchOptionally) {
        newState = {
          ...newState,
          ...(state.data === undefined && { error: null, status: "pending" }),
          fetchStatus: "fetching",
        };
      }
    }

    const { error, errorUpdatedAt, status } = newState;
    const data = newState.data;
    const isFetching = newState.fetchStatus === "fetching";
    const isPending = status === "pending";
    const isError = status === "error";
    const isLoading = isPending && isFetching;
    const hasData = data !== undefined;

    return {
      status,
      fetchStatus: newState.fetchStatus,
      isPending,
      isSuccess: status === "success",
      isError,
      isInitialLoading: isLoading,
      isLoading,
      data,
      dataUpdatedAt: newState.dataUpdatedAt,
      error,
      errorUpdatedAt,
      failureCount: newState.fetchFailureCount,
      failureReason: newState.fetchFailureReason,
      errorUpdateCount: newState.errorUpdateCount,
      isFetched: query.isFetched(),
      isFetchedAfterMount:
        newState.dataUpdateCount > (queryInitialState?.dataUpdateCount ?? 0) ||
        newState.errorUpdateCount > (queryInitialState?.errorUpdateCount ?? 0),
      isFetching,
      isRefetching: isFetching && !isPending,
      isLoadingError: isError && !hasData,
      isPaused: newState.fetchStatus === "paused",
      isPlaceholderData: false,
      isRefetchError: isError && hasData,
      isStale: isStale(query, options),
      refetch: this.refetch.bind(this),
      isEnabled: resolveEnabled(options.enabled, query) !== false,
    };
  }

  /**
   * Recompute the result and notify listeners if it changed.
   *
   * @returns {void}
   */
  updateResult() {
    const prevResult = this.currentResult;
    const nextResult = this.createResult(this.currentQuery, this.options);
    this.currentResultState = this.currentQuery.state;
    if (shallowEqualObjects(nextResult, prevResult)) return;
    this.currentResult = nextResult;
    this.#notify();
  }

  #updateQuery() {
    const query = this.client.getQueryCache().build(this.client, this.options);
    if (query === this.currentQuery) return;
    const prevQuery = this.currentQuery;
    this.currentQuery = query;
    this.currentQueryInitialState = query.state;
    if (this.hasListeners()) {
      prevQuery?.removeObserver(this);
      query.addObserver(this);
    }
  }

  /**
   * React to a query-state update: refresh the result and stale timeout.
   *
   * @returns {void}
   */
  onQueryUpdate() {
    this.updateResult();
    if (this.hasListeners()) this.#updateStaleTimeout();
  }

  #notify() {
    this.listeners.forEach((listener) => listener(this.currentResult));
  }
}

// ---------------------------------------------------------------------------
// Mutation / MutationObserver
// ---------------------------------------------------------------------------

/**
 * Build the initial (idle) mutation state object.
 *
 * @returns {Object} A fresh default mutation state.
 */
function getDefaultMutationState() {
  return {
    context: undefined,
    data: undefined,
    error: null,
    failureCount: 0,
    failureReason: null,
    isPaused: false,
    status: "idle",
    variables: undefined,
    submittedAt: 0,
  };
}

/**
 * Drives a single mutation's lifecycle (onMutate/onSuccess/onError/onSettled),
 * tracks its state/result, and notifies listeners. Exposes bound mutate/reset.
 */
class MutationObserver extends Subscribable {
  /**
   * @param {Object} client - The owning QueryClient.
   * @param {Object} options - Mutation options.
   */
  constructor(client, options) {
    super();
    this.client = client;
    this.options = client.defaultMutationOptions(options);
    this.currentResult = undefined;
    this.mutateOptions = undefined;
    this.state = getDefaultMutationState();
    this.mutate = this.mutate.bind(this);
    this.reset = this.reset.bind(this);
    this.#updateResult();
  }

  /**
   * Apply new mutation options (defaulted via the client).
   *
   * @param {Object} options - Mutation options to apply.
   * @returns {void}
   */
  setOptions(options) {
    this.options = this.client.defaultMutationOptions(options);
  }

  /**
   * @returns {Object} The latest mutation result snapshot.
   */
  getCurrentResult() {
    return this.currentResult;
  }

  /**
   * Reset the mutation back to its idle state and notify listeners.
   *
   * @returns {void}
   */
  reset() {
    this.state = getDefaultMutationState();
    this.#updateResult();
    this.#notify();
  }

  /**
   * Run the mutation lifecycle for a set of variables and return the result data.
   *
   * @param {*} variables - Input passed to the mutation function and callbacks.
   * @param {Object} options - Per-call `{ onSuccess, onError, onSettled }` callbacks.
   * @returns {Promise} Promise resolving to the mutation data (rejects on error).
   */
  async mutate(variables, options) {
    this.mutateOptions = options;
    const mutationFnContext = {
      client: this.client,
      meta: this.options.meta,
      mutationKey: this.options.mutationKey,
    };

    this.#dispatch({ type: "pending", variables });

    let context;
    try {
      context = await this.options.onMutate?.(variables, mutationFnContext);
      if (context !== this.state.context) {
        this.#dispatch({ type: "pending", context, variables });
      }

      const retryer = createRetryer({
        fn: () => {
          if (!this.options.mutationFn) return Promise.reject(new Error("No mutationFn found"));
          return this.options.mutationFn(variables, mutationFnContext);
        },
        onFail: (failureCount, error) => {
          this.#dispatch({ type: "failed", failureCount, error });
        },
        retry: this.options.retry ?? 0,
        retryDelay: this.options.retryDelay,
      });

      const data = await retryer.start();

      await this.options.onSuccess?.(data, variables, this.state.context, mutationFnContext);
      await this.options.onSettled?.(
        data,
        null,
        variables,
        this.state.context,
        mutationFnContext,
      );
      this.#dispatch({ type: "success", data });
      this.#runCallback("success", { data });
      return data;
    } catch (error) {
      try {
        await this.options.onError?.(error, variables, this.state.context, mutationFnContext);
      } catch (e) {
        void Promise.reject(e);
      }
      try {
        await this.options.onSettled?.(
          undefined,
          error,
          variables,
          this.state.context,
          mutationFnContext,
        );
      } catch (e) {
        void Promise.reject(e);
      }
      this.#dispatch({ type: "error", error });
      this.#runCallback("error", { error });
      throw error;
    }
  }

  // mutateOptions are the per-call onSuccess/onError/onSettled (mutateAsync's
  // 2nd arg). The app does not pass them, but keep the hook for parity.
  /**
   * Invoke the per-call success/error callbacks (and onSettled) if provided.
   *
   * @param {string} type - "success" or "error".
   * @param {Object} action - `{ data }` or `{ error }` payload.
   * @returns {void}
   */
  #runCallback(type, action) {
    if (!this.mutateOptions) return;
    const variables = this.state.variables;
    const context = this.state.context;
    if (type === "success") {
      try {
        this.mutateOptions.onSuccess?.(action.data, variables, context);
      } catch (e) {
        void Promise.reject(e);
      }
      try {
        this.mutateOptions.onSettled?.(action.data, null, variables, context);
      } catch (e) {
        void Promise.reject(e);
      }
    } else if (type === "error") {
      try {
        this.mutateOptions.onError?.(action.error, variables, context);
      } catch (e) {
        void Promise.reject(e);
      }
      try {
        this.mutateOptions.onSettled?.(undefined, action.error, variables, context);
      } catch (e) {
        void Promise.reject(e);
      }
    }
  }

  /**
   * Reduce a mutation action into the next state, then refresh result and notify.
   *
   * @param {Object} action - The state-transition action (typed by `action.type`).
   * @returns {void}
   */
  #dispatch(action) {
    const reduce = (state) => {
      switch (action.type) {
        case "failed":
          return { ...state, failureCount: action.failureCount, failureReason: action.error };
        case "pending":
          return {
            ...state,
            context: action.context,
            data: undefined,
            failureCount: 0,
            failureReason: null,
            error: null,
            isPaused: false,
            status: "pending",
            variables: action.variables,
            submittedAt: Date.now(),
          };
        case "success":
          return {
            ...state,
            data: action.data,
            failureCount: 0,
            failureReason: null,
            error: null,
            status: "success",
            isPaused: false,
          };
        case "error":
          return {
            ...state,
            data: undefined,
            error: action.error,
            failureCount: state.failureCount + 1,
            failureReason: action.error,
            isPaused: false,
            status: "error",
          };
        default:
          return state;
      }
    };
    this.state = reduce(this.state);
    this.#updateResult();
    this.#notify();
  }

  #updateResult() {
    const state = this.state;
    this.currentResult = {
      ...state,
      isPending: state.status === "pending",
      isSuccess: state.status === "success",
      isError: state.status === "error",
      isIdle: state.status === "idle",
      mutate: this.mutate,
      reset: this.reset,
    };
  }

  #notify() {
    this.listeners.forEach((listener) => listener(this.currentResult));
  }
}

// ---------------------------------------------------------------------------
// QueryClient
// ---------------------------------------------------------------------------

/**
 * The query client: owns the QueryCache and default options, and exposes the
 * imperative cache API (get/set query data, fetch/prefetch/ensure, invalidate/
 * refetch) used by the app outside of the reactive hooks.
 */
export class QueryClient {
  #queryCache;
  #defaultOptions;
  #mountCount;

  /**
   * @param {Object} config - `{ queryCache, defaultOptions }` client config.
   */
  constructor(config = {}) {
    this.#queryCache = config.queryCache || new QueryCache();
    this.#defaultOptions = config.defaultOptions || {};
    this.#mountCount = 0;
  }

  // Called by QueryClientProvider's render effect. No global focus/online
  // subscriptions to wire up (the app disables those refetch triggers), so
  // mount/unmount only track the lifecycle.
  /**
   * Track a provider mount.
   *
   * @returns {void}
   */
  mount() {
    this.#mountCount++;
  }

  /**
   * Track a provider unmount.
   *
   * @returns {void}
   */
  unmount() {
    this.#mountCount--;
  }

  /**
   * @returns {QueryCache} The underlying query cache.
   */
  getQueryCache() {
    return this.#queryCache;
  }

  /**
   * @returns {Object} The configured default options.
   */
  getDefaultOptions() {
    return this.#defaultOptions;
  }

  /**
   * Merge defaults into query options and ensure a queryHash/enabled state.
   *
   * @param {Object} options - Raw query options.
   * @returns {Object} The defaulted options.
   */
  defaultQueryOptions(options) {
    if (options?.defaultedOpts) return options;
    const defaulted = {
      ...this.#defaultOptions.queries,
      ...options,
      defaultedOpts: true,
    };
    if (!defaulted.queryHash) {
      defaulted.queryHash = hashQueryKeyByOptions(defaulted.queryKey, defaulted);
    }
    if (defaulted.queryFn === skipToken) {
      defaulted.enabled = false;
    }
    return defaulted;
  }

  /**
   * Merge defaults into mutation options.
   *
   * @param {Object} options - Raw mutation options.
   * @returns {Object} The defaulted options.
   */
  defaultMutationOptions(options) {
    if (options?.defaultedOpts) return options;
    return { ...this.#defaultOptions.mutations, ...options, defaultedOpts: true };
  }

  /**
   * Read the cached data for a query key.
   *
   * @param {*} queryKey - The query key.
   * @returns {*} The cached data, or undefined.
   */
  getQueryData(queryKey) {
    const options = this.defaultQueryOptions({ queryKey });
    return this.#queryCache.get(options.queryHash)?.state.data;
  }

  /**
   * Read the cached state for a query key.
   *
   * @param {*} queryKey - The query key.
   * @returns {Object} The cached state, or undefined.
   */
  getQueryState(queryKey) {
    const options = this.defaultQueryOptions({ queryKey });
    return this.#queryCache.get(options.queryHash)?.state;
  }

  /**
   * Write data for a query key (building the query if needed).
   *
   * @param {*} queryKey - The query key.
   * @param {*} updater - New data or a function `(prev) => data`.
   * @param {Object} options - `{ updatedAt }` write options.
   * @returns {*} The written data, or undefined when the updater yields undefined.
   */
  setQueryData(queryKey, updater, options) {
    const defaultedOptions = this.defaultQueryOptions({ queryKey });
    const query = this.#queryCache.get(defaultedOptions.queryHash);
    const prevData = query?.state.data;
    const data = functionalUpdate(updater, prevData);
    if (data === undefined) return undefined;
    return this.#queryCache
      .build(this, defaultedOptions)
      .setData(data, { ...options, manual: true });
  }

  /**
   * Fetch a query (forcing retry=false), returning cached data when fresh.
   *
   * @param {Object} options - Query options.
   * @returns {Promise} Promise resolving to the (cached or freshly fetched) data.
   */
  fetchQuery(options) {
    const defaultedOptions = this.defaultQueryOptions(options);
    if (defaultedOptions.retry === undefined) defaultedOptions.retry = false;
    const query = this.#queryCache.build(this, defaultedOptions);
    return query.isStaleByTime(resolveStaleTime(defaultedOptions.staleTime, query))
      ? query.fetch(defaultedOptions)
      : Promise.resolve(query.state.data);
  }

  /**
   * Fetch a query for its side effect only (errors swallowed).
   *
   * @param {Object} options - Query options.
   * @returns {Promise} Promise resolved when the prefetch settles.
   */
  prefetchQuery(options) {
    return this.fetchQuery(options).then(noop).catch(noop);
  }

  /**
   * Return cached data immediately, fetching it first only if absent.
   *
   * @param {Object} options - Query options (may include revalidateIfStale).
   * @returns {Promise} Promise resolving to the query data.
   */
  ensureQueryData(options) {
    const defaultedOptions = this.defaultQueryOptions(options);
    const query = this.#queryCache.build(this, defaultedOptions);
    const cachedData = query.state.data;
    if (cachedData === undefined) return this.fetchQuery(options);
    if (
      options.revalidateIfStale &&
      query.isStaleByTime(resolveStaleTime(defaultedOptions.staleTime, query))
    ) {
      void this.prefetchQuery(defaultedOptions);
    }
    return Promise.resolve(cachedData);
  }

  /**
   * Invalidate matching queries and refetch them (per refetchType).
   *
   * @param {Object} filters - Query filters (plus optional refetchType).
   * @param {Object} options - Refetch options.
   * @returns {Promise} Promise resolved when refetching completes.
   */
  invalidateQueries(filters = {}, options = {}) {
    this.#queryCache.findAll(filters).forEach((query) => query.invalidate());
    if (filters?.refetchType === "none") return Promise.resolve();
    return this.refetchQueries(
      { ...filters, type: filters?.refetchType ?? filters?.type ?? "active" },
      options,
    );
  }

  /**
   * Refetch all enabled queries matching the filters.
   *
   * @param {Object} filters - Query filters.
   * @param {Object} options - Refetch options.
   * @returns {Promise} Promise resolved when all refetches complete.
   */
  refetchQueries(filters = {}, options = {}) {
    const fetchOptions = { ...options, cancelRefetch: options.cancelRefetch ?? true };
    const promises = this.#queryCache
      .findAll(filters)
      .filter((query) => !query.isDisabled())
      .map((query) => {
        let promise = query.fetch(undefined, fetchOptions);
        if (!fetchOptions.throwOnError) promise = promise.catch(noop);
        return promise;
      });
    return Promise.all(promises).then(noop);
  }

  /**
   * Count the queries currently fetching that match the filters.
   *
   * @param {Object} filters - Query filters.
   * @returns {number} The number of in-flight matching queries.
   */
  isFetching(filters) {
    return this.#queryCache.findAll({ ...filters, fetchStatus: "fetching" }).length;
  }

  /**
   * Remove every query from the cache.
   *
   * @returns {void}
   */
  clear() {
    this.#queryCache.getAll().forEach((query) => this.#queryCache.remove(query));
  }
}

// ---------------------------------------------------------------------------
// Solid bindings
// ---------------------------------------------------------------------------

const QueryClientContext = createContext(undefined);

/**
 * Resolve the QueryClient: the explicit argument, else the context-provided one.
 *
 * @param {Object} queryClient - An explicit client, or undefined to use context.
 * @returns {QueryClient} The resolved client.
 */
export function useQueryClient(queryClient) {
  if (queryClient) return queryClient;
  const client = useContext(QueryClientContext);
  if (!client) {
    throw new Error("No QueryClient set, use QueryClientProvider to set one");
  }
  return client;
}

// The optional per-hook queryClient arg is, in solid-query, an accessor
// (`() => client`). Resolve it to a client (or undefined to fall back to
// context). The app never passes it, but support it faithfully.
/**
 * Resolve an optional per-hook client argument (which may be an accessor) to a
 * concrete client, falling back to context.
 *
 * @param {*} queryClient - A client, an accessor returning a client, or undefined.
 * @returns {QueryClient} The resolved client.
 */
function resolveOptionalClient(queryClient) {
  return useQueryClient(typeof queryClient === "function" ? queryClient() : queryClient);
}

/**
 * Provider that puts a QueryClient on context and tracks its mount lifecycle.
 *
 * @param {Object} props - Component props.
 * @param {QueryClient} props.client - The client to provide.
 * @param {*} props.children - Subtree that can read the client.
 * @returns {*} The provider component output.
 */
export function QueryClientProvider(props) {
  createRenderEffect(() => {
    props.client.mount();
    onCleanup(() => props.client.unmount());
  });
  return createComponent(QueryClientContext.Provider, {
    value: props.client,
    get children() {
      return props.children;
    },
  });
}

// Identity/typing helper. Upstream's queryOptions() just returns the object;
// callers spread it into useQuery/fetchQuery/ensureQueryData.
/**
 * Identity/typing helper: returns the options object unchanged.
 *
 * @param {Object} options - Query options.
 * @returns {Object} The same options object.
 */
export function queryOptions(options) {
  return options;
}

// Build a reactive result object whose property reads track the underlying
// query store. We back it with a Solid store synced from observer
// notifications, plus a manual subscription that re-runs setOptions when the
// options accessor changes, so the consuming component re-renders on cache
// updates (faithful to solid-query's createStore-backed result).
/**
 * Create a reactive query result whose per-field reads track a store synced from
 * a QueryObserver, re-applying options when the accessor changes.
 *
 * @param {Function} optionsAccessor - Accessor returning the query options.
 * @param {Object} queryClient - Explicit client, or undefined to use context.
 * @returns {Object} A reactive proxy result (status/data/error/refetch/...).
 */
function createBaseQuery(optionsAccessor, queryClient) {
  const owner = getOwner();
  const client = useQueryClient(queryClient);

  const defaultedOptions = () => {
    const opts = client.defaultQueryOptions(optionsAccessor());
    opts.optimisticResults = "optimistic";
    return opts;
  };

  const observer = new QueryObserver(client, defaultedOptions());

  const [state, setState] = createStore(observer.getOptimisticResult(defaultedOptions()));

  const sync = (result) => {
    // Plain top-level store write (faithful to solid-query's default, which does
    // NOT reconcile the base result — only optionally `data`). The result shape
    // is fixed, so a shallow per-field set updates exactly the changed fields;
    // `error` (an Error instance) and `data` are stored by reference as leaves,
    // avoiding reconciling non-plain values.
    setState(result);
  };

  const unsubscribe = observer.subscribe((result) => {
    runWithOwner(owner, () => sync(result));
  });
  onCleanup(unsubscribe);

  // Re-run when the options accessor (a memo/derived) changes: update observer
  // options (which may trigger an optional refetch) and resync the result.
  createRenderEffect(() => {
    const opts = defaultedOptions();
    observer.setOptions(opts);
    sync(observer.getOptimisticResult(opts));
  });

  // Result proxy: every field read tracks the backing store, so consumer
  // effects/memos re-run when that field changes.
  return new Proxy(
    {},
    {
      get(qTarget, prop) {
        if (prop === "refetch") return observer.refetch.bind(observer);
        return state[prop];
      },
      has(qTarget, prop) {
        return prop in state || prop === "refetch";
      },
    },
  );
}

/**
 * Reactive single-query hook: returns a result object tracking the query store.
 *
 * @param {Function} optionsAccessor - Accessor returning the query options.
 * @param {*} queryClient - Optional client or accessor; defaults to context.
 * @returns {Object} The reactive query result.
 */
export function useQuery(optionsAccessor, queryClient) {
  return createBaseQuery(() => optionsAccessor(), resolveOptionalClient(queryClient));
}

export const createQuery = useQuery;

/**
 * Reactive multi-query hook: returns an array of per-slot reactive results.
 *
 * @param {Function} queriesOptionsAccessor - Accessor returning `{ queries: [...] }`.
 * @param {*} queryClient - Optional client or accessor; defaults to context.
 * @returns {Array} Array of reactive query results, one per query slot.
 */
export function useQueries(queriesOptionsAccessor, queryClient) {
  const owner = getOwner();
  const client = resolveOptionalClient(queryClient);

  const defaultedQueries = createMemo(() =>
    queriesOptionsAccessor().queries.map((options) => {
      const opts = client.defaultQueryOptions(options);
      opts.optimisticResults = "optimistic";
      return opts;
    }),
  );

  // One observer per query slot. Slots are matched positionally (the app's
  // useQueries lists are fixed-length), so we keep observers per index and
  // re-point them when options change.
  let observers = defaultedQueries().map((opts) => new QueryObserver(client, opts));

  const [state, setState] = createStore(
    observers.map((observer, i) => observer.getOptimisticResult(defaultedQueries()[i])),
  );

  const subscriptions = [];
  const subscribeAll = () => {
    while (subscriptions.length) subscriptions.pop()?.();
    observers.forEach((observer, index) => {
      const unsub = observer.subscribe((result) => {
        // Plain per-slot store write (see createBaseQuery's sync rationale).
        runWithOwner(owner, () => setState(index, result));
      });
      subscriptions.push(unsub);
    });
  };
  subscribeAll();
  onCleanup(() => {
    while (subscriptions.length) subscriptions.pop()?.();
  });

  // React to query-list / options changes. All app call sites pass a
  // fixed-length list (the result is positionally destructured), so the count
  // never changes; the length branch only guards against a mismatch by
  // rebuilding observers + subscriptions.
  createRenderEffect(() => {
    const defs = defaultedQueries();
    if (defs.length !== observers.length) {
      observers.forEach((o) => o.destroy());
      observers = defs.map((opts) => new QueryObserver(client, opts));
      setState(observers.map((o, i) => o.getOptimisticResult(defs[i])));
      subscribeAll();
      return;
    }
    observers.forEach((observer, index) => {
      observer.setOptions(defs[index]);
      setState(index, observer.getOptimisticResult(defs[index]));
    });
  });

  // Array of per-slot reactive proxies; reads of state[i].field track.
  return observers.map(
    (observer, index) =>
      new Proxy(
        {},
        {
          get(qTarget, prop) {
            if (prop === "refetch") return observer.refetch.bind(observer);
            return state[index]?.[prop];
          },
          has(qTarget, prop) {
            return (state[index] && prop in state[index]) || prop === "refetch";
          },
        },
      ),
  );
}

export const createQueries = useQueries;

/**
 * Reactive mutation hook: returns a reactive result with `mutate`/`mutateAsync`.
 *
 * @param {Function} optionsAccessor - Accessor returning the mutation options.
 * @param {*} queryClient - Optional client or accessor; defaults to context.
 * @returns {Object} The reactive mutation state/result.
 */
export function useMutation(optionsAccessor, queryClient) {
  const owner = getOwner();
  const client = resolveOptionalClient(queryClient);
  const observer = new MutationObserver(client, optionsAccessor());

  const mutate = (variables, mutateOptions) => {
    observer.mutate(variables, mutateOptions).catch(noop);
  };

  const [state, setState] = createStore({
    ...observer.getCurrentResult(),
    mutate,
    mutateAsync: observer.mutate,
  });

  // Keep options live so onSuccess/onError closures see fresh deps.
  createRenderEffect(() => {
    observer.setOptions(optionsAccessor());
  });

  const unsubscribe = observer.subscribe((result) => {
    // Plain top-level write: `variables` (arbitrary mutation input) and `error`
    // are stored by reference as leaves, never reconciled.
    runWithOwner(owner, () =>
      setState({ ...result, mutate, mutateAsync: observer.mutate }),
    );
  });
  onCleanup(unsubscribe);

  return state;
}

export const createMutation = useMutation;
