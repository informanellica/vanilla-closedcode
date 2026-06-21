/** @file Session controller (MVC) hook: owns session lifecycle mutations and SDK orchestration (revert/restore, followups, VCS diff, share, title/delete/archive, auto-accept, fork, worktree resolution) for a single session/directory. */
import { batch, createMemo } from "../lib/reactivity.js";
import { useMutation, useQueryClient } from "../lib/query/index.js";
import { useParams } from "../lib/router/index.js";
import { useSDK } from "@/context/sdk.js";
import { useGlobalSDK } from "@/context/global-sdk.js";
import { useSync } from "@/context/sync.js";
import { useGlobalSync } from "@/context/global-sync.js";
import { usePrompt } from "@/context/prompt.js";
import { useFile } from "@/context/file.js";
import { usePermission } from "@/context/permission.js";
import { useLanguage } from "@/context/language.js";
import { showToast } from "@/lib/toast.js";
import { formatServerError } from "@/utils/server-errors.js";
import { Identifier } from "@/utils/id.js";
import { extractPromptFromParts } from "@/utils/prompt.js";
import { findLast } from "core/util/array";
import { diffs as listDiffs } from "@/utils/diffs.js";
import { sendFollowupDraft } from "@/components/prompt-input/submit.js";

/**
 * Session controller (MVC).
 *
 * Owns session lifecycle mutations and SDK orchestration scoped to a single
 * session/directory: revert/unrevert/restore, followup queue mutations,
 * halt/abort, VCS diff query helpers + initGit + VCS event listeners, file.read
 * for diff review, fork, share/unshare/summarize, title/delete/archive
 * mutations, auto-accept toggles, and worktree-vs-root resolution.
 *
 * Depends only on the Model (`@/context/*`) and the SDK. It MUST NOT import View
 * components or `@/bs/*` / `@/vendor/ui` (no DOM/markup). The hook is invoked by
 * a View within its reactive setup scope; context hooks resolve from the
 * provider tree at that point.
 *
 * Note: prompt submission (composer send/abort/command/promptAsync,
 * createClient) intentionally lives in the session-composer controller.
 *
 * @param {object} [options]
 * @param {() => any} [options.followupStore] accessor for the persisted followup store (View-owned)
 * @param {(...args: any[]) => void} [options.setFollowup] setter for the persisted followup store
 * @param {() => boolean} [options.composerBlocked] accessor reflecting composer block state
 * @param {() => boolean} [options.isChildSession] accessor reflecting whether the active session has a parent
 * @param {() => void} [options.resumeScroll] View callback run after a manual followup send
 * @returns {Object} Derived state accessors, helpers, and action functions covering git/VCS orchestration, followups, revert/restore/undo/redo/summarize, share/unshare, title/delete/archive, auto-accept, fork, and worktree resolution.
 */
