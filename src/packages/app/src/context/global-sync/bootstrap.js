/** @file Bootstrap routines and TanStack-Query option factories that load global and per-directory state (config, providers, paths, projects, agents, sessions, permissions, etc.) into the sync stores. */
import { showToast } from "@/lib/toast.js";
import { getFilename } from "core/util/path";
import { retry } from "core/util/retry";
import { batch } from "../../lib/reactivity.js";
import { reconcile } from "../../lib/store.js";
import { cmp, normalizeAgentList, normalizeProviderList } from "./utils.js";
import { formatServerError } from "@/utils/server-errors.js";
import { queryOptions, skipToken } from "../../lib/query/index.js";
import { loadMcpQuery } from "../global-sync.js";
/**
 * Resolve after the next paint (rAF + macrotask), or after a 50ms fallback timeout if rAF is unavailable.
 * Used to yield to the renderer before kicking off heavy bootstrap work.
 * @returns {Promise} Resolves once a frame has painted or the fallback fires.
 */
function waitForPaint() {
  return new Promise(resolve => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    const timer = setTimeout(finish, 50);
    if (typeof requestAnimationFrame !== "function") return;
    requestAnimationFrame(() => {
      setTimeout(() => {
        clearTimeout(timer);
        finish();
      }, 0);
    });
  });
}
/**
 * Extract the rejection reasons from an array of `Promise.allSettled` results.
 * @param {Array} list - Settled results from `Promise.allSettled`.
 * @returns {Array} The reasons of the rejected entries.
 */
function errors(list) {
  return list.filter(item => item.status === "rejected").map(item => item.reason);
}
const providerRev = new Map();
/**
 * Drop the provider-revision counter for a directory (used to discard stale provider loads).
 * @param {string} directory - Workspace directory key.
 * @returns {void}
 */
export function clearProviderRev(directory) {
  providerRev.delete(directory);
}
/**
 * Invoke each thunk in a list and await all of them, never rejecting.
 * @param {Array} list - Array of zero-arg functions returning promises.
 * @returns {Promise<Array>} Resolves to the `Promise.allSettled` results.
 */
function runAll(list) {
  return Promise.allSettled(list.map(item => item()));
}
/**
 * Show an error toast summarizing the first error and an optional "+N more" count, if any errors are present.
 * @param {Object} input - `{errors, title, translate, formatMoreCount}`.
 * @returns {void}
 */
function showErrors(input) {
  if (input.errors.length === 0) return;
  const message = formatServerError(input.errors[0], input.translate);
  const more = input.errors.length > 1 ? input.formatMoreCount(input.errors.length - 1) : "";
  showToast({
    variant: "error",
    title: input.title,
    description: message + more
  });
}
/**
 * Query options that fetch the global config (with retry), optionally applying a transform side-effect.
 * @param {Object} sdk - Global SDK client, or falsy to skip.
 * @param {Function} transform - Optional callback invoked with the raw response.
 * @returns {Object} Query options resolving to the config data.
 */
export const loadGlobalConfigQuery = (sdk, transform) => queryOptions({
  queryKey: ["config"],
  queryFn: sdk ? () => retry(() => sdk.global.config.get().then(x => {
    transform?.(x);
    return x.data;
  })) : skipToken
});
/**
 * Query options that fetch the project list (with retry), filtering out test worktrees and sorting by id.
 * @param {Object} sdk - Global SDK client, or falsy to skip.
 * @param {Function} transform - Optional callback applied to the filtered/sorted project list.
 * @returns {Object} Query options resolving to the project list.
 */
export const loadProjectsQuery = (sdk, transform) => queryOptions({
  queryKey: ["project"],
  queryFn: sdk ? () => retry(() => sdk.project.list().then(x => {
    return (x.data ?? []).filter(p => !!p?.id).filter(p => !!p.worktree && !p.worktree.includes("closedcode-test")).slice().sort((a, b) => cmp(a.id, b.id));
  }).then(transform)) : skipToken
});
/**
 * Bootstrap global-level state: fetch global config, providers, path and project list in parallel.
 * @param {Object} input - `{globalSDK, queryClient, setGlobalStore, requestFailedTitle, translate, formatMoreCount}`.
 * @returns {Promise} Resolves once all global queries have settled.
 */
