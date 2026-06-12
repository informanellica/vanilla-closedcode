import { showToast } from "@/lib/toast.js";
import { getFilename } from "core/util/path";
import { batch, createComponent, createContext, getOwner, onCleanup, onMount, untrack, useContext } from "solid-js";
import { createStore, produce, reconcile } from "solid-js/store";
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
import { queryOptions, skipToken, useMutation, useQueries, useQuery, useQueryClient } from "@/lib/query/index.js";
import { createRefreshQueue } from "./global-sync/queue.js";
import { directoryKey } from "./global-sync/utils.js";
export const loadSessionsQuery = directory => queryOptions({
  queryKey: [directory, "loadSessions"],
  queryFn: skipToken
});
export const loadMcpQuery = (directory, sdk) => queryOptions({
  queryKey: [directory, "mcp"],
  queryFn: sdk ? () => sdk.mcp.status().then(r => r.data ?? {}) : skipToken
});
export const loadLspQuery = (directory, sdk) => queryOptions({
  queryKey: [directory, "lsp"],
  queryFn: sdk ? () => sdk.lsp.status().then(r => r.data ?? []) : skipToken
});
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
  const setProjects = next => {
    setGlobalStore("project", next);
  };
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
  const set = (...input) => {
    if (input[0] === "project" && (Array.isArray(input[1]) || typeof input[1] === "function")) {
      setProjects(input[1]);
      return input[1];
    }
    return setGlobalStore(...input);
  };
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
  const paused = () => untrack(() => globalStore.reload) !== undefined;
  const queue = createRefreshQueue({
    paused,
    key: directoryKey,
    bootstrap: () => queryClient.fetchQuery({
      queryKey: ["bootstrap"]
    }),
    bootstrapInstance
  });
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
    if (typeof requestAnimationFrame === "function") {
      eventFrame = requestAnimationFrame(() => {
        eventFrame = undefined;
        eventTimer = setTimeout(() => {
          eventTimer = undefined;
          void globalSDK.event.start();
        }, 0);
      });
    } else {
      eventTimer = setTimeout(() => {
        eventTimer = undefined;
        void globalSDK.event.start();
      }, 0);
    }
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
export function GlobalSyncProvider(props) {
  const value = createGlobalSync();
  return createComponent(GlobalSyncContext.Provider, {
    value: value,
    get children() {
      return props.children;
    }
  });
}
export function useGlobalSync() {
  const context = useContext(GlobalSyncContext);
  if (!context) throw new Error("useGlobalSync must be used within GlobalSyncProvider");
  return context;
}