/** @file GlobalSync context: orchestrates global + per-directory reactive stores, the bootstrap query, session loading, and routing of streamed SSE events (with per-frame delta coalescing) into those stores. */
import { showToast } from "@/lib/toast.js";
import { getFilename } from "core/util/path";
import { batch, createComponent, createContext, createEffect, getOwner, onCleanup, onMount, untrack, useContext } from "../lib/reactivity.js";
import { createStore, produce, reconcile } from "../lib/store.js";
import { useLanguage } from "@/context/language.js";
import { useGlobalSDK } from "./global-sdk.js";
import { bootstrapDirectory, bootstrapGlobal, clearProviderRev, loadGlobalConfigQuery, loadPathQuery, loadProjectsQuery, loadProvidersQuery } from "./global-sync/bootstrap.js";
import { createChildStoreManager } from "./global-sync/child-store.js";
import { applyDirectoryEvent, applyGlobalEvent, cleanupDroppedSessionCaches } from "./global-sync/event-reducer.js";
import { clearSessionPrefetchDirectory } from "./global-sync/session-prefetch.js";
import { estimateRootSessionTotal, loadRootSessionsWithFallback } from "./global-sync/session-load.js";
import { trimSessions } from "./global-sync/session-trim.js";
import { SESSION_RECENT_LIMIT } from "./global-sync/types.js";
import { formatServerError } from "@/utils/server-errors.js";
import { queryOptions, skipToken, useMutation, useQueries, useQuery, useQueryClient } from "../lib/query/index.js";
import { createRefreshQueue } from "./global-sync/queue.js";
import { directoryKey } from "./global-sync/utils.js";
/**
 * Query options for a directory's session list (filled imperatively via `fetchQuery`; defaults to a skip token).
 * @param {string} directory - Workspace directory key.
 * @returns {Object} Query options object.
 */
export const loadSessionsQuery = directory => queryOptions({
  queryKey: [directory, "loadSessions"],
  queryFn: skipToken
});
/**
 * Query options that fetch MCP server status for a directory.
 * @param {string} directory - Workspace directory key.
 * @param {Object} sdk - Directory-scoped SDK client, or falsy to skip.
 * @returns {Object} Query options object resolving to the MCP status map.
 */
export const loadMcpQuery = (directory, sdk) => queryOptions({
  queryKey: [directory, "mcp"],
  queryFn: sdk ? () => sdk.mcp.status().then(r => r.data ?? {}) : skipToken
});
/**
 * Query options that fetch LSP server status for a directory.
 * @param {string} directory - Workspace directory key.
 * @param {Object} sdk - Directory-scoped SDK client, or falsy to skip.
 * @returns {Object} Query options object resolving to the LSP status array.
 */
export const loadLspQuery = (directory, sdk) => queryOptions({
  queryKey: [directory, "lsp"],
  queryFn: sdk ? () => sdk.lsp.status().then(r => r.data ?? []) : skipToken
});
/**
 * Build the GlobalSync context value: global store, per-directory child stores, bootstrap query,
 * session loading, config mutation, and the SSE event subscription that fans events into stores.
 * @returns {Object} GlobalSync API `{data, set, ready, error, child, peek, updateConfig, project, todo}`.
 */