export async function bootstrapGlobal(input) {
  const slow = [() => input.queryClient.fetchQuery(loadGlobalConfigQuery(input.globalSDK)), () => input.queryClient.fetchQuery(loadProvidersQuery(null, input.globalSDK)), () => input.queryClient.fetchQuery(loadPathQuery(null, input.globalSDK)), () => input.queryClient.fetchQuery(loadProjectsQuery(input.globalSDK, data => input.setGlobalStore("project", data ?? [])))];
  await runAll(slow);
  // showErrors({
  //   errors: errors(),
  //   title: input.requestFailedTitle,
  //   translate: input.translate,
  //   formatMoreCount: input.formatMoreCount,
  // })
}
/**
 * Group items (permissions/questions) into a map keyed by their `sessionID`.
 * @param {Array} input - Items each with `id` and `sessionID`.
 * @returns {Object} Map of sessionID to its array of items.
 */
function groupBySession(input) {
  return input.reduce((acc, item) => {
    if (!item?.id || !item.sessionID) return acc;
    const list = acc[item.sessionID];
    if (list) list.push(item);
    if (!list) acc[item.sessionID] = [item];
    return acc;
  }, {});
}
/**
 * Find the project id whose worktree (or one of its sandboxes) matches a directory.
 * @param {string} directory - Workspace directory.
 * @param {Array} projects - Project records to search.
 * @returns {string} The matching project id, or undefined.
 */
function projectID(directory, projects) {
  return projects.find(project => project.worktree === directory || project.sandboxes?.includes(directory))?.id;
}
/**
 * Insert or replace a session in the store's sorted session array, preserving id order.
 * @param {Function} setStore - Child store setter.
 * @param {Object} session - Session record to merge.
 * @returns {void}
 */
function mergeSession(setStore, session) {
  setStore("session", list => {
    const next = list.slice();
    const idx = next.findIndex(item => item.id >= session.id);
    if (idx === -1) return [...next, session];
    if (next[idx]?.id === session.id) {
      next[idx] = session;
      return next;
    }
    next.splice(idx, 0, session);
    return next;
  });
}
/**
 * Fetch and merge any sessions referenced by ids that are not already present in the store.
 * @param {Object} input - `{ids, store, setStore, sdk}`.
 * @returns {Promise} Resolves once all missing sessions have been fetched and merged.
 */
function warmSessions(input) {
  const known = new Set(input.store.session.map(item => item.id));
  const ids = [...new Set(input.ids)].filter(id => !!id && !known.has(id));
  if (ids.length === 0) return Promise.resolve();
  return Promise.all(ids.map(sessionID => retry(() => input.sdk.session.get({
    sessionID
  })).then(x => {
    const session = x.data;
    if (!session?.id) return;
    mergeSession(input.setStore, session);
  }))).then(() => undefined);
}
/**
 * Query options that fetch and normalize the provider list for a directory (with retry).
 * @param {string} directory - Workspace directory key (null for global scope).
 * @param {Object} sdk - SDK client, or falsy to skip.
 * @returns {Object} Query options resolving to the normalized provider list.
 */
export const loadProvidersQuery = (directory, sdk) => queryOptions({
  queryKey: [directory, "providers"],
  queryFn: sdk ? () => retry(() => sdk.provider.list().then(x => normalizeProviderList(x.data))) : skipToken
});
/**
 * Query options that fetch the agent list for a directory (with retry), optionally applying a transform side-effect.
 * @param {string} directory - Workspace directory key.
 * @param {Object} sdk - SDK client, or falsy to skip.
 * @param {Function} transform - Optional callback invoked with the raw response.
 * @returns {Object} Query options resolving to the agent data.
 */
export const loadAgentsQuery = (directory, sdk, transform) => queryOptions({
  queryKey: [directory, "agents"],
  queryFn: sdk ? () => retry(() => sdk.app.agents().then(x => {
    transform?.(x);
    return x.data;
  })) : skipToken
});
/**
 * Query options that fetch resolved path info for a directory (with retry), optionally applying a transform side-effect.
 * @param {string} directory - Workspace directory key (null for global scope).
 * @param {Object} sdk - SDK client, or falsy to skip.
 * @param {Function} transform - Optional callback invoked with the raw response.
 * @returns {Object} Query options resolving to the path data.
 */
export const loadPathQuery = (directory, sdk, transform) => queryOptions({
  queryKey: [directory, "path"],
  queryFn: sdk ? () => retry(() => sdk.path.get().then(async x => {
    transform?.(x);
    return x.data;
  })) : skipToken
});
/**
 * Bootstrap a single directory's child store: seed from global state, then load config, agents, sessions, vcs,
 * commands, permissions, questions, MCP and providers in parallel, surfacing errors via toast.
 * @param {Object} input - `{directory, global, sdk, store, setStore, vcsCache, loadSessions, translate, queryClient}`.
 * @returns {Promise} Resolves once the synchronous seeding finishes; the slow loads run in a detached async block.
 */
