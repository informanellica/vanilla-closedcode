import { batch, createMemo } from "solid-js";
import { useMutation, useQueryClient } from "@/lib/query/index.js";
import { useParams } from "@/lib/router/index.js";
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

  const info = () => (params.id ? sync.session.get(params.id) : undefined);

  const fail = err => {
    showToast({
      variant: "error",
      title: language.t("common.requestFailed"),
      description: formatServerError(err, language.t)
    });
  };

  // ---- session list helpers -------------------------------------------------
  const merge = next =>
    sync.set("session", list => {
      const idx = list.findIndex(item => item.id === next.id);
      if (idx < 0) return list;
      const out = list.slice();
      out[idx] = next;
      return out;
    });
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

  const draft = id =>
    extractPromptFromParts(sync.data?.part?.[id] ?? [], {
      directory: sdk.directory,
      attachmentName: language.t("common.attachment")
    });

  const userMessages = () => {
    const id = params.id;
    if (!id) return [];
    return (sync.data?.message?.[id] ?? []).filter(m => m.role === "user");
  };

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

  const halt = sessionID =>
    busy(sessionID)
      ? sdk.client.session.abort({ sessionID }).catch(() => {})
      : Promise.resolve();

  // ---- git / VCS ------------------------------------------------------------
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
  const initGit = () => {
    if (gitMutation.isPending) return;
    gitMutation.mutate();
  };

  const vcsKey = () => [
    "session-vcs",
    sdk.directory,
    sync.data?.vcs?.branch ?? "",
    sync.data?.vcs?.default_branch ?? ""
  ];
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
  const refreshVcs = () => {
    if (refreshVcsTimer !== undefined) clearTimeout(refreshVcsTimer);
    refreshVcsTimer = setTimeout(() => {
      refreshVcsTimer = undefined;
      void queryClient.invalidateQueries({ queryKey: vcsKey() });
    }, 750);
  };
  const disposeRefreshVcs = () => {
    if (refreshVcsTimer !== undefined) clearTimeout(refreshVcsTimer);
  };

  // Listens for `file.watcher.updated` bus events and triggers a coalesced
  // refresh of the VCS diff query. Returns an unsubscribe.
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
  const followupBusy = sessionID =>
    followupMutation.isPending && followupMutation.variables?.sessionID === sessionID;
  const followupVariableId = () => followupMutation.variables?.id;

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
  const clearFollowupEdit = () => {
    const id = params.id;
    if (!id) return;
    setFollowup("edit", id, undefined);
  };
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
  const reverting = createMemo(() => revertMutation.isPending || restoreMutation.isPending);
  const restoring = createMemo(() =>
    restoreMutation.isPending ? restoreMutation.variables : undefined
  );
  const revert = input => {
    if (reverting()) return;
    return revertMutation.mutateAsync(input);
  };
  const restore = id => {
    if (!params.id || reverting()) return;
    return restoreMutation.mutateAsync(id);
  };

  // ---- undo / redo / compact (command palette) ------------------------------
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
  const shareSession = sessionID =>
    sdk.client.session
      .share({ sessionID })
      .then(res => res.data?.share?.url)
      .catch(() => undefined);
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
  const isAutoAcceptActive = () => {
    const sessionID = params.id;
    if (sessionID) return permission.isAutoAccepting(sessionID, sdk.directory);
    return permission.isAutoAcceptingDirectory(sdk.directory);
  };
  const toggleAutoAccept = () => {
    const sessionID = params.id;
    if (sessionID) permission.toggleAutoAccept(sessionID, sdk.directory);
    else permission.toggleAutoAcceptDirectory(sdk.directory);
    return sessionID
      ? permission.isAutoAccepting(sessionID, sdk.directory)
      : permission.isAutoAcceptingDirectory(sdk.directory);
  };

  // ---- fork -----------------------------------------------------------------
  const fork = (sessionID, messageID) =>
    sdk.client.session.fork({ sessionID, messageID });

  // ---- new-session worktree resolution --------------------------------------
  const projectRoot = () => sync.project?.worktree ?? sdk.directory;
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