function createGlobalSync() {
  const globalSDK = useGlobalSDK();
  const language = useLanguage();
  const owner = getOwner();
  if (!owner) throw new Error("GlobalSync must be created within owner");
  const sdkCache = new Map();
  const booting = new Map();
  const sessionLoads = new Map();
  const sessionMeta = new Map();
  const [configQuery, providerQuery, pathQuery] = useQueries(() => ({
    queries: [loadGlobalConfigQuery(), loadProvidersQuery(null), loadPathQuery(null), loadProjectsQuery()]
  }));
  const [globalStore, setGlobalStore] = createStore({
    get ready() {
      return bootstrap.isPending;
    },
    project: [],
    session_todo: {},
    provider_auth: {},
    get path() {
      const EMPTY = {
        state: "",
        config: "",
        worktree: "",
        directory: "",
        home: ""
      };
      if (pathQuery.isLoading) return EMPTY;
      return pathQuery.data ?? EMPTY;
    },
    get provider() {
      const EMPTY = {
        all: [],
        connected: [],
        default: {}
      };
      if (providerQuery.isLoading) return EMPTY;
      return providerQuery.data ?? EMPTY;
    },
    get config() {
      if (configQuery.isLoading) return {};
      return configQuery.data ?? {};
    },
    get reload() {
      return updateConfigMutation.isPending ? "pending" : undefined;
    }
  });
  const queryClient = useQueryClient();
  let bootedAt = 0;
  let bootingRoot = false;
  let eventFrame;
  let eventTimer;
  onCleanup(() => {
    if (eventFrame !== undefined) cancelAnimationFrame(eventFrame);
    if (eventTimer !== undefined) clearTimeout(eventTimer);
  });
  /**
   * Replace the global project list in the store.
   * @param {Array} next - Next project list (or updater accepted by the store setter).
   * @returns {void}
   */
  const setProjects = next => {
    setGlobalStore("project", next);
  };
  /**
   * Store setter used during bootstrap that special-cases replacing the project array.
   * @param {...*} input - Store path/value arguments (first may be "project" with an array).
   * @returns {*} The applied value or the result of the underlying store setter.
   */
  const setBootStore = (...input) => {
    if (input[0] === "project" && Array.isArray(input[1])) {
      setProjects(input[1]);
      return input[1];
    }
    return setGlobalStore(...input);
  };
  const bootstrap = useQuery(() => ({
    queryKey: ["bootstrap"],
    queryFn: async () => {
      await bootstrapGlobal({
        globalSDK: globalSDK.client,
        requestFailedTitle: language.t("common.requestFailed"),
        translate: language.t,
        formatMoreCount: count => language.t("common.moreCountSuffix", {
          count
        }),
        setGlobalStore: setBootStore,
        queryClient
      });
      bootedAt = Date.now();
      return bootedAt;
    }
  }));
  /**
   * Public global-store setter that special-cases replacing/updating the project array.
   * @param {...*} input - Store path/value arguments (first may be "project").
   * @returns {*} The applied value or the result of the underlying store setter.
   */
  const set = (...input) => {
    if (input[0] === "project" && (Array.isArray(input[1]) || typeof input[1] === "function")) {
      setProjects(input[1]);
      return input[1];
    }
    return setGlobalStore(...input);
  };
  /**
   * Set or clear the cached todo list for a session in the global store.
   * @param {string} sessionID - Session id; falsy is ignored.
   * @param {Array} todos - Todo items, or falsy to delete the session's todos.
   * @returns {void}
   */
  const setSessionTodo = (sessionID, todos) => {
    if (!sessionID) return;
    if (!todos) {
      setGlobalStore("session_todo", produce(draft => {
        delete draft[sessionID];
      }));
      return;
    }
    setGlobalStore("session_todo", sessionID, reconcile(todos, {
      key: "id"
    }));
  };
  /**
   * Whether background refresh should be paused (true while a config reload/update is pending).
   * @returns {boolean} True if refreshes should be held off.
   */
  const paused = () => untrack(() => globalStore.reload) !== undefined;
  const queue = createRefreshQueue({
    paused,
    key: directoryKey,
    bootstrap: () => queryClient.fetchQuery({
      queryKey: ["bootstrap"]
    }),
    bootstrapInstance
  });
  // Resume the queue when the reload pause clears. push()/refresh() skip
  // scheduling while paused(), so a refresh enqueued during a config update would
  // otherwise sit in the queue until an unrelated later push rescheduled it. Read
  // globalStore.reload reactively here (paused() untracks, so it can't drive an
  // effect) and drain once it returns to undefined.
  createEffect(() => {
    if (globalStore.reload === undefined) queue.resume();
  });
  /**
   * Get (creating and caching on first use) a directory-scoped SDK client.
   * @param {string} directory - Workspace directory.
   * @returns {Object} A throw-on-error SDK client bound to the directory.
   */
  const sdkFor = directory => {
    const key = directoryKey(directory);
    const cached = sdkCache.get(key);
    if (cached) return cached;
    const sdk = globalSDK.createClient({
      directory,
      throwOnError: true
    });
    sdkCache.set(key, sdk);
    return sdk;
  };
  const children = createChildStoreManager({
    owner,
    isBooting: directory => booting.has(directory),
    isLoadingSessions: directory => sessionLoads.has(directory),
    onBootstrap: directory => {
      void bootstrapInstance(directory);
    },
    onDispose: directory => {
      const key = directoryKey(directory);
      queue.clear(key);
      sessionMeta.delete(key);
      sdkCache.delete(key);
      clearProviderRev(key);
      clearSessionPrefetchDirectory(key);
    },
    translate: language.t,
    getSdk: sdkFor,
    global: {
      provider: globalStore.provider
    }
  });
  /**
   * Load (or top up) a directory's recent root sessions, trimming to the store limit and cleaning up dropped caches.
   * Deduplicates concurrent loads and pins the directory for the duration.
   * @param {string} directory - Workspace directory.
   * @returns {Promise} Resolves when the load completes (or immediately if already satisfied by metadata).
   */
  async function loadSessions(directory) {
    const key = directoryKey(directory);
    const pending = sessionLoads.get(key);
    if (pending) return pending;
    children.pin(key);
    const [store, setStore] = children.child(directory, {
      bootstrap: false
    });
    const meta = sessionMeta.get(key);
    if (meta && meta.limit >= store.limit) {
      const next = trimSessions(store.session, {
        limit: store.limit,
        permission: store.permission
      });
      if (next.length !== store.session.length) {
        setStore("session", reconcile(next, {
          key: "id"
        }));
        cleanupDroppedSessionCaches(store, setStore, next, setSessionTodo);
      }
      children.unpin(key);
      return;
    }
    const limit = Math.max(store.limit + SESSION_RECENT_LIMIT, SESSION_RECENT_LIMIT);
    const promise = queryClient.fetchQuery({
      ...loadSessionsQuery(key),
      queryFn: () => loadRootSessionsWithFallback({
        directory,
        limit,
        list: query => globalSDK.client.session.list(query)
      }).then(x => {
        const nonArchived = (x.data ?? []).filter(s => !!s?.id).filter(s => !s.time?.archived).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
        const limit = store.limit;
        const childSessions = store.session.filter(s => !!s.parentID);
        const sessions = trimSessions([...nonArchived, ...childSessions], {
          limit,
          permission: store.permission
        });
        batch(() => {
          setStore("sessionTotal", estimateRootSessionTotal({
            count: nonArchived.length,
            limit: x.limit,
            limited: x.limited
          }));
          setStore("session", reconcile(sessions, {
            key: "id"
          }));
          cleanupDroppedSessionCaches(store, setStore, sessions, setSessionTodo);
        });
        sessionMeta.set(key, {
          limit
        });
      }).catch(err => {
        console.error("Failed to load sessions", err);
        const project = getFilename(directory);
        showToast({
          variant: "error",
          title: language.t("toast.session.listFailed.title", {
            project
          }),
          description: formatServerError(err, language.t)
        });
      }).then(() => null)
    }).then(() => {});
    sessionLoads.set(key, promise);
    void promise.finally(() => {
      sessionLoads.delete(key);
      children.unpin(key);
    });
    return promise;
  }
  /**
   * Bootstrap a directory's child store (config, sessions, agents, vcs, permissions, etc.), deduplicating concurrent calls.
   * @param {string} directory - Workspace directory.
   * @returns {Promise} Resolves when bootstrap kicks off/completes (no-op for falsy keys).
   */
  async function bootstrapInstance(directory) {
    const key = directoryKey(directory);
    if (!key) return;
    const pending = booting.get(key);
    if (pending) return pending;
    children.pin(key);
    const promise = Promise.resolve().then(async () => {
      const child = children.ensureChild(directory);
      const cache = children.vcsCache.get(key);
      if (!cache) return;
      const sdk = sdkFor(directory);
      await bootstrapDirectory({
        directory,
        global: {
          config: globalStore.config,
          path: globalStore.path,
          project: globalStore.project,
          provider: globalStore.provider
        },
        sdk,
        store: child[0],
        setStore: child[1],
        vcsCache: cache,
        loadSessions,
        translate: language.t,
        queryClient
      });
    });
    booting.set(key, promise);
    void promise.finally(() => {
      booting.delete(key);
      children.unpin(key);
    });
    return promise;
  }
  // Streaming reasoning models (e.g. gpt-oss) emit one `message.part.delta`
  // bus event per token. Each event walks the Solid store and notifies every
  // subscriber, which becomes a serious CPU bottleneck when the session view
  // also has a heavy diff sidebar mounted (thousands of file rows). Coalesce
  // deltas per (directory, messageID, partID, field) and flush at most once
  // per animation frame so the renderer collapses N tokens into one update.
  const deltaPending = new Map();
  let deltaFlushScheduled = false;
  /**
   * Apply all coalesced message-part deltas accumulated this frame to their directory stores, then clear the buffer.
   * @returns {void}
   */
  const flushDeltas = () => {
    deltaFlushScheduled = false;
    if (deltaPending.size === 0) return;
    const drained = [...deltaPending.values()];
    deltaPending.clear();
    for (const item of drained) {
      const existing = children.children[item.key];
      if (!existing) continue;
      const [, setStore] = existing;
      applyDirectoryEvent({
        event: { type: "message.part.delta", properties: item.event },
        directory: item.directory,
        store: existing[0],
        setStore,
        push: queue.push,
        setSessionTodo,
        vcsCache: children.vcsCache.get(item.key),
        loadLsp: () => void queryClient.fetchQuery(loadLspQuery(item.key, sdkFor(item.directory))),
      });
    }
  };
  /**
   * Schedule a delta flush on the next animation frame (at most one pending flush at a time).
   * @returns {void}
   */
  const scheduleDeltaFlush = () => {
    if (deltaFlushScheduled) return;
    deltaFlushScheduled = true;
    requestAnimationFrame(flushDeltas);
  };
  const unsub = globalSDK.event.listen(e => {
    const directory = e.name;
    const key = directoryKey(directory);
    const event = e.details;
    const recent = bootingRoot || Date.now() - bootedAt < 1500;
    if (directory === "global") {
      applyGlobalEvent({
        event,
        project: globalStore.project,
        refresh: () => {
          if (recent) return;
          bootstrap.refetch();
        },
        setGlobalProject: setProjects
      });
      if (event.type === "server.connected" || event.type === "global.disposed") {
        if (recent) return;
        for (const directory of Object.keys(children.children)) {
          queue.push(directory);
        }
      }
      return;
    }
    const existing = children.children[key];
    if (!existing) return;
    children.mark(key);
    if (event.type === "message.part.delta") {
      const props = event.properties;
      const bucketKey = `${key}\0${props.messageID}\0${props.partID}\0${props.field}`;
      const pending = deltaPending.get(bucketKey);
      if (pending) {
        pending.event.delta = (pending.event.delta ?? "") + (props.delta ?? "");
      } else {
        deltaPending.set(bucketKey, {
          key,
          directory,
          event: { ...props, delta: props.delta ?? "" },
        });
      }
      // Flushing other events first would split a coalesced delta from
      // subsequent message.part.updated / message.updated events. Process
      // those synchronously below, and the delta flush in the next frame
      // catches up — order doesn't matter for append-only string deltas.
      scheduleDeltaFlush();
      return;
    }
    const [store, setStore] = existing;
    applyDirectoryEvent({
      event,
      directory,
      store,
      setStore,
      push: queue.push,
      setSessionTodo,
      vcsCache: children.vcsCache.get(key),
      loadLsp: () => {
        void queryClient.fetchQuery(loadLspQuery(key, sdkFor(directory)));
      }
    });
  });
  onCleanup(unsub);
  onCleanup(() => {
    queue.dispose();
  });
  onCleanup(() => {
    for (const directory of Object.keys(children.children)) {
      children.disposeDirectory(directoryKey(directory));
    }
  });
  onMount(() => {
    // Start the global SSE event stream after mount. This must NOT be gated behind
    // requestAnimationFrame: rAF is paused while the window is occluded/backgrounded
    // at startup, so the rAF callback never fired and the ENTIRE event stream
    // (notifications, permission prompts, live diffs, message deltas, file-watcher
    // updates, session status) never started. start() is async/non-blocking, so a
    // plain setTimeout(0) after mount is enough and fires reliably (background
    // timers are throttled, not paused).
    eventTimer = setTimeout(() => {
      eventTimer = undefined;
      void globalSDK.event.start();
    }, 0);
  });
  const projectApi = {
    loadSessions,
    meta(directory, patch) {
      children.projectMeta(directory, patch);
    },
    icon(directory, value) {
      children.projectIcon(directory, value);
    }
  };
  const updateConfigMutation = useMutation(() => ({
    mutationFn: config => globalSDK.client.global.config.update({
      config
    }),
    onSuccess: () => bootstrap.refetch()
  }));
  return {
    data: globalStore,
    set,
    get ready() {
      return globalStore.ready;
    },
    get error() {
      return globalStore.error;
    },
    child: children.child,
    peek: children.peek,
    // bootstrap,
    updateConfig: updateConfigMutation.mutateAsync,
    project: projectApi,
    todo: {
      set: setSessionTodo
    }
  };
}
const GlobalSyncContext = createContext();
/**
 * Provider component that constructs the GlobalSync value and exposes it to descendants.
 * @param {Object} props - Component props; `children` are rendered within the provider.
 * @returns {*} The provider component wrapping `props.children`.
 */
export function GlobalSyncProvider(props) {
  const value = createGlobalSync();
  return createComponent(GlobalSyncContext.Provider, {
    value: value,
    get children() {
      return props.children;
    }
  });
}
/**
 * Access the GlobalSync context value; throws if used outside a `GlobalSyncProvider`.
 * @returns {Object} The GlobalSync API.
 */
export function useGlobalSync() {
  const context = useContext(GlobalSyncContext);
  if (!context) throw new Error("useGlobalSync must be used within GlobalSyncProvider");
  return context;
}