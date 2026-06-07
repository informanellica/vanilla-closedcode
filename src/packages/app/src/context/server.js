import { createSimpleContext } from "@/lib/context.js";
import { batch, createEffect, createMemo, onCleanup } from "solid-js";
import { createStore } from "solid-js/store";
import { Persist, persisted } from "@/utils/persist.js";
import { useCheckServerHealth } from "@/utils/server-health.js";
const HEALTH_POLL_INTERVAL_MS = 10_000;
export function normalizeServerUrl(input) {
  const trimmed = input.trim();
  if (!trimmed) return;
  const withProtocol = /^https?:\/\//.test(trimmed) ? trimmed : `http://${trimmed}`;
  return withProtocol.replace(/\/+$/, "");
}
export function serverName(conn, ignoreDisplayName = false) {
  if (!conn) return "";
  if (conn.displayName && !ignoreDisplayName) return conn.displayName;
  return conn.http.url.replace(/^https?:\/\//, "").replace(/\/+$/, "");
}
function projectsKey(key) {
  if (!key) return "";
  if (key === "sidecar") return "local";
  if (isLocalHost(key)) return "local";
  return key;
}
function isLocalHost(url) {
  const host = url.replace(/^https?:\/\//, "").split(":")[0];
  if (host === "localhost" || host === "127.0.0.1") return "local";
}
export let ServerConnection;
(function (_ServerConnection) {
  // Regular web connections

  // Remote server desktop can SSH into

  const key = _ServerConnection.key = conn => {
    switch (conn.type) {
      case "http":
        return Key.make(conn.http.url);
      case "sidecar":
        {
          if (conn.variant === "wsl") return Key.make(`wsl:${conn.distro}`);
          return Key.make("sidecar");
        }
      case "ssh":
        return Key.make(`ssh:${conn.host}`);
    }
  };
  const Key = _ServerConnection.Key = {
    make: v => v
  };
})(ServerConnection || (ServerConnection = {}));
export const {
  use: useServer,
  provider: ServerProvider
} = createSimpleContext({
  name: "Server",
  init: props => {
    const checkServerHealth = useCheckServerHealth();
    const [store, setStore, _, ready] = persisted(Persist.global("server", ["server.v3"]), createStore({
      list: [],
      projects: {},
      lastProject: {}
    }));
    const url = x => typeof x === "string" ? x : "type" in x ? x.http.url : x.url;
    const allServers = createMemo(() => {
      const servers = [...(props.servers ?? []), ...store.list.map(value => typeof value === "string" ? {
        type: "http",
        http: {
          url: value
        }
      } : value)];
      const deduped = new Map(servers.map(value => {
        const conn = "type" in value ? value : {
          type: "http",
          http: value
        };
        return [ServerConnection.key(conn), conn];
      }));
      return [...deduped.values()];
    });
    const [state, setState] = createStore({
      active: props.defaultServer,
      healthy: undefined
    });
    const healthy = () => state.healthy;
    function startHealthPolling(conn) {
      let alive = true;
      let busy = false;
      const run = () => {
        if (busy) return;
        busy = true;
        void check(conn).then(next => {
          if (!alive) return;
          setState("healthy", next);
        }).finally(() => {
          busy = false;
        });
      };
      run();
      const interval = setInterval(run, HEALTH_POLL_INTERVAL_MS);
      return () => {
        alive = false;
        clearInterval(interval);
      };
    }
    function setActive(input) {
      if (state.active !== input) setState("active", input);
    }
    function add(input) {
      const url_ = normalizeServerUrl(input.http.url);
      if (!url_) return;
      const conn = {
        ...input,
        http: {
          ...input.http,
          url: url_
        }
      };
      return batch(() => {
        const existing = store.list.findIndex(x => url(x) === url_);
        if (existing !== -1) {
          setStore("list", existing, conn);
        } else {
          setStore("list", store.list.length, conn);
        }
        setState("active", ServerConnection.key(conn));
        return conn;
      });
    }
    function remove(key) {
      const list = store.list.filter(x => url(x) !== key);
      batch(() => {
        setStore("list", list);
        if (state.active === key) {
          const next = list[0];
          setState("active", next ? ServerConnection.Key.make(url(next)) : props.defaultServer);
        }
      });
    }
    const isReady = createMemo(() => ready() && !!state.active);
    const check = conn => checkServerHealth(conn.http).then(x => x.healthy);
    createEffect(() => {
      const current_ = current();
      if (!current_) return;
      if (props.disableHealthCheck) {
        setState("healthy", true);
        return;
      }
      setState("healthy", undefined);
      onCleanup(startHealthPolling(current_));
    });
    const origin = createMemo(() => projectsKey(state.active));
    const projectsList = createMemo(() => store.projects[origin()] ?? []);
    const current = createMemo(() => allServers().find(s => ServerConnection.key(s) === state.active) ?? allServers()[0]);
    const isLocal = createMemo(() => {
      const c = current();
      return c?.type === "sidecar" && c.variant === "base" || c?.type === "http" && isLocalHost(c.http.url);
    });
    return {
      ready: isReady,
      healthy,
      isLocal,
      get key() {
        return state.active;
      },
      get name() {
        return serverName(current());
      },
      get list() {
        return allServers();
      },
      get current() {
        return current();
      },
      setActive,
      add,
      remove,
      projects: {
        list: projectsList,
        open(directory) {
          const key = origin();
          if (!key) return;
          const current = store.projects[key] ?? [];
          if (current.find(x => x.worktree === directory)) return;
          setStore("projects", key, [{
            worktree: directory,
            expanded: true
          }, ...current]);
        },
        close(directory) {
          const key = origin();
          if (!key) return;
          const current = store.projects[key] ?? [];
          setStore("projects", key, current.filter(x => x.worktree !== directory));
        },
        expand(directory) {
          const key = origin();
          if (!key) return;
          const current = store.projects[key] ?? [];
          const index = current.findIndex(x => x.worktree === directory);
          if (index !== -1) setStore("projects", key, index, "expanded", true);
        },
        collapse(directory) {
          const key = origin();
          if (!key) return;
          const current = store.projects[key] ?? [];
          const index = current.findIndex(x => x.worktree === directory);
          if (index !== -1) setStore("projects", key, index, "expanded", false);
        },
        move(directory, toIndex) {
          const key = origin();
          if (!key) return;
          const current = store.projects[key] ?? [];
          const fromIndex = current.findIndex(x => x.worktree === directory);
          if (fromIndex === -1 || fromIndex === toIndex) return;
          const result = [...current];
          const [item] = result.splice(fromIndex, 1);
          result.splice(toIndex, 0, item);
          setStore("projects", key, result);
        },
        last() {
          const key = origin();
          if (!key) return;
          return store.lastProject[key];
        },
        touch(directory) {
          const key = origin();
          if (!key) return;
          setStore("lastProject", key, directory);
        }
      }
    };
  }
});