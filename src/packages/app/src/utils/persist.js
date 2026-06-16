import { usePlatform } from "@/context/platform.js";
import { makePersisted } from "../lib/primitives/storage.js";
import { checksum } from "core/util/encode";
import { createResource } from "../lib/reactivity.js";
import { pathKey } from "@/utils/path-key.js";

/**
 * @file Persistence layer for app state. Provides global/workspace/session
 * storage targets, legacy-key migration, an in-memory LRU cache, quota-aware
 * localStorage writes with eviction, and `persisted()` which backs a reactive
 * store with the right storage adapter (desktop async API vs. browser
 * localStorage).
 */

const LEGACY_STORAGE = "default.dat";
const GLOBAL_STORAGE = "closedcode.global.dat";
const LOCAL_PREFIX = "closedcode.";
const fallback = new Map();
const CACHE_MAX_ENTRIES = 500;
const CACHE_MAX_BYTES = 8 * 1024 * 1024;
const cache = new Map();
const cacheTotal = {
  bytes: 0
};
/**
 * Remove a cache entry and decrement the tracked byte total.
 * @param {string} key - Cache key to delete.
 * @returns {void}
 */
function cacheDelete(key) {
  const entry = cache.get(key);
  if (!entry) return;
  cacheTotal.bytes -= entry.bytes;
  cache.delete(key);
}
/**
 * Evict the oldest entries until the cache is within the entry-count and
 * byte-size limits (LRU order is maintained by re-insertion on access).
 * @returns {void}
 */
function cachePrune() {
  for (;;) {
    if (cache.size <= CACHE_MAX_ENTRIES && cacheTotal.bytes <= CACHE_MAX_BYTES) return;
    const oldest = cache.keys().next().value;
    if (!oldest) return;
    cacheDelete(oldest);
  }
}
/**
 * Insert or refresh a cache entry (most-recently-used), then prune to limits.
 * Values larger than the byte cap are dropped instead of cached.
 * @param {string} key - Cache key.
 * @param {string} value - String value to cache.
 * @returns {void}
 */
function cacheSet(key, value) {
  const bytes = value.length * 2;
  if (bytes > CACHE_MAX_BYTES) {
    cacheDelete(key);
    return;
  }
  const entry = cache.get(key);
  if (entry) cacheTotal.bytes -= entry.bytes;
  cache.delete(key);
  cache.set(key, {
    value,
    bytes
  });
  cacheTotal.bytes += bytes;
  cachePrune();
}
/**
 * Read a cached value, marking it most-recently-used on hit.
 * @param {string} key - Cache key.
 * @returns {string} The cached value, or undefined on miss.
 */
function cacheGet(key) {
  const entry = cache.get(key);
  if (!entry) return;
  cache.delete(key);
  cache.set(key, entry);
  return entry.value;
}

/**
 * Whether a storage scope has fallen back to the in-memory cache (localStorage
 * unavailable/failed for that scope).
 * @param {string} scope - Storage scope identifier.
 * @returns {boolean} True when the scope is in fallback (cache-only) mode.
 */
function fallbackDisabled(scope) {
  return fallback.get(scope) === true;
}

/**
 * Mark a storage scope as fallen back to the in-memory cache.
 * @param {string} scope - Storage scope identifier.
 * @returns {void}
 */
function fallbackSet(scope) {
  fallback.set(scope, true);
}

/**
 * Classify an error as a storage quota-exceeded condition across browser
 * variants (DOMException names/codes plus message heuristics).
 * @param {*} error - The thrown error.
 * @returns {boolean} True when the error indicates the storage quota was exceeded.
 */
