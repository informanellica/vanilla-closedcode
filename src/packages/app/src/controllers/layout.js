/** @file Layout controller (MVC): orchestrates workspace-navigation business logic spanning worktree, session and project SDK domains (prefetch/cache, worktree CRUD, session helpers). */
import { batch, createEffect, untrack } from "../lib/reactivity.js";
import { produce, reconcile } from "../lib/store.js";
import { base64Encode } from "core/util/encode";
import { Binary } from "core/util/binary";
import { retry } from "core/util/retry";
import { useGlobalSDK } from "@/context/global-sdk.js";
import { useGlobalSync } from "@/context/global-sync.js";
import { useLayout } from "@/context/layout.js";
import { useServer } from "@/context/server.js";
import { useNotification } from "@/context/notification.js";
import { usePermission } from "@/context/permission.js";
import { useCommand } from "@/context/command.js";
import { clearWorkspaceTerminals } from "@/context/terminal.js";
import { dropSessionCaches, pickSessionCacheEvictions } from "@/context/global-sync/session-cache.js";
import { clearSessionPrefetchInflight, clearSessionPrefetch, getSessionPrefetch, isSessionPrefetchCurrent, runSessionPrefetch, setSessionPrefetch, shouldSkipSessionPrefetch } from "@/context/global-sync/session-prefetch.js";
import { pathKey } from "@/utils/path-key.js";
import { Worktree as WorktreeState } from "@/utils/worktree.js";
import { effectiveWorkspaceOrder, errorMessage } from "@/pages/layout/helpers.js";

const PREFETCH_CHUNK = 200;
const PREFETCH_CONCURRENCY = 2;
const PREFETCH_PENDING_LIMIT = 10;
const PREFETCH_SPAN = 4;
const PREFETCH_MAX_SESSIONS_PER_DIR = 10;

/**
 * Merge two id-keyed item arrays, with `incoming` winning on id collisions, and
 * return a new array sorted ascending by id.
 * @param {Array} current - The existing items.
 * @param {Array} incoming - The items to merge in (override on id match).
 * @returns {Array} A new array of merged items sorted by id.
 */