export async function bootstrapDirectory(input) {
  const loading = input.store.status !== "complete";
  const seededProject = projectID(input.directory, input.global.project);
  const seededPath = input.global.path.directory === input.directory ? input.global.path : undefined;
  if (seededProject) input.setStore("project", seededProject);
  if (seededPath) input.setStore("path", seededPath);
  if (Object.keys(input.store.config).length === 0 && Object.keys(input.global.config).length > 0) {
    input.setStore("config", reconcile(input.global.config, {
      merge: false
    }));
  }
  if (loading) input.setStore("status", "partial");
  const rev = (providerRev.get(input.directory) ?? 0) + 1;
  providerRev.set(input.directory, rev);
  (async () => {
    const slow = [() => Promise.resolve(input.loadSessions(input.directory)), () => input.queryClient.ensureQueryData(loadAgentsQuery(input.directory, input.sdk, x => input.setStore("agent", normalizeAgentList(x.data)))), () => retry(() => input.sdk.config.get().then(x => input.setStore("config", reconcile(x.data, {
      merge: false
    })))), () => retry(() => input.sdk.session.status().then(x => input.setStore("session_status", x.data))), !seededProject && (() => retry(() => input.sdk.project.current()).then(x => input.setStore("project", x.data.id))), !seededPath && (() => input.queryClient.ensureQueryData(loadPathQuery(input.directory, input.sdk, x => {
      const next = projectID(x.data?.directory ?? input.directory, input.global.project);
      if (next) input.setStore("project", next);
    }))), () => retry(() => input.sdk.vcs.get().then(x => {
      const next = x.data ?? input.store.vcs;
      input.setStore("vcs", next);
      if (next) input.vcsCache.setStore("value", next);
    })), () => retry(() => input.sdk.command.list().then(x => input.setStore("command", x.data ?? []))), () => retry(() => input.sdk.permission.list().then(x => {
      const ids = (x.data ?? []).map(perm => perm?.sessionID).filter(id => !!id);
      const grouped = groupBySession((x.data ?? []).filter(perm => !!perm?.id && !!perm.sessionID));
      return warmSessions({
        ids,
        store: input.store,
        setStore: input.setStore,
        sdk: input.sdk
      }).then(() => batch(() => {
        for (const sessionID of Object.keys(input.store.permission)) {
          if (grouped[sessionID]) continue;
          input.setStore("permission", sessionID, []);
        }
        for (const [sessionID, permissions] of Object.entries(grouped)) {
          input.setStore("permission", sessionID, reconcile(permissions.filter(p => !!p?.id).sort((a, b) => cmp(a.id, b.id)), {
            key: "id"
          }));
        }
      }));
    })), () => retry(() => input.sdk.question.list().then(x => {
      const ids = (x.data ?? []).map(question => question?.sessionID).filter(id => !!id);
      const grouped = groupBySession((x.data ?? []).filter(q => !!q?.id && !!q.sessionID));
      return warmSessions({
        ids,
        store: input.store,
        setStore: input.setStore,
        sdk: input.sdk
      }).then(() => batch(() => {
        for (const sessionID of Object.keys(input.store.question)) {
          if (grouped[sessionID]) continue;
          input.setStore("question", sessionID, []);
        }
        for (const [sessionID, questions] of Object.entries(grouped)) {
          input.setStore("question", sessionID, reconcile(questions.filter(q => !!q?.id).sort((a, b) => cmp(a.id, b.id)), {
            key: "id"
          }));
        }
      }));
    })), () => Promise.resolve(input.loadSessions(input.directory)), () => input.queryClient.fetchQuery(loadMcpQuery(input.directory, input.sdk)), () => input.queryClient.fetchQuery(loadProvidersQuery(input.directory, input.sdk)).catch(err => {
      const project = getFilename(input.directory);
      showToast({
        variant: "error",
        title: input.translate("toast.project.reloadFailed.title", {
          project
        }),
        description: formatServerError(err, input.translate)
      });
    })].filter(Boolean);
    await waitForPaint();
    const slowErrs = errors(await runAll(slow));
    if (slowErrs.length > 0) {
      console.error("Failed to finish bootstrap instance", slowErrs[0]);
      const project = getFilename(input.directory);
      showToast({
        variant: "error",
        title: input.translate("toast.project.reloadFailed.title", {
          project
        }),
        description: formatServerError(slowErrs[0], input.translate)
      });
    }
    if (loading && slowErrs.length === 0) input.setStore("status", "complete");
  })();
}