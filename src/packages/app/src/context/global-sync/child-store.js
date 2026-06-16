/** @file Manager for per-directory child stores: lazily creates persisted reactive stores per workspace, with reference pinning, LRU/TTL eviction, and project metadata/icon updates. */
import { createRoot, getOwner, onCleanup, runWithOwner } from "../../lib/reactivity.js";
import { createStore } from "../../lib/store.js";
import { Persist, persisted } from "@/utils/persist.js";
import { DIR_IDLE_TTL_MS, MAX_DIR_STORES } from "./types.js";
import { canDisposeDirectory, pickDirectoriesToEvict } from "./eviction.js";
import { useQueries } from "../../lib/query/index.js";
import { loadPathQuery, loadProvidersQuery } from "./bootstrap.js";
import { loadLspQuery, loadMcpQuery } from "../global-sync.js";
import { directoryKey } from "./utils.js";
/**
 * Create a manager for per-directory child stores.
 * @param {Object} input - Dependencies: `owner` (root reactive owner), `isBooting`, `isLoadingSessions`, `onBootstrap`, `onDispose`, `translate`, `getSdk`, and `global` (shared provider state).
 * @returns {Object} Manager API `{children, ensureChild, child, peek, projectMeta, projectIcon, mark, pin, unpin, pinned, disposeDirectory, runEviction, vcsCache, metaCache, iconCache}`.
 */
