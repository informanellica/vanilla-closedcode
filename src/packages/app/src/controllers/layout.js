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

  const lruFor = directory => {
    const existing = prefetchedByDir.get(directory);
    if (existing) return existing;
    const created = new Set();
    prefetchedByDir.set(directory, created);
    return created;
  };
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
  const warm = (sessions, index) => {
    for (let offset = 1; offset <= PREFETCH_SPAN; offset++) {
      const next = sessions[index + offset];
      if (next) prefetchSession(next, offset === 1 ? "high" : "low");
      const prev = sessions[index - offset];
      if (prev) prefetchSession(prev, offset === 1 ? "high" : "low");
    }
  };

  // --- session helpers -----------------------------------------------------
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

  // List a workspace's root sessions (cross-session file search in dialog-select-file).
  const listSessions = directory =>
    globalSDK.client.session
      .list({
        directory,
        roots: true,
      })
      .then(x => (x.data ?? []).filter(s => !!s?.id))
      .catch(() => []);

  // List all of a workspace's sessions (used by the reset-workspace dialog).
  const listWorkspaceSessions = directory =>
    globalSDK.client.session
      .list({
        directory,
      })
      .then(x => x.data ?? [])
      .catch(() => []);

  // --- worktree CRUD -------------------------------------------------------
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

  // Load file status (dirty check) for a workspace directory.
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