function quota(error) {
  if (error instanceof DOMException) {
    if (error.name === "QuotaExceededError") return true;
    if (error.name === "NS_ERROR_DOM_QUOTA_REACHED") return true;
    if (error.name === "QUOTA_EXCEEDED_ERR") return true;
    if (error.code === 22 || error.code === 1014) return true;
    return false;
  }
  if (!error || typeof error !== "object") return false;
  const name = error.name;
  if (name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED") return true;
  if (name && /quota/i.test(name)) return true;
  const code = error.code;
  if (code === 22 || code === 1014) return true;
  const message = error.message;
  if (typeof message !== "string") return false;
  if (/quota/i.test(message)) return true;
  return false;
}
/**
 * Free room for a write by removing other prefixed entries (largest first)
 * until `keep` can be stored.
 * @param {Object} storage - A Storage-like object (e.g. localStorage).
 * @param {string} keep - The key being written that must be preserved.
 * @param {string} value - The value to store under `keep`.
 * @returns {boolean} True if the value was successfully stored after eviction.
 */
function evict(storage, keep, value) {
  const total = storage.length;
  const indexes = Array.from({
    length: total
  }, (_, index) => index);
  const items = [];
  for (const index of indexes) {
    const name = storage.key(index);
    if (!name) continue;
    if (!name.startsWith(LOCAL_PREFIX)) continue;
    if (name === keep) continue;
    const stored = storage.getItem(name);
    items.push({
      key: name,
      size: stored?.length ?? 0
    });
  }
  items.sort((a, b) => b.size - a.size);
  for (const item of items) {
    storage.removeItem(item.key);
    cacheDelete(item.key);
    try {
      storage.setItem(keep, value);
      cacheSet(keep, value);
      return true;
    } catch (error) {
      if (!quota(error)) throw error;
    }
  }
  return false;
}
/**
 * Quota-aware write: try a direct set, then a remove-and-retry, then eviction.
 * Re-throws non-quota errors. Keeps the in-memory cache in sync.
 * @param {Object} storage - A Storage-like object (e.g. localStorage).
 * @param {string} key - Storage key.
 * @param {string} value - Value to store.
 * @returns {boolean} True when the write ultimately succeeded.
 */
function write(storage, key, value) {
  try {
    storage.setItem(key, value);
    cacheSet(key, value);
    return true;
  } catch (error) {
    if (!quota(error)) throw error;
  }
  try {
    storage.removeItem(key);
    cacheDelete(key);
    storage.setItem(key, value);
    cacheSet(key, value);
    return true;
  } catch (error) {
    if (!quota(error)) throw error;
  }
  const ok = evict(storage, key, value);
  return ok;
}
/**
 * Deep-clone a JSON-serializable value via round-trip serialization.
 * @param {*} value - JSON-serializable value.
 * @returns {*} A structurally independent clone.
 */
function snapshot(value) {
  return JSON.parse(JSON.stringify(value));
}

/**
 * Test whether a value is a plain (non-array) object.
 * @param {*} value - Value to test.
 * @returns {boolean} True for non-null, non-array objects.
 */
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Recursively merge a stored value onto defaults: arrays replace wholesale,
 * records merge key-by-key (recursing on known keys, passing through unknown
 * ones), and scalars/null override. Missing (undefined) values keep defaults.
 * @param {*} defaults - Default shape/value.
 * @param {*} value - Stored value to merge in.
 * @returns {*} The merged value.
 */
function merge(defaults, value) {
  if (value === undefined) return defaults;
  if (value === null) return value;
  if (Array.isArray(defaults)) {
    if (Array.isArray(value)) return value;
    return defaults;
  }
  if (isRecord(defaults)) {
    if (!isRecord(value)) return defaults;
    const result = {
      ...defaults
    };
    for (const key of Object.keys(value)) {
      if (key in defaults) {
        result[key] = merge(defaults[key], value[key]);
      } else {
        result[key] = value[key];
      }
    }
    return result;
  }
  return value;
}
/**
 * Safe JSON parse that returns undefined instead of throwing on invalid input.
 * @param {string} value - Raw JSON string.
 * @returns {*} The parsed value, or undefined when parsing fails.
 */
function parse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

/**
 * Parse, optionally migrate, and merge a raw stored string against defaults,
 * returning a canonical serialized form.
 * @param {*} defaults - Default value to merge onto.
 * @param {string} raw - Raw stored JSON string.
 * @param {Function} migrate - Optional migration function applied to the parsed value.
 * @returns {string} Canonical JSON string, or undefined when `raw` could not be parsed.
 */
function normalize(defaults, raw, migrate) {
  const parsed = parse(raw);
  if (parsed === undefined) return;
  const migrated = migrate ? migrate(parsed) : parsed;
  const merged = merge(defaults, migrated);
  return JSON.stringify(merged);
}
/**
 * Read and normalize the current value (sync storage), rewriting it back when
 * normalization changed it and clearing corrupt entries.
 * @param {Object} input - `{ storage, key, defaults, migrate }`.
 * @returns {string} Normalized JSON string, undefined when absent, or null when the entry was corrupt and removed.
 */
function readCurrent(input) {
  const raw = input.storage.getItem(input.key);
  if (raw === null) return;
  const next = normalize(input.defaults, raw, input.migrate);
  if (next === undefined) {
    input.storage.removeItem(input.key);
    return null;
  }
  if (raw !== next) input.storage.setItem(input.key, next);
  return next;
}
/**
 * Migrate a value from legacy stores/keys (sync) into the current storage:
 * scans alternate workspace stores, then the legacy store's old key names,
 * moving the first match to the current key and removing the source.
 * @param {Object} input - `{ current, legacyStore, stores, keys, key, defaults, migrate }`.
 * @returns {string} The migrated JSON string, or null when nothing to migrate.
 */
function migrateLegacy(input) {
  for (const store of input.stores) {
    const raw = store.getItem(input.key);
    if (raw === null) continue;
    const next = normalize(input.defaults, raw, input.migrate);
    if (next === undefined) {
      store.removeItem(input.key);
      continue;
    }
    input.current.setItem(input.key, next);
    store.removeItem(input.key);
    return next;
  }
  if (!input.legacyStore) return null;
  for (const key of input.keys) {
    const raw = input.legacyStore.getItem(key);
    if (raw === null) continue;
    const next = normalize(input.defaults, raw, input.migrate);
    if (next === undefined) {
      input.legacyStore.removeItem(key);
      continue;
    }
    input.current.setItem(input.key, next);
    input.legacyStore.removeItem(key);
    return next;
  }
  return null;
}
/**
 * Async counterpart of {@link readCurrent} for the desktop async storage API.
 * @param {Object} input - `{ storage, key, defaults, migrate }`.
 * @returns {Promise<string>} Resolves to the normalized JSON string, undefined when absent, or null when corrupt and removed.
 */
async function readCurrentAsync(input) {
  const raw = await input.storage.getItem(input.key);
  if (raw === null) return;
  const next = normalize(input.defaults, raw, input.migrate);
  if (next === undefined) {
    await input.storage.removeItem(input.key).catch(() => undefined);
    return null;
  }
  if (raw !== next) await input.storage.setItem(input.key, next);
  return next;
}
/**
 * Best-effort async remove that swallows errors.
 * @param {Object} storage - Async storage-like object.
 * @param {string} key - Key to remove.
 * @returns {Promise<void>}
 */
async function removeAsync(storage, key) {
  try {
    await storage.removeItem(key);
  } catch {}
}

/**
 * Async counterpart of {@link migrateLegacy} for the desktop async storage API.
 * @param {Object} input - `{ current, legacyStore, stores, keys, key, defaults, migrate }`.
 * @returns {Promise<string>} Resolves to the migrated JSON string, or null when nothing to migrate.
 */
async function migrateLegacyAsync(input) {
  for (const store of input.stores) {
    const raw = await store.getItem(input.key);
    if (raw === null) continue;
    const next = normalize(input.defaults, raw, input.migrate);
    if (next === undefined) {
      await removeAsync(store, input.key);
      continue;
    }
    await input.current.setItem(input.key, next);
    await store.removeItem(input.key);
    return next;
  }
  if (!input.legacyStore) return null;
  for (const key of input.keys) {
    const raw = await input.legacyStore.getItem(key);
    if (raw === null) continue;
    const next = normalize(input.defaults, raw, input.migrate);
    if (next === undefined) {
      await removeAsync(input.legacyStore, key);
      continue;
    }
    await input.current.setItem(input.key, next);
    await input.legacyStore.removeItem(key);
    return next;
  }
  return null;
}
/**
 * Build the storage file name for a workspace directory: a sanitized head of
 * the path plus a checksum, scoped under the `closedcode.workspace.` prefix.
 * @param {string} dir - Workspace directory path (may be falsy).
 * @returns {string} The workspace storage file name.
 */
function workspaceStorage(dir) {
  // Defensive: a route-param-driven workspace may be requested with no directory
  // during navigation to the no-project home before its owner is disposed.
  const safe = dir || "";
  const head = (safe.slice(0, 12) || "workspace").replace(/[^a-zA-Z0-9._-]/g, "-");
  const sum = checksum(safe) ?? "0";
  return `closedcode.workspace.${head}.${sum}.dat`;
}
/**
 * Compute the set of older workspace storage names a value may have been saved
 * under (raw path before normalization, and the backslash form of drive paths),
 * so migration can find pre-pathKey data.
 * @param {string} dir - Workspace directory path.
 * @returns {Array} Distinct legacy storage names, or undefined when none differ from the canonical one.
 */
function legacyWorkspaceStorage(dir) {
  const storage = workspaceStorage(pathKey(dir));
  const result = new Set();
  const raw = workspaceStorage(dir);
  if (raw !== storage) result.add(raw);
  const key = pathKey(dir);
  const drive = key.length >= 3 && key[1] === ":" && key[2] === "/";
  if (drive) {
    const backslash = workspaceStorage(key.replaceAll("/", "\\"));
    if (backslash !== storage) result.add(backslash);
  }
  if (result.size === 0) return;
  return [...result];
}
/**
 * Build a Storage-like adapter over `localStorage` that namespaces every key
 * with a prefix, backed by the in-memory cache and a per-scope fallback when
 * localStorage is unavailable.
 * @param {string} prefix - Key namespace prefix.
 * @returns {Object} An object with `getItem`, `setItem`, and `removeItem`.
 */
function localStorageWithPrefix(prefix) {
  const base = `${prefix}:`;
  const scope = `prefix:${prefix}`;
  const item = key => base + key;
  return {
    getItem: key => {
      const name = item(key);
      const cached = cacheGet(name);
      if (fallbackDisabled(scope)) return cached ?? null;
      const stored = (() => {
        try {
          return localStorage.getItem(name);
        } catch {
          fallbackSet(scope);
          return null;
        }
      })();
      if (stored === null) return cached ?? null;
      cacheSet(name, stored);
      return stored;
    },
    setItem: (key, value) => {
      const name = item(key);
      if (fallbackDisabled(scope)) return;
      try {
        if (write(localStorage, name, value)) return;
      } catch {
        fallbackSet(scope);
        return;
      }
      fallbackSet(scope);
    },
    removeItem: key => {
      const name = item(key);
      cacheDelete(name);
      if (fallbackDisabled(scope)) return;
      try {
        localStorage.removeItem(name);
      } catch {
        fallbackSet(scope);
      }
    }
  };
}
/**
 * Build a Storage-like adapter over `localStorage` using keys verbatim (no
 * prefix), backed by the in-memory cache and a fallback when localStorage is
 * unavailable.
 * @returns {Object} An object with `getItem`, `setItem`, and `removeItem`.
 */
function localStorageDirect() {
  const scope = "direct";
  return {
    getItem: key => {
      const cached = cacheGet(key);
      if (fallbackDisabled(scope)) return cached ?? null;
      const stored = (() => {
        try {
          return localStorage.getItem(key);
        } catch {
          fallbackSet(scope);
          return null;
        }
      })();
      if (stored === null) return cached ?? null;
      cacheSet(key, stored);
      return stored;
    },
    setItem: (key, value) => {
      if (fallbackDisabled(scope)) return;
      try {
        if (write(localStorage, key, value)) return;
      } catch {
        fallbackSet(scope);
        return;
      }
      fallbackSet(scope);
    },
    removeItem: key => {
      cacheDelete(key);
      if (fallbackDisabled(scope)) return;
      try {
        localStorage.removeItem(key);
      } catch {
        fallbackSet(scope);
      }
    }
  };
}
/**
 * Internal helpers exposed for unit tests only.
 * @type {Object}
 */
export const PersistTesting = {
  localStorageDirect,
  localStorageWithPrefix,
  migrateLegacy,
  normalize,
  workspaceStorage
};

/**
 * Factory of persistence "targets" describing where a value is stored (storage
 * name, key, and any legacy keys/names to migrate from) at global, workspace,
 * session, or auto-scoped granularity.
 * @type {Object}
 */
export const Persist = {
  /**
   * Build a global-scoped target stored in the shared global storage file.
   * @param {string} key - Storage key.
   * @param {Array} legacy - Legacy key names to migrate from.
   * @returns {Object} A persistence target `{ storage, key, legacy }`.
   */
  global(key, legacy) {
    return {
      storage: GLOBAL_STORAGE,
      key,
      legacy
    };
  },
  /**
   * Build a workspace-scoped target keyed by directory.
   * @param {string} dir - Workspace directory (coerced to a placeholder when absent).
   * @param {string} key - Storage key (namespaced under `workspace:`).
   * @param {Array} legacy - Legacy key names to migrate from.
   * @returns {Object} A persistence target with `storage`, `legacyStorageNames`, `key`, and `legacy`.
   */
  workspace(dir, key, legacy) {
    // Coerce an absent directory to a stable placeholder so the whole workspace
    // persist chain (workspaceStorage / pathKey / legacyWorkspaceStorage) stays
    // string-safe. Route-param-driven workspaces are briefly requested with no
    // dir while navigating to the no-project home before their owner is disposed;
    // throwing here broke the flush so the home route never rendered.
    const safeDir = dir || "_no_workspace_";
    const storage = workspaceStorage(pathKey(safeDir));
    return {
      storage,
      legacyStorageNames: legacyWorkspaceStorage(safeDir),
      key: `workspace:${key}`,
      legacy
    };
  },
  /**
   * Build a session-scoped target (stored in the workspace file, keyed by
   * session id).
   * @param {string} dir - Workspace directory (coerced to a placeholder when absent).
   * @param {string} session - Session id.
   * @param {string} key - Storage key (namespaced under `session:<session>:`).
   * @param {Array} legacy - Legacy key names to migrate from.
   * @returns {Object} A persistence target with `storage`, `legacyStorageNames`, `key`, and `legacy`.
   */
  session(dir, session, key, legacy) {
    const safeDir = dir || "_no_workspace_";
    const storage = workspaceStorage(pathKey(safeDir));
    return {
      storage,
      legacyStorageNames: legacyWorkspaceStorage(safeDir),
      key: `session:${session}:${key}`,
      legacy
    };
  },
  /**
   * Build a session-scoped target when a session id is given, otherwise a
   * workspace-scoped one.
   * @param {string} dir - Workspace directory.
   * @param {string} session - Session id (falsy selects workspace scope).
   * @param {string} key - Storage key.
   * @param {Array} legacy - Legacy key names to migrate from.
   * @returns {Object} The resolved persistence target.
   */
  scoped(dir, session, key, legacy) {
    if (session) return Persist.session(dir, session, key, legacy);
    return Persist.workspace(dir, key, legacy);
  }
};

/**
 * Delete a persisted value (and any legacy copies) for a target, using the
 * desktop async storage when available or localStorage otherwise.
 * @param {Object} target - Persistence target from {@link Persist}.
 * @param {Object} platform - Platform context providing `platform` and optional `storage(name)`.
 * @returns {void}
 */
export function removePersisted(target, platform) {
  const isDesktop = platform?.platform === "desktop" && !!platform.storage;
  if (isDesktop) {
    void platform.storage?.(target.storage)?.removeItem(target.key);
    for (const storage of target.legacyStorageNames ?? []) {
      void platform.storage?.(storage)?.removeItem(target.key);
    }
    return;
  }
  if (!target.storage) {
    localStorageDirect().removeItem(target.key);
    return;
  }
  localStorageWithPrefix(target.storage).removeItem(target.key);
  for (const storage of target.legacyStorageNames ?? []) {
    localStorageWithPrefix(storage).removeItem(target.key);
  }
}
/**
 * Back a reactive store with persistent storage. Selects the right adapter
 * (desktop async API vs. browser localStorage, prefixed or direct), wires
 * legacy migration into reads, and tracks load readiness.
 * @param {Object} target - A persistence target from {@link Persist}, or a plain key string.
 * @param {Array} store - A `[state, setState]` reactive store tuple to persist.
 * @returns {Array} `[state, setState, init, ready]` where `init` is the (possibly async) load and `ready` is a readiness accessor carrying a `.promise`.
 */
export function persisted(target, store) {
  const platform = usePlatform();
  const config = typeof target === "string" ? {
    key: target
  } : target;
  const defaults = snapshot(store[0]);
  const legacy = config.legacy ?? [];
  const isDesktop = platform.platform === "desktop" && !!platform.storage;
  const currentStorage = (() => {
    if (isDesktop) return platform.storage?.(config.storage);
    if (!config.storage) return localStorageDirect();
    return localStorageWithPrefix(config.storage);
  })();
  const legacyStorage = (() => {
    if (!isDesktop) return localStorageDirect();
    if (!config.storage) return platform.storage?.();
    return platform.storage?.(LEGACY_STORAGE);
  })();
  const legacyStorageNames = config.legacyStorageNames ?? [];
  const storage = (() => {
    if (!isDesktop) {
      const current = currentStorage;
      const legacyStore = legacyStorage;
      const legacyStores = legacyStorageNames.map(localStorageWithPrefix);
      const api = {
        getItem: key => {
          const value = readCurrent({
            storage: current,
            key,
            defaults,
            migrate: config.migrate
          });
          if (value !== undefined) return value;
          return migrateLegacy({
            current,
            legacyStore,
            stores: legacyStores,
            keys: legacy,
            key,
            defaults,
            migrate: config.migrate
          });
        },
        setItem: (key, value) => {
          current.setItem(key, value);
        },
        removeItem: key => {
          current.removeItem(key);
        }
      };
      return api;
    }
    const current = currentStorage;
    const legacyStore = legacyStorage;
    const legacyStores = legacyStorageNames.map(name => platform.storage?.(name)).filter(x => !!x);
    const api = {
      getItem: async key => {
        const value = await readCurrentAsync({
          storage: current,
          key,
          defaults,
          migrate: config.migrate
        });
        if (value !== undefined) return value;
        return migrateLegacyAsync({
          current,
          legacyStore,
          stores: legacyStores,
          keys: legacy,
          key,
          defaults,
          migrate: config.migrate
        });
      },
      setItem: async (key, value) => {
        await current.setItem(key, value);
      },
      removeItem: async key => {
        await current.removeItem(key);
      }
    };
    return api;
  })();
  const [state, setState, init] = makePersisted(store, {
    name: config.key,
    storage
  });
  const isAsync = init instanceof Promise;
  const [ready] = createResource(() => init, async initValue => {
    if (initValue instanceof Promise) await initValue;
    return true;
  }, {
    initialValue: !isAsync
  });
  return [state, setState, init, Object.assign(() => ready.loading ? false : ready.latest === true, {
    promise: init instanceof Promise ? init : undefined
  })];
}