export function createChildStoreManager(input) {
  const children = {};
  const vcsCache = new Map();
  const metaCache = new Map();
  const iconCache = new Map();
  const lifecycle = new Map();
  const pins = new Map();
  const ownerPins = new WeakMap();
  const disposers = new Map();
  /**
   * Record a key's last-access time and run eviction (skipping the just-touched key).
   * @param {string} key - Directory key; falsy is ignored.
   * @returns {void}
   */
  const markKey = key => {
    if (!key) return;
    lifecycle.set(key, {
      lastAccessAt: Date.now()
    });
    runEviction(key);
  };
  /**
   * Mark a directory as recently accessed.
   * @param {string} directory - Workspace directory.
   * @returns {void}
   */
  const mark = directory => {
    const key = directoryKey(directory);
    markKey(key);
  };
  /**
   * Increment a directory's pin count (protecting it from eviction) and mark it accessed.
   * @param {string} directory - Workspace directory.
   * @returns {void}
   */
  const pin = directory => {
    const key = directoryKey(directory);
    if (!key) return;
    pins.set(key, (pins.get(key) ?? 0) + 1);
    markKey(key);
  };
  /**
   * Decrement a directory's pin count; when it reaches zero, drop the pin and run eviction.
   * @param {string} directory - Workspace directory.
   * @returns {void}
   */
  const unpin = directory => {
    const key = directoryKey(directory);
    if (!key) return;
    const next = (pins.get(key) ?? 0) - 1;
    if (next > 0) {
      pins.set(key, next);
      return;
    }
    pins.delete(key);
    runEviction();
  };
  /**
   * Whether a directory currently has at least one pin.
   * @param {string} directory - Workspace directory.
   * @returns {boolean} True if pinned.
   */
  const pinned = directory => (pins.get(directoryKey(directory)) ?? 0) > 0;
  /**
   * Pin a directory for the lifetime of the current reactive owner, auto-unpinning on cleanup.
   * Deduplicates so each owner pins a given directory at most once.
   * @param {string} directory - Workspace directory.
   * @returns {void}
   */
  const pinForOwner = directory => {
    const current = getOwner();
    if (!current) return;
    if (current === input.owner) return;
    const key = current;
    const set = ownerPins.get(key);
    if (set?.has(directory)) return;
    if (set) set.add(directory);
    if (!set) ownerPins.set(key, new Set([directory]));
    pin(directory);
    onCleanup(() => {
      const set = ownerPins.get(key);
      if (set) {
        set.delete(directory);
        if (set.size === 0) ownerPins.delete(key);
      }
      unpin(directory);
    });
  };
  /**
   * Dispose a directory's child store and caches if it is safe to (not pinned/booting/loading).
   * @param {string} directory - Directory key to dispose.
   * @returns {boolean} True if the directory was disposed; false if it could not be.
   */
  function disposeDirectory(directory) {
    const key = directory;
    if (!canDisposeDirectory({
      directory: key,
      hasStore: !!children[key],
      pinned: pinned(key),
      booting: input.isBooting(key),
      loadingSessions: input.isLoadingSessions(key)
    })) {
      return false;
    }
    vcsCache.delete(key);
    metaCache.delete(key);
    iconCache.delete(key);
    lifecycle.delete(key);
    const dispose = disposers.get(key);
    if (dispose) {
      dispose();
      disposers.delete(key);
    }
    delete children[key];
    input.onDispose(key);
    return true;
  }
  /**
   * Evict directories selected by the LRU/TTL/max-count policy, except an optionally skipped key.
   * @param {string} skip - Directory key to exclude from eviction this pass.
   * @returns {void}
   */
  function runEviction(skip) {
    const stores = Object.keys(children);
    if (stores.length === 0) return;
    const list = pickDirectoriesToEvict({
      stores,
      state: lifecycle,
      pins: new Set(stores.filter(pinned)),
      max: MAX_DIR_STORES,
      ttl: DIR_IDLE_TTL_MS,
      now: Date.now()
    }).filter(directory => directory !== skip);
    if (list.length === 0) return;
    for (const directory of list) {
      if (!disposeDirectory(directoryKey(directory))) continue;
    }
  }
  /**
   * Get the child store tuple for a directory, lazily creating its persisted vcs/meta/icon caches and
   * reactive store (with path/MCP/LSP/provider queries) on first access. Marks the directory accessed.
   * @param {string} directory - Workspace directory.
   * @returns {Array} The `[store, setStore]` tuple for the directory.
   */
  function ensureChild(directory) {
    const key = directoryKey(directory);
    if (!key) console.error("No directory provided");
    if (!children[key]) {
      const vcs = runWithOwner(input.owner, () => persisted(Persist.workspace(directory, "vcs", ["vcs.v1"]), createStore({
        value: undefined
      })));
      if (!vcs) throw new Error(input.translate("error.childStore.persistedCacheCreateFailed"));
      const vcsStore = vcs[0];
      vcsCache.set(key, {
        store: vcsStore,
        setStore: vcs[1],
        ready: vcs[3]
      });
      const meta = runWithOwner(input.owner, () => persisted(Persist.workspace(directory, "project", ["project.v1"]), createStore({
        value: undefined
      })));
      if (!meta) throw new Error(input.translate("error.childStore.persistedProjectMetadataCreateFailed"));
      metaCache.set(key, {
        store: meta[0],
        setStore: meta[1],
        ready: meta[3]
      });
      const icon = runWithOwner(input.owner, () => persisted(Persist.workspace(directory, "icon", ["icon.v1"]), createStore({
        value: undefined
      })));
      if (!icon) throw new Error(input.translate("error.childStore.persistedProjectIconCreateFailed"));
      iconCache.set(key, {
        store: icon[0],
        setStore: icon[1],
        ready: icon[3]
      });
      const init = () => createRoot(dispose => {
        const sdk = input.getSdk(directory);
        const initialMeta = meta[0].value;
        const initialIcon = icon[0].value;
        const [pathQuery, mcpQuery, lspQuery, providerQuery] = useQueries(() => ({
          queries: [loadPathQuery(key, sdk), loadMcpQuery(key, sdk), loadLspQuery(key, sdk), loadProvidersQuery(key, sdk)]
        }));
        const child = createStore({
          project: "",
          projectMeta: initialMeta,
          icon: initialIcon,
          get provider_ready() {
            return !providerQuery.isLoading;
          },
          get provider() {
            const EMPTY = {
              all: [],
              connected: [],
              default: {}
            };
            if (providerQuery.isLoading) return EMPTY;
            if (providerQuery.data?.all.length === 0 && input.global.provider.all.length > 0) return input.global.provider;
            return providerQuery.data ?? EMPTY;
          },
          config: {},
          get path() {
            if (pathQuery.isLoading || !pathQuery.data) return {
              state: "",
              config: "",
              worktree: "",
              directory: "",
              home: ""
            };
            return pathQuery.data;
          },
          status: "loading",
          agent: [],
          command: [],
          session: [],
          sessionTotal: 0,
          session_status: {},
          session_diff: {},
          todo: {},
          permission: {},
          question: {},
          get mcp_ready() {
            return !mcpQuery.isLoading;
          },
          get mcp() {
            return mcpQuery.isLoading ? {} : mcpQuery.data ?? {};
          },
          get lsp_ready() {
            return !lspQuery.isLoading;
          },
          get lsp() {
            return lspQuery.isLoading ? [] : lspQuery.data ?? [];
          },
          vcs: vcsStore.value,
          limit: 5,
          message: {},
          part: {}
        });
        children[key] = child;
        disposers.set(key, dispose);
        /**
         * Run a callback once a persisted store's async hydration completes, if the child store is still current.
         * @param {*} init - The persisted store's init result; only awaited when it is a Promise.
         * @param {Function} run - Callback to run after hydration.
         * @returns {void}
         */
        const onPersistedInit = (init, run) => {
          if (!(init instanceof Promise)) return;
          void init.then(() => {
            if (children[key] !== child) return;
            run();
          });
        };
        onPersistedInit(vcs[2], () => {
          const cached = vcsStore.value;
          if (!cached?.branch) return;
          child[1]("vcs", value => value ?? cached);
        });
        onPersistedInit(meta[2], () => {
          if (child[0].projectMeta !== initialMeta) return;
          child[1]("projectMeta", meta[0].value);
        });
        onPersistedInit(icon[2], () => {
          if (child[0].icon !== initialIcon) return;
          child[1]("icon", icon[0].value);
        });
      });
      runWithOwner(input.owner, init);
    }
    markKey(key);
    const childStore = children[key];
    if (!childStore) throw new Error(input.translate("error.childStore.storeCreateFailed"));
    return childStore;
  }
  /**
   * Resolve a directory's child store, pin it to the calling owner, and bootstrap it if still loading.
   * @param {string} directory - Workspace directory.
   * @param {Object} options - `bootstrap` (default true) controls whether to trigger bootstrap.
   * @returns {Array} The `[store, setStore]` tuple for the directory.
   */
  function child(directory, options = {}) {
    const key = directoryKey(directory);
    const childStore = ensureChild(directory);
    pinForOwner(key);
    const shouldBootstrap = options.bootstrap ?? true;
    if (shouldBootstrap && childStore[0].status === "loading") {
      input.onBootstrap(directory);
    }
    return childStore;
  }
  /**
   * Like `child` but without pinning to the calling owner; bootstraps if still loading.
   * @param {string} directory - Workspace directory.
   * @param {Object} options - `bootstrap` (default true) controls whether to trigger bootstrap.
   * @returns {Array} The `[store, setStore]` tuple for the directory.
   */
  function peek(directory, options = {}) {
    const key = directoryKey(directory);
    const childStore = ensureChild(directory);
    const shouldBootstrap = options.bootstrap ?? true;
    if (shouldBootstrap && childStore[0].status === "loading") {
      input.onBootstrap(directory);
    }
    return childStore;
  }
  /**
   * Merge a patch into a directory's project metadata (deep-merging `icon` and `commands`) and persist it.
   * @param {string} directory - Workspace directory.
   * @param {Object} patch - Partial project-metadata patch.
   * @returns {void}
   */
  function projectMeta(directory, patch) {
    const key = directoryKey(directory);
    const [store, setStore] = ensureChild(directory);
    const cached = metaCache.get(key);
    if (!cached) return;
    const previous = store.projectMeta ?? {};
    const icon = patch.icon ? {
      ...previous.icon,
      ...patch.icon
    } : previous.icon;
    const commands = patch.commands ? {
      ...previous.commands,
      ...patch.commands
    } : previous.commands;
    const next = {
      ...previous,
      ...patch,
      icon,
      commands
    };
    cached.setStore("value", next);
    setStore("projectMeta", next);
  }
  /**
   * Set and persist a directory's project icon (no-op if unchanged).
   * @param {string} directory - Workspace directory.
   * @param {*} value - Icon value to store.
   * @returns {void}
   */
  function projectIcon(directory, value) {
    const key = directoryKey(directory);
    const [store, setStore] = ensureChild(directory);
    const cached = iconCache.get(key);
    if (!cached) return;
    if (store.icon === value) return;
    cached.setStore("value", value);
    setStore("icon", value);
  }
  return {
    children,
    ensureChild,
    child,
    peek,
    projectMeta,
    projectIcon,
    mark,
    pin,
    unpin,
    pinned,
    disposeDirectory,
    runEviction,
    vcsCache,
    metaCache,
    iconCache
  };
}