const mergeByID = (current, incoming) => {
  if (current.length === 0) {
    return incoming.slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }
  const map = new Map();
  for (const item of current) {
    map.set(item.id, item);
  }
  for (const item of incoming) {
    map.set(item.id, item);
  }
  return [...map.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
};

/**
 * useLayoutController orchestrates the workspace-navigation business logic that
 * spans the worktree + session + project SDK domains. It owns:
 *   - session message prefetch / cache eviction orchestration
 *   - worktree CRUD (create / delete / reset workspace)
 *   - session listing / archiving helpers (including cross-session file search)
 *
 * It depends only on the Model (@/context/*) and the SDK; it imports no View
 * components and no @/bs/* or @/vendor/ui. The View owns its persisted/page
 * stores, refs, dialogs and navigation primitives, and passes the needed
 * reactive accessors/setters in via `deps`.
 *
 * @param {object} deps View-provided reactive scope bindings.
 *   params, navigate, platform, showToast, toaster,
 *   store, setStore, currentDir, currentProject, visibleSessionDirs, route,
 *   setBusy, scrollToSession, navigateWithSidebarReset, clearSidebarHoverState,
 *   setWorkspaceName.
 */
export function useLayoutController(deps) {
  const globalSDK = useGlobalSDK();
  const globalSync = useGlobalSync();
  const layout = useLayout();
  const server = useServer();
  const notification = useNotification();
  const permission = usePermission();
  const command = useCommand();

  const {
    params,
    navigate,
    platform,
    showToast,
    toaster,
    language,
    store,
    setStore,
    currentDir,
    currentProject,
    visibleSessionDirs,
    route,
    setBusy,
    navigateWithSidebarReset,
    clearSidebarHoverState,
    setWorkspaceName,
    clearLastProjectSession,
    projectRoot,
  } = deps;

  // --- prefetch / cache orchestration -------------------------------------
  const prefetchToken = { value: 0 };
  const prefetchQueues = new Map();
  const prefetchedByDir = new Map();

  /**
   * Get (creating if needed) the per-directory LRU set tracking prefetched session ids.
   * @param {string} directory - The workspace directory key.
   * @returns {Set} The directory's prefetched-session id set.
   */
  const lruFor = directory => {
    const existing = prefetchedByDir.get(directory);
    if (existing) return existing;
    const created = new Set();
    prefetchedByDir.set(directory, created);
    return created;
  };
  /**
   * Record a session as prefetched in its directory's LRU and return session ids
   * that should be evicted to stay within the per-directory cache limit.
   * @param {string} directory - The workspace directory key.
   * @param {string} sessionID - The session id just prefetched (kept).
   * @returns {Array} The session ids selected for eviction.
   */
  const markPrefetched = (directory, sessionID) => {
    const lru = lruFor(directory);
    return pickSessionCacheEvictions({
      seen: lru,
      keep: sessionID,
      limit: PREFETCH_MAX_SESSIONS_PER_DIR,
      preserve: params.id && pathKey(directory) === pathKey(currentDir()) ? [params.id] : undefined,
    });
  };
  // The prefetch eviction effects only run when the workspace-navigation View
  // (the layout page) wires `visibleSessionDirs`. Lightweight consumers (e.g.
  // dialog-select-file) reuse only the session-listing helpers and skip these.
  if (visibleSessionDirs) {
    createEffect(() => {
      const active = new Set(visibleSessionDirs());
      for (const directory of prefetchedByDir.keys()) {
        if (active.has(directory)) continue;
        prefetchedByDir.delete(directory);
      }
    });
    createEffect(() => {
      route();
      globalSDK.url;
      prefetchToken.value += 1;
      clearSessionPrefetchInflight();
      prefetchQueues.clear();
    });
    createEffect(() => {
      const visible = new Set(visibleSessionDirs());
      for (const [directory, q] of prefetchQueues) {
        if (visible.has(directory)) continue;
        q.pending.length = 0;
        q.pendingSet.clear();
        if (q.running === 0) prefetchQueues.delete(directory);
      }
    });
  }
  /**
   * Get (creating if needed) the per-directory prefetch queue holding inflight,
   * pending and running bookkeeping.
   * @param {string} directory - The workspace directory key.
   * @returns {Object} The directory's prefetch queue record.
   */
  const queueFor = directory => {
    const existing = prefetchQueues.get(directory);
    if (existing) return existing;
    const created = {
      inflight: new Set(),
      pending: [],
      pendingSet: new Set(),
      running: 0,
    };
    prefetchQueues.set(directory, created);
    return created;
  };
  /**
   * Fetch a session's first chunk of messages/parts and merge them into the
   * directory's global-sync store, evicting stale cached sessions as needed.
   * Bails silently if the prefetch token/revision is no longer current.
   * @param {string} directory - The workspace directory key.
   * @param {string} sessionID - The session to prefetch.
   * @param {number} token - The prefetch generation token captured at enqueue time.
   * @returns {Promise} Resolves once the prefetch (and merge) completes.
   */
  async function prefetchMessages(directory, sessionID, token) {
    const [store, setStore] = globalSync.child(directory, {
      bootstrap: false,
    });
    return runSessionPrefetch({
      directory,
      sessionID,
      task: rev =>
        retry(() =>
          globalSDK.client.session.messages({
            directory,
            sessionID,
            limit: PREFETCH_CHUNK,
          }),
        )
          .then(messages => {
            if (prefetchToken.value !== token) return;
            if (!isSessionPrefetchCurrent(directory, sessionID, rev)) return;
            const items = (messages.data ?? []).filter(x => !!x?.info?.id);
            const next = items.map(x => x.info).filter(m => !!m?.id);
            const sorted = mergeByID([], next);
            const stale = markPrefetched(directory, sessionID);
            const cursor = messages.response.headers.get("x-next-cursor") ?? undefined;
            const meta = {
              limit: sorted.length,
              cursor,
              complete: !cursor,
              at: Date.now(),
            };
            if (stale.length > 0) {
              clearSessionPrefetch(directory, stale);
              for (const id of stale) {
                globalSync.todo.set(id, undefined);
              }
            }
            const current = store.message[sessionID] ?? [];
            const merged = mergeByID(current.filter(item => !!item?.id), sorted);
            if (!isSessionPrefetchCurrent(directory, sessionID, rev)) return;
            batch(() => {
              if (stale.length > 0) {
                setStore(
                  produce(draft => {
                    dropSessionCaches(draft, stale);
                  }),
                );
              }
              setStore("message", sessionID, reconcile(merged, {
                key: "id",
              }));
              setSessionPrefetch({
                directory,
                sessionID,
                ...meta,
              });
              for (const message of items) {
                const currentParts = store.part[message.info.id] ?? [];
                const mergedParts = mergeByID(currentParts.filter(item => !!item?.id), message.parts.filter(item => !!item?.id));
                setStore("part", message.info.id, reconcile(mergedParts, {
                  key: "id",
                }));
              }
            });
            return meta;
          })
          .catch(() => undefined),
    });
  }
  /**
   * Drain the directory's pending prefetch queue while under the concurrency
   * limit, scheduling the next session and re-pumping when each completes.
   * @param {string} directory - The workspace directory key.
   */
  const pumpPrefetch = directory => {
    const q = queueFor(directory);
    if (q.running >= PREFETCH_CONCURRENCY) return;
    const sessionID = q.pending.shift();
    if (!sessionID) return;
    q.pendingSet.delete(sessionID);
    q.inflight.add(sessionID);
    q.running += 1;
    const token = prefetchToken.value;
    void prefetchMessages(directory, sessionID, token).finally(() => {
      q.running -= 1;
      q.inflight.delete(sessionID);
      pumpPrefetch(directory);
    });
  };
  /**
   * Enqueue a session for message prefetch (skipping already-cached/inflight
   * sessions), respecting per-directory limits; "high" priority jumps the queue.
   * @param {Object} session - The session record (needs `id` and `directory`).
   * @param {string} priority - "high" or "low" (default "low").
   */
  const prefetchSession = (session, priority = "low") => {
    const directory = session.directory;
    if (!directory) return;
    const [store] = globalSync.child(directory, {
      bootstrap: false,
    });
    const cached = untrack(() => {
      const info = getSessionPrefetch(directory, session.id);
      return shouldSkipSessionPrefetch({
        message: store.message[session.id] !== undefined,
        info,
        chunk: PREFETCH_CHUNK,
      });
    });
    if (cached) return;
    const q = queueFor(directory);
    if (q.inflight.has(session.id)) return;
    if (q.pendingSet.has(session.id)) {
      if (priority !== "high") return;
      const index = q.pending.indexOf(session.id);
      if (index > 0) {
        q.pending.splice(index, 1);
        q.pending.unshift(session.id);
      }
      return;
    }
    const lru = lruFor(directory);
    const known = lru.has(session.id);
    if (!known && lru.size >= PREFETCH_MAX_SESSIONS_PER_DIR && priority !== "high") return;
    if (priority === "high") q.pending.unshift(session.id);
    if (priority !== "high") q.pending.push(session.id);
    q.pendingSet.add(session.id);
    while (q.pending.length > PREFETCH_PENDING_LIMIT) {
      const dropped = q.pending.pop();
      if (!dropped) continue;
      q.pendingSet.delete(dropped);
    }
    pumpPrefetch(directory);
  };
  /**
   * Prefetch the sessions neighbouring a given index (within PREFETCH_SPAN),
   * prioritizing the immediate neighbours.
   * @param {Array} sessions - The ordered session list.
   * @param {number} index - The index of the focused session.
   */
  const warm = (sessions, index) => {
    for (let offset = 1; offset <= PREFETCH_SPAN; offset++) {
      const next = sessions[index + offset];
      if (next) prefetchSession(next, offset === 1 ? "high" : "low");
      const prev = sessions[index - offset];
      if (prev) prefetchSession(prev, offset === 1 ? "high" : "low");
    }
  };

  // --- session helpers -----------------------------------------------------
  /**
   * Archive a session (sets its archived time), remove it from the directory's
   * store, and navigate away to an adjacent session if it was the active one.
   * @param {Object} session - The session record (needs `id` and `directory`).
   * @returns {Promise} Resolves once the update + navigation completes.
   */
  async function archiveSession(session) {
    const [store, setStore] = globalSync.child(session.directory);
    const sessions = store.session ?? [];
    const index = sessions.findIndex(s => s.id === session.id);
    const nextSession = sessions[index + 1] ?? sessions[index - 1];
    await globalSDK.client.session.update({
      directory: session.directory,
      sessionID: session.id,
      time: {
        archived: Date.now(),
      },
    });
    setStore(
      produce(draft => {
        const match = Binary.search(draft.session, session.id, s => s.id);
        if (match.found) draft.session.splice(match.index, 1);
      }),
    );
    if (session.id === params.id) {
      if (nextSession) {
        navigate(`/${params.dir}/session/${nextSession.id}`);
      } else {
        navigate(`/${params.dir}/session`);
      }
    }
  }

  /**
   * List a workspace's root sessions (cross-session file search in dialog-select-file).
   * @param {string} directory - The workspace directory.
   * @returns {Promise<Array>} The root sessions (empty array on failure).
   */
  const listSessions = directory =>
    globalSDK.client.session
      .list({
        directory,
        roots: true,
      })
      .then(x => (x.data ?? []).filter(s => !!s?.id))
      .catch(() => []);

  /**
   * List all of a workspace's sessions (used by the reset-workspace dialog).
   * @param {string} directory - The workspace directory.
   * @returns {Promise<Array>} All sessions (empty array on failure).
   */
  const listWorkspaceSessions = directory =>
    globalSDK.client.session
      .list({
        directory,
      })
      .then(x => x.data ?? [])
      .catch(() => []);

  // --- worktree CRUD -------------------------------------------------------
  /**
   * Create a new worktree workspace for a project, register its name/order/expanded
   * state, and navigate into it. Surfaces a toast on failure.
   * @param {Object} project - The project (needs `id` and `worktree`).
   * @returns {Promise} Resolves once creation + navigation completes (no-op on failure).
   */
  const createWorkspace = async project => {
    clearSidebarHoverState();
    const created = await globalSDK.client.worktree
      .create({
        directory: project.worktree,
      })
      .then(x => x.data)
      .catch(err => {
        showToast({
          title: language.t("workspace.create.failed.title"),
          description: errorMessage(err, language.t("common.requestFailed")),
        });
        return undefined;
      });
    if (!created?.directory) return;
    setWorkspaceName(created.directory, created.branch, project.id, created.branch);
    const local = project.worktree;
    const key = pathKey(created.directory);
    const root = pathKey(local);
    setBusy(created.directory, true);
    WorktreeState.pending(created.directory);
    setStore("workspaceExpanded", key, true);
    if (key !== created.directory) {
      setStore("workspaceExpanded", created.directory, true);
    }
    setStore("workspaceOrder", project.worktree, prev => {
      const existing = prev ?? [];
      const next = existing.filter(item => {
        const id = pathKey(item);
        return id !== root && id !== key;
      });
      return [created.directory, ...next];
    });
    globalSync.child(created.directory);
    navigateWithSidebarReset(`/${base64Encode(created.directory)}/session`);
  };

  /**
   * Remove a workspace worktree (never the project root), updating project
   * sandboxes/order/expansion and navigating away if the deleted workspace was active.
   * @param {string} root - The project root directory.
   * @param {string} directory - The workspace directory to delete.
   * @param {boolean} leaveDeletedWorkspace - When true, skip the pre-emptive navigate-away (default false).
   * @returns {Promise} Resolves once removal completes (no-op on root or failure).
   */
  const deleteWorkspace = async (root, directory, leaveDeletedWorkspace = false) => {
    if (directory === root) return;
    const current = currentDir();
    const currentKey = pathKey(current);
    const deletedKey = pathKey(directory);
    const shouldLeave = leaveDeletedWorkspace || (!!params.dir && currentKey === deletedKey);
    if (!leaveDeletedWorkspace && shouldLeave) {
      navigateWithSidebarReset(`/${base64Encode(root)}/session`);
    }
    setBusy(directory, true);
    const result = await globalSDK.client.worktree
      .remove({
        directory: root,
        worktreeRemoveInput: {
          directory,
        },
      })
      .then(x => x.data)
      .catch(err => {
        showToast({
          title: language.t("workspace.delete.failed.title"),
          description: errorMessage(err, language.t("common.requestFailed")),
        });
        return false;
      });
    setBusy(directory, false);
    if (!result) return;
    if (pathKey(store.lastProjectSession[root]?.directory ?? "") === pathKey(directory)) {
      clearLastProjectSession(root);
    }
    globalSync.set(
      "project",
      produce(draft => {
        const project = draft.find(item => item.worktree === root);
        if (!project) return;
        project.sandboxes = (project.sandboxes ?? []).filter(sandbox => sandbox !== directory);
      }),
    );
    setStore("workspaceOrder", root, order => (order ?? []).filter(workspace => workspace !== directory));
    layout.projects.close(directory);
    layout.projects.open(root);
    if (shouldLeave) return;
    const nextCurrent = currentDir();
    const nextKey = pathKey(nextCurrent);
    const project = layout.projects.list().find(item => item.worktree === root);
    const dirs = project ? effectiveWorkspaceOrder(root, [root, ...(project.sandboxes ?? [])], store.workspaceOrder[root]) : [root];
    const valid = dirs.some(item => pathKey(item) === nextKey);
    if (params.dir && projectRoot(nextCurrent) === root && !valid) {
      navigateWithSidebarReset(`/${base64Encode(root)}/session`);
    }
  };

  /**
   * Reset a workspace worktree (never the project root): clears its terminals,
   * disposes the instance, resets the worktree, archives its sessions, and shows
   * progress/result toasts.
   * @param {string} root - The project root directory.
   * @param {string} directory - The workspace directory to reset.
   * @returns {Promise} Resolves once the reset flow completes (no-op on root or failure).
   */
  const resetWorkspace = async (root, directory) => {
    if (directory === root) return;
    setBusy(directory, true);
    const progress = showToast({
      persistent: true,
      title: language.t("workspace.resetting.title"),
      description: language.t("workspace.resetting.description"),
    });
    const dismiss = () => toaster.dismiss(progress);
    const sessions = await globalSDK.client.session
      .list({
        directory,
      })
      .then(x => x.data ?? [])
      .catch(() => []);
    clearWorkspaceTerminals(directory, sessions.map(s => s.id), platform);
    await globalSDK.client.instance
      .dispose({
        directory,
      })
      .catch(() => undefined);
    const result = await globalSDK.client.worktree
      .reset({
        directory: root,
        worktreeResetInput: {
          directory,
        },
      })
      .then(x => x.data)
      .catch(err => {
        showToast({
          title: language.t("workspace.reset.failed.title"),
          description: errorMessage(err, language.t("common.requestFailed")),
        });
        return false;
      });
    if (!result) {
      setBusy(directory, false);
      dismiss();
      return;
    }
    const archivedAt = Date.now();
    await Promise.all(
      sessions
        .filter(session => session.time.archived === undefined)
        .map(session =>
          globalSDK.client.session
            .update({
              sessionID: session.id,
              directory: session.directory,
              time: {
                archived: archivedAt,
              },
            })
            .catch(() => undefined),
        ),
    );
    setBusy(directory, false);
    dismiss();
    showToast({
      title: language.t("workspace.reset.success.title"),
      description: language.t("workspace.reset.success.description"),
      actions: [
        {
          label: language.t("command.session.new"),
          onClick: () => {
            const href = `/${base64Encode(directory)}/session`;
            navigate(href);
            layout.mobileSidebar.hide();
          },
        },
        {
          label: language.t("common.dismiss"),
          onClick: "dismiss",
        },
      ],
    });
  };

  /**
   * Load file status (dirty check) for a workspace directory.
   * @param {string} directory - The workspace directory.
   * @returns {Promise<Array>} The file status entries.
   */
  const fileStatus = directory =>
    globalSDK.client.file
      .status({
        directory,
      })
      .then(x => x.data ?? []);

  return {
    // model / sdk accessors the View still needs
    notification,
    permission,
    command,
    // prefetch orchestration
    prefetchSession,
    warm,
    // session helpers
    archiveSession,
    listSessions,
    listWorkspaceSessions,
    fileStatus,
    // worktree CRUD
    createWorkspace,
    deleteWorkspace,
    resetWorkspace,
  };
}