export function useSessionController(options = {}) {
  const params = useParams();
  const sdk = useSDK();
  const globalSDK = useGlobalSDK();
  const sync = useSync();
  const globalSync = useGlobalSync();
  const prompt = usePrompt();
  const file = useFile();
  const permission = usePermission();
  const language = useLanguage();
  const queryClient = useQueryClient();

  /**
   * Accessor for the active session record from the sync store.
   *
   * @returns {Object} The current session info, or undefined when no route session id is set.
   */
  const info = () => (params.id ? sync.session.get(params.id) : undefined);

  /**
   * Shows an error toast describing a failed request.
   *
   * @param {*} err - The error to format and surface.
   * @returns {void}
   */
  const fail = err => {
    showToast({
      variant: "error",
      title: language.t("common.requestFailed"),
      description: formatServerError(err, language.t)
    });
  };

  // ---- session list helpers -------------------------------------------------
  /**
   * Replaces a session in the sync session list with an updated record.
   *
   * @param {Object} next - The updated session record (matched by id).
   * @returns {*} The result of the sync.set update.
   */
  const merge = next =>
    sync.set("session", list => {
      const idx = list.findIndex(item => item.id === next.id);
      if (idx < 0) return list;
      const out = list.slice();
      out[idx] = next;
      return out;
    });
  /**
   * Sets the optimistic revert marker on a session in the sync list.
   *
   * @param {string} sessionID - The session id to update.
   * @param {Object} next - The revert state to apply to the session record.
   * @returns {*} The result of the sync.set update.
   */
  const roll = (sessionID, next) =>
    sync.set("session", list => {
      const idx = list.findIndex(item => item.id === sessionID);
      if (idx < 0) return list;
      const out = list.slice();
      out[idx] = {
        ...out[idx],
        revert: next
      };
      return out;
    });

  /**
   * Builds a prompt draft from the stored message parts for a message id.
   *
   * @param {string} id - The message id whose parts to reconstruct into a prompt.
   * @returns {*} The extracted prompt value for the message.
   */
  const draft = id =>
    extractPromptFromParts(sync.data?.part?.[id] ?? [], {
      directory: sdk.directory,
      attachmentName: language.t("common.attachment")
    });

  /**
   * Returns the user-role messages for the active session.
   *
   * @returns {Array} The list of user messages, or an empty array when no session is active.
   */
  const userMessages = () => {
    const id = params.id;
    if (!id) return [];
    return (sync.data?.message?.[id] ?? []).filter(m => m.role === "user");
  };

  /**
   * Whether a session is currently busy (non-idle status or an incomplete
   * assistant message).
   *
   * @param {string} sessionID - The session id to check.
   * @returns {boolean} True when the session is actively working.
   */
  const busy = sessionID => {
    if (
      (sync.data?.session_status?.[sessionID] ?? {
        type: "idle"
      }).type !== "idle"
    )
      return true;
    return (sync.data?.message?.[sessionID] ?? []).some(
      item => item.role === "assistant" && typeof item.time.completed !== "number"
    );
  };

  /**
   * Aborts an in-flight session run if it is busy; otherwise resolves immediately.
   *
   * @param {string} sessionID - The session id to halt.
   * @returns {Promise} Resolves once the abort (or no-op) completes.
   */
  const halt = sessionID =>
    busy(sessionID)
      ? sdk.client.session.abort({ sessionID }).catch(() => {})
      : Promise.resolve();

  // ---- git / VCS ------------------------------------------------------------
  /**
   * Inserts or updates a project record in the global sync project list,
   * keeping it sorted by id, and marks it as the active project.
   *
   * @param {Object} next - The project record to upsert (matched/sorted by id).
   * @returns {void}
   */
  const upsert = next => {
    const list = globalSync.data.project;
    sync.set("project", next.id);
    const idx = list.findIndex(item => item.id === next.id);
    if (idx >= 0) {
      globalSync.set(
        "project",
        list.map((item, i) => (i === idx ? { ...item, ...next } : item))
      );
      return;
    }
    const at = list.findIndex(item => item.id > next.id);
    if (at >= 0) {
      globalSync.set("project", [...list.slice(0, at), next, ...list.slice(at)]);
      return;
    }
    globalSync.set("project", [...list, next]);
  };

  const gitMutation = useMutation(() => ({
    mutationFn: () => sdk.client.project.initGit(),
    onSuccess: x => {
      if (!x.data) return;
      upsert(x.data);
    },
    onError: err => fail(err)
  }));
  /**
   * Initializes a Git repository for the active project (no-op while pending).
   *
   * @returns {void}
   */
  const initGit = () => {
    if (gitMutation.isPending) return;
    gitMutation.mutate();
  };

  /**
   * Builds the query-cache key for the VCS diff, scoped to directory and branch.
   *
   * @returns {Array} The query key array used for the VCS diff cache.
   */
  const vcsKey = () => [
    "session-vcs",
    sdk.directory,
    sync.data?.vcs?.branch ?? "",
    sync.data?.vcs?.default_branch ?? ""
  ];
  /**
   * Loads and normalizes the VCS diff for a given mode.
   *
   * @param {string} mode - The diff mode (e.g. "git" or "branch").
   * @returns {Promise<Array>} The parsed diff list, or an empty array on failure.
   */
  const queryVcsDiff = mode =>
    sdk.client.vcs
      .diff({ mode })
      .then(result => listDiffs(result.data))
      .catch(error => {
        console.debug("[session-review] failed to load vcs diff", { mode, error });
        return [];
      });

  // file.watcher fires once per touched file. With heavy diff projects
  // (thousands of dirty files), a single tool edit can produce hundreds of
  // events; invalidating the diff query per event causes the sidecar to
  // re-run a full /vcs/diff scan on every fire, which streams hundreds of
  // batched bus events back into the renderer and visibly blocks chat input.
  // Coalesce into a single trailing-edge refresh per 750ms quiet period.
  let refreshVcsTimer;
  /**
   * Schedules a coalesced (trailing-edge, 750ms quiet period) invalidation of
   * the VCS diff query to avoid stampeding refreshes under heavy file churn.
   *
   * @returns {void}
   */
  const refreshVcs = () => {
    if (refreshVcsTimer !== undefined) clearTimeout(refreshVcsTimer);
    refreshVcsTimer = setTimeout(() => {
      refreshVcsTimer = undefined;
      void queryClient.invalidateQueries({ queryKey: vcsKey() });
    }, 750);
  };
  /**
   * Cancels any pending coalesced VCS refresh timer (cleanup on dispose).
   *
   * @returns {void}
   */
  const disposeRefreshVcs = () => {
    if (refreshVcsTimer !== undefined) clearTimeout(refreshVcsTimer);
  };

  // Listens for `file.watcher.updated` bus events and triggers a coalesced
  // refresh of the VCS diff query. Returns an unsubscribe.
  /**
   * Subscribes to `file.watcher.updated` bus events and triggers a coalesced
   * VCS diff refresh (ignoring `.git/` paths).
   *
   * @returns {Function} An unsubscribe function that stops listening.
   */
  const listenVcsWatcher = () =>
    sdk.event.listen(evt => {
      if (evt.details.type !== "file.watcher.updated") return;
      const props =
        typeof evt.details.properties === "object" && evt.details.properties
          ? evt.details.properties
          : undefined;
      const file = typeof props?.file === "string" ? props.file : undefined;
      if (!file || file.startsWith(".git/")) return;
      refreshVcs();
    });

  // Server-side `/vcs/diff` returns file metadata immediately and computes
  // patches in a worker_thread, publishing `vcs.file-diff.ready` in batches
  // of up to 16 (or every 100ms) so the renderer doesn't have to re-render
  // once per file. Merge each batch into the cached vcsQuery data so the
  // review tab fills in inline diffs incrementally. Returns an unsubscribe.
  /**
   * Subscribes to batched `vcs.file-diff.ready` bus events and merges each
   * incoming patch batch into the cached VCS diff query data so inline diffs
   * fill in incrementally.
   *
   * @returns {Function} An unsubscribe function that stops listening.
   */
  const listenVcsFileDiff = () =>
    sdk.event.listen(evt => {
      if (evt.details.type !== "vcs.file-diff.ready") return;
      const props =
        typeof evt.details.properties === "object" && evt.details.properties
          ? evt.details.properties
          : undefined;
      if (!props || !Array.isArray(props.files) || props.files.length === 0) return;
      const target = props.mode;
      if (target !== "git" && target !== "branch") return;
      const updates = new Map();
      for (const item of props.files) {
        if (!item || typeof item.file !== "string" || typeof item.patch !== "string")
          continue;
        updates.set(item.file, {
          file: item.file,
          patch: item.patch,
          additions: typeof item.additions === "number" ? item.additions : 0,
          deletions: typeof item.deletions === "number" ? item.deletions : 0,
          status: typeof item.status === "string" ? item.status : undefined
        });
      }
      if (updates.size === 0) return;
      const key = [...vcsKey(), target];
      queryClient.setQueryData(key, existing => {
        const current = Array.isArray(existing) ? existing : [];
        const seen = new Set();
        const next = current.map(entry => {
          const incoming = entry?.file ? updates.get(entry.file) : undefined;
          if (!incoming) return entry;
          seen.add(entry.file);
          return {
            ...entry,
            patch: incoming.patch,
            additions: incoming.additions,
            deletions: incoming.deletions,
            status: incoming.status ?? entry.status
          };
        });
        for (const [file, incoming] of updates) {
          if (seen.has(file)) continue;
          // Event arrived before vcsQuery resolved; append for now and
          // subsequent batches will replace in place.
          next.push(incoming);
        }
        return next;
      });
    });

  /**
   * Reads a file's content via the SDK for diff review.
   *
   * @param {string} path - The file path to read.
   * @returns {Promise} Resolves with the file data, or undefined on failure.
   */
  const readFile = path =>
    sdk.client.file
      .read({ path })
      .then(x => x.data)
      .catch(error => {
        console.debug("[session-review] failed to read file", { path, error });
        return undefined;
      });

  // ---- followups ------------------------------------------------------------
  const followupStore = options.followupStore;
  const setFollowup = options.setFollowup;
  const resumeScroll = options.resumeScroll ?? (() => {});

  const followupMutation = useMutation(() => ({
    mutationFn: async input => {
      const item = (followupStore().items[input.sessionID] ?? []).find(
        entry => entry.id === input.id
      );
      if (!item) return;
      if (input.manual) setFollowup("paused", input.sessionID, undefined);
      setFollowup("failed", input.sessionID, undefined);
      const ok = await sendFollowupDraft({
        client: sdk.client,
        sync,
        globalSync,
        draft: item,
        optimisticBusy: item.sessionDirectory === sdk.directory
      }).catch(err => {
        setFollowup("failed", input.sessionID, input.id);
        fail(err);
        return false;
      });
      if (!ok) return;
      setFollowup("items", input.sessionID, items =>
        (items ?? []).filter(entry => entry.id !== input.id)
      );
      if (input.manual) resumeScroll();
    }
  }));
  /**
   * Whether a followup send is currently in flight for the given session.
   *
   * @param {string} sessionID - The session id to check.
   * @returns {boolean} True when a followup mutation is pending for that session.
   */
  const followupBusy = sessionID =>
    followupMutation.isPending && followupMutation.variables?.sessionID === sessionID;
  /**
   * The id of the followup draft currently being sent, if any.
   *
   * @returns {string} The in-flight followup draft id, or undefined.
   */
  const followupVariableId = () => followupMutation.variables?.id;

  /**
   * Queues a new followup draft for a session and clears its failed/paused flags.
   *
   * @param {Object} draftInput - The followup draft to enqueue; must include sessionID.
   * @returns {void}
   */
  const queueFollowup = draftInput => {
    setFollowup("items", draftInput.sessionID, items => [
      ...(items ?? []),
      {
        id: Identifier.ascending("message"),
        ...draftInput
      }
    ]);
    setFollowup("failed", draftInput.sessionID, undefined);
    setFollowup("paused", draftInput.sessionID, undefined);
  };
  /**
   * Sends a queued followup draft for a session (skips child sessions and
   * already-busy sends).
   *
   * @param {string} sessionID - The session id owning the draft.
   * @param {string} id - The followup draft id to send.
   * @param {Object} opts - Send options; opts.manual marks a user-initiated send.
   * @returns {Promise} Resolves when the send completes (or immediately when skipped).
   */
  const sendFollowup = (sessionID, id, opts) => {
    if (sync.session.get(sessionID)?.parentID) return Promise.resolve();
    const item = (followupStore().items[sessionID] ?? []).find(entry => entry.id === id);
    if (!item) return Promise.resolve();
    if (followupBusy(sessionID)) return Promise.resolve();
    return followupMutation.mutateAsync({
      sessionID,
      id,
      manual: opts?.manual
    });
  };
  /**
   * Moves a queued followup draft into the editable composer slot for the
   * active session (removes it from the queue).
   *
   * @param {string} id - The followup draft id to edit.
   * @param {Array} queued - The current list of queued followup drafts.
   * @returns {void}
   */
  const editFollowup = (id, queued) => {
    const sessionID = params.id;
    if (!sessionID) return;
    if (followupBusy(sessionID)) return;
    const item = queued.find(entry => entry.id === id);
    if (!item) return;
    setFollowup("items", sessionID, items =>
      (items ?? []).filter(entry => entry.id !== id)
    );
    setFollowup("failed", sessionID, value => (value === id ? undefined : value));
    setFollowup("edit", sessionID, {
      id: item.id,
      prompt: item.prompt,
      context: item.context
    });
  };
  /**
   * Clears the active session's editable followup slot.
   *
   * @returns {void}
   */
  const clearFollowupEdit = () => {
    const id = params.id;
    if (!id) return;
    setFollowup("edit", id, undefined);
  };
  /**
   * Pauses automatic followup sending for the active session.
   *
   * @returns {void}
   */
  const pauseFollowup = () => {
    const id = params.id;
    if (!id) return;
    setFollowup("paused", id, true);
  };

  // ---- revert / restore -----------------------------------------------------
  const revertMutation = useMutation(() => ({
    mutationFn: async input => {
      const prev = prompt.current().slice();
      const last = info()?.revert;
      const value = draft(input.messageID);
      batch(() => {
        roll(input.sessionID, {
          messageID: input.messageID
        });
        prompt.set(value);
      });
      await halt(input.sessionID)
        .then(() => sdk.client.session.revert(input))
        .then(result => {
          if (result.data) merge(result.data);
        })
        .catch(err => {
          batch(() => {
            roll(input.sessionID, last);
            prompt.set(prev);
          });
          fail(err);
        });
    }
  }));
  const restoreMutation = useMutation(() => ({
    mutationFn: async id => {
      const sessionID = params.id;
      if (!sessionID) return;
      const next = userMessages().find(item => item.id > id);
      const prev = prompt.current().slice();
      const last = info()?.revert;
      batch(() => {
        roll(sessionID, next ? { messageID: next.id } : undefined);
        if (next) {
          prompt.set(draft(next.id));
          return;
        }
        prompt.reset();
      });
      const task = !next
        ? halt(sessionID).then(() => sdk.client.session.unrevert({ sessionID }))
        : halt(sessionID).then(() =>
            sdk.client.session.revert({
              sessionID,
              messageID: next.id
            })
          );
      await task
        .then(result => {
          if (result.data) merge(result.data);
        })
        .catch(err => {
          batch(() => {
            roll(sessionID, last);
            prompt.set(prev);
          });
          fail(err);
        });
    }
  }));
  /**
   * Whether a revert or restore mutation is currently pending.
   *
   * @returns {boolean} True while reverting or restoring.
   */
  const reverting = createMemo(() => revertMutation.isPending || restoreMutation.isPending);
  /**
   * The message id currently being restored, if a restore is in flight.
   *
   * @returns {*} The restore mutation variables (message id) while pending, otherwise undefined.
   */
  const restoring = createMemo(() =>
    restoreMutation.isPending ? restoreMutation.variables : undefined
  );
  /**
   * Reverts the session to a given message (no-op while another revert/restore
   * is in flight).
   *
   * @param {Object} input - Revert input (sessionID and messageID).
   * @returns {Promise} Resolves when the revert completes, or undefined when skipped.
   */
  const revert = input => {
    if (reverting()) return;
    return revertMutation.mutateAsync(input);
  };
  /**
   * Restores the next message after a reverted one (no-op without an active
   * session or while reverting).
   *
   * @param {string} id - The reverted message id to restore past.
   * @returns {Promise} Resolves when the restore completes, or undefined when skipped.
   */
  const restore = id => {
    if (!params.id || reverting()) return;
    return restoreMutation.mutateAsync(id);
  };

  // ---- undo / redo / compact (command palette) ------------------------------
  /**
   * Undoes the last user message: aborts any active run, reverts to the prior
   * user message, restores its prompt, and updates the active message marker.
   *
   * @param {Function} setActiveMessage - Setter to mark the new active (previous) message.
   * @param {Function} status - Accessor returning the current session status object.
   * @returns {Promise<void>} Resolves when the undo completes.
   */
  const undo = async (setActiveMessage, status) => {
    const sessionID = params.id;
    if (!sessionID) return;
    if (status().type !== "idle") {
      await sdk.client.session.abort({ sessionID }).catch(() => {});
    }
    const revertMessageID = info()?.revert?.messageID;
    const message = findLast(userMessages(), x => !revertMessageID || x.id < revertMessageID);
    if (!message) return;
    await sdk.client.session.revert({
      sessionID,
      messageID: message.id
    });
    const parts = sync.data?.part?.[message.id];
    if (parts) {
      const restored = extractPromptFromParts(parts, {
        directory: sdk.directory
      });
      prompt.set(restored);
    }
    const prev = findLast(userMessages(), x => x.id < message.id);
    setActiveMessage(prev);
  };
  /**
   * Redoes a previously undone message: moves the revert pointer forward (or
   * unreverts) and updates the active message marker.
   *
   * @param {Function} setActiveMessage - Setter to mark the new active message.
   * @returns {Promise<void>} Resolves when the redo completes.
   */
  const redo = async setActiveMessage => {
    const sessionID = params.id;
    if (!sessionID) return;
    const revertMessageID = info()?.revert?.messageID;
    if (!revertMessageID) return;
    const next = userMessages().find(x => x.id > revertMessageID);
    if (!next) {
      await sdk.client.session.unrevert({ sessionID });
      prompt.reset();
      const last = findLast(userMessages(), x => x.id >= revertMessageID);
      setActiveMessage(last);
      return;
    }
    await sdk.client.session.revert({
      sessionID,
      messageID: next.id
    });
    const prev = findLast(userMessages(), x => x.id < next.id);
    setActiveMessage(prev);
  };
  /**
   * Compacts/summarizes the active session using the given model.
   *
   * @param {Object} model - The model to summarize with (must have id and provider.id).
   * @returns {Promise<void>} Resolves when the summarize request completes.
   */
  const summarize = async model => {
    const sessionID = params.id;
    if (!sessionID || !model) return;
    await sdk.client.session.summarize({
      sessionID,
      modelID: model.id,
      providerID: model.provider.id
    });
  };

  // ---- share / unshare (clipboard, command palette) -------------------------
  /**
   * Shares a session and resolves with its public share URL.
   *
   * @param {string} sessionID - The session id to share.
   * @returns {Promise} Resolves with the share URL, or undefined on failure.
   */
  const shareSession = sessionID =>
    sdk.client.session
      .share({ sessionID })
      .then(res => res.data?.share?.url)
      .catch(() => undefined);
  /**
   * Unshares a previously shared session.
   *
   * @param {string} sessionID - The session id to unshare.
   * @returns {Promise} Resolves when the unshare completes.
   */
  const unshareSession = sessionID =>
    sdk.client.session.unshare({ sessionID });

  // ---- timeline header (share/unshare/title/delete/archive) -----------------
  const timelineShareMutation = useMutation(() => ({
    mutationFn: id =>
      globalSDK.client.session.share({
        sessionID: id,
        directory: sdk.directory
      }),
    onError: err => {
      console.error("Failed to share session", err);
    }
  }));
  const timelineUnshareMutation = useMutation(() => ({
    mutationFn: id =>
      globalSDK.client.session.unshare({
        sessionID: id,
        directory: sdk.directory
      }),
    onError: err => {
      console.error("Failed to unshare session", err);
    }
  }));

  // ---- auto-accept ----------------------------------------------------------
  /**
   * Whether auto-accept is active for the current session (or directory when
   * no session is active).
   *
   * @returns {boolean} True when permissions are auto-accepted in the current scope.
   */
  const isAutoAcceptActive = () => {
    const sessionID = params.id;
    if (sessionID) return permission.isAutoAccepting(sessionID, sdk.directory);
    return permission.isAutoAcceptingDirectory(sdk.directory);
  };
  /**
   * Toggles auto-accept for the current session (or directory when no session
   * is active) and returns the new state.
   *
   * @returns {boolean} The auto-accept state after toggling.
   */
  const toggleAutoAccept = () => {
    const sessionID = params.id;
    if (sessionID) permission.toggleAutoAccept(sessionID, sdk.directory);
    else permission.toggleAutoAcceptDirectory(sdk.directory);
    return sessionID
      ? permission.isAutoAccepting(sessionID, sdk.directory)
      : permission.isAutoAcceptingDirectory(sdk.directory);
  };

  // ---- fork -----------------------------------------------------------------
  /**
   * Forks a new session from a given message.
   *
   * @param {string} sessionID - The source session id.
   * @param {string} messageID - The message id to fork from.
   * @returns {Promise} Resolves when the fork completes.
   */
  const fork = (sessionID, messageID) =>
    sdk.client.session.fork({ sessionID, messageID });

  // ---- new-session worktree resolution --------------------------------------
  /**
   * The project's root worktree path (falls back to the SDK directory).
   *
   * @returns {string} The project root directory.
   */
  const projectRoot = () => sync.project?.worktree ?? sdk.directory;
  /**
   * Whether the active directory is a non-root worktree of the project.
   *
   * @returns {boolean} True when the SDK directory differs from the project's main worktree.
   */
  const isWorktree = () => {
    const project = sync.project;
    if (!project) return false;
    return sdk.directory !== project.worktree;
  };

  return {
    // derived state accessors
    info,
    vcsKey,
    gitPending: () => gitMutation.isPending,
    reverting,
    restoring,
    followupBusy,
    followupVariableId,
    timelineSharePending: () => timelineShareMutation.isPending,
    timelineUnsharePending: () => timelineUnshareMutation.isPending,

    // helpers
    fail,
    draft,
    busy,
    halt,
    merge,

    // session lifecycle: create a fresh empty session (used by the "+" tab so a
    // new tab maps to a real session id immediately, not a transient blank).
    createSession: () => sdk.client.session.create().then(x => x.data ?? undefined),

    // list ALL sessions for a directory (used by the history popup's "load more"
    // to reach sessions beyond the synced/trimmed working set).
    listSessions: directory => sdk.client.session.list({ directory }).then(x => x.data ?? []),

    // git / vcs orchestration
    initGit,
    queryVcsDiff,
    refreshVcs,
    disposeRefreshVcs,
    listenVcsWatcher,
    listenVcsFileDiff,
    readFile,

    // followups
    queueFollowup,
    sendFollowup,
    editFollowup,
    clearFollowupEdit,
    pauseFollowup,

    // revert / restore
    revert,
    restore,
    undo,
    redo,
    summarize,

    // share / unshare
    shareSession,
    unshareSession,
    timelineShare: id => timelineShareMutation.mutate(id),
    timelineUnshare: id => timelineUnshareMutation.mutate(id),

    // title / delete / archive
    updateTitle: (sessionID, title) =>
      sdk.client.session.update({ sessionID, title }),
    archiveSession: sessionID =>
      sdk.client.session.update({
        sessionID,
        time: { archived: Date.now() }
      }),
    deleteSession: sessionID => sdk.client.session.delete({ sessionID }),

    // auto-accept
    isAutoAcceptActive,
    toggleAutoAccept,

    // fork
    fork,

    // new-session worktree resolution
    projectRoot,
    isWorktree
  };
}
