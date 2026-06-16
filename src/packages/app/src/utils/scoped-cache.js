/** @file Lazy keyed cache with optional TTL expiry and max-entry LRU eviction. */

/**
 * Create a keyed cache that lazily builds values on first access and keeps them
 * subject to optional time-to-live expiry and a maximum-entries LRU bound.
 * @param {Function} createValue - Factory invoked with the key to build a missing value.
 * @param {Object} options - Optional behavior config: ttlMs, maxEntries, now (clock), dispose (called with value and key when an entry is removed).
 * @returns {Object} Cache API with get(key), peek(key), delete(key), and clear().
 */
export function createScopedCache(createValue, options = {}) {
  const store = new Map();
  const now = options.now ?? Date.now;
  /**
   * Invoke the configured dispose callback for a removed entry.
   * @param {*} key - The cache key being removed.
   * @param {Object} entry - The stored entry holding value and touchedAt.
   * @returns {void}
   */
  const dispose = (key, entry) => {
    options.dispose?.(entry.value, key);
  };
  /**
   * Report whether an entry has outlived the configured TTL.
   * @param {Object} entry - The stored entry holding touchedAt.
   * @returns {boolean} True when ttlMs is set and the entry has expired.
   */
  const expired = entry => {
    if (options.ttlMs === undefined) return false;
    return now() - entry.touchedAt >= options.ttlMs;
  };
  /**
   * Remove every expired entry from the store, disposing each.
   * @returns {void}
   */
  const sweep = () => {
    if (options.ttlMs === undefined) return;
    for (const [key, entry] of store) {
      if (!expired(entry)) continue;
      store.delete(key);
      dispose(key, entry);
    }
  };
  /**
   * Mark an entry as freshly used and move it to the most-recent position.
   * @param {*} key - The cache key being touched.
   * @param {Object} entry - The stored entry to refresh and reinsert.
   * @returns {void}
   */
  const touch = (key, entry) => {
    entry.touchedAt = now();
    store.delete(key);
    store.set(key, entry);
  };
  /**
   * Evict least-recently-used entries until the store fits maxEntries.
   * @returns {void}
   */
  const prune = () => {
    if (options.maxEntries === undefined) return;
    while (store.size > options.maxEntries) {
      const key = store.keys().next().value;
      if (!key) return;
      const entry = store.get(key);
      store.delete(key);
      if (!entry) continue;
      dispose(key, entry);
    }
  };
  /**
   * Remove an entry by key and dispose it, returning its value if present.
   * @param {*} key - The cache key to remove.
   * @returns {*} The removed value, or undefined when no entry existed.
   */
  const remove = key => {
    const entry = store.get(key);
    if (!entry) return;
    store.delete(key);
    dispose(key, entry);
    return entry.value;
  };
  /**
   * Read a cached value without creating it or refreshing its recency.
   * @param {*} key - The cache key to look up.
   * @returns {*} The cached value, or undefined when absent or expired.
   */
  const peek = key => {
    sweep();
    const entry = store.get(key);
    if (!entry) return;
    if (!expired(entry)) return entry.value;
    store.delete(key);
    dispose(key, entry);
  };
  /**
   * Return the cached value for a key, lazily creating it when missing or expired.
   * @param {*} key - The cache key to read or populate.
   * @returns {*} The cached or freshly created value.
   */
  const get = key => {
    sweep();
    const entry = store.get(key);
    if (entry && !expired(entry)) {
      touch(key, entry);
      return entry.value;
    }
    if (entry) {
      store.delete(key);
      dispose(key, entry);
    }
    const created = {
      value: createValue(key),
      touchedAt: now()
    };
    store.set(key, created);
    prune();
    return created.value;
  };
  /**
   * Dispose and remove every entry, emptying the cache.
   * @returns {void}
   */
  const clear = () => {
    for (const [key, entry] of store) {
      dispose(key, entry);
    }
    store.clear();
  };
  return {
    get,
    peek,
    delete: remove,
    clear
  };
}