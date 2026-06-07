export function createScopedCache(createValue, options = {}) {
  const store = new Map();
  const now = options.now ?? Date.now;
  const dispose = (key, entry) => {
    options.dispose?.(entry.value, key);
  };
  const expired = entry => {
    if (options.ttlMs === undefined) return false;
    return now() - entry.touchedAt >= options.ttlMs;
  };
  const sweep = () => {
    if (options.ttlMs === undefined) return;
    for (const [key, entry] of store) {
      if (!expired(entry)) continue;
      store.delete(key);
      dispose(key, entry);
    }
  };
  const touch = (key, entry) => {
    entry.touchedAt = now();
    store.delete(key);
    store.set(key, entry);
  };
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
  const remove = key => {
    const entry = store.get(key);
    if (!entry) return;
    store.delete(key);
    dispose(key, entry);
    return entry.value;
  };
  const peek = key => {
    sweep();
    const entry = store.get(key);
    if (!entry) return;
    if (!expired(entry)) return entry.value;
    store.delete(key);
    dispose(key, entry);
  };
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