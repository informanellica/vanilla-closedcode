import { showToast } from "@/lib/toast.js";
import { base64Encode } from "core/util/encode";
import { Binary } from "core/util/binary";
import { useNavigate, useParams } from "../../lib/router/index.js";
import { batch } from "../../lib/reactivity.js";
import { useGlobalSync } from "@/context/global-sync.js";
import { useLanguage } from "@/context/language.js";
import { useLayout } from "@/context/layout.js";
import { useLocal } from "@/context/local.js";
import { usePermission } from "@/context/permission.js";
import { usePrompt } from "@/context/prompt.js";
import { useSDK } from "@/context/sdk.js";
import { useSync } from "@/context/sync.js";
import { Identifier } from "@/utils/id.js";
import { Worktree as WorktreeState } from "@/utils/worktree.js";
import { buildRequestParts } from "./build-request-parts.js";
import { setCursorPosition } from "./editor-dom.js";
import { formatServerError } from "@/utils/server-errors.js";
/** @file Prompt submission logic: sends a prompt/command/shell draft to a session (with optimistic UI and worktree handling) and exposes the submit/abort handlers used by the prompt input. */
const pending = new Map();
/**
 * Concatenate the text content of a prompt's parts into a single string.
 * @param {Array} prompt - The prompt parts.
 * @returns {string} The combined text content.
 */
const draftText = prompt => prompt.map(part => "content" in part ? part.content : "").join("");
/**
 * Select only the image parts from a prompt.
 * @param {Array} prompt - The prompt parts.
 * @returns {Array} The image parts.
 */
const draftImages = prompt => prompt.filter(part => part.type === "image");
/**
 * Send a prompt draft to a session, dispatching to a custom command when the text begins with a known
 * "/command", otherwise sending a prompt message with optimistic insertion and optional busy-status updates.
 * Awaits an optional `before` hook and can cancel before sending.
 * @param {Object} input - Send inputs: {client, sync, globalSync, draft, messageID, optimisticBusy, before}, where `draft` carries the sessionID, sessionDirectory, prompt, context, agent, model, and variant.
 * @returns {Promise<boolean>} Resolves true if the request was sent, false if cancelled by the `before` hook.
 */
export async function sendFollowupDraft(input) {
  const text = draftText(input.draft.prompt);
  const images = draftImages(input.draft.prompt);
  const [, setStore] = input.globalSync.child(input.draft.sessionDirectory);
  const setBusy = () => {
    if (!input.optimisticBusy) return;
    setStore("session_status", input.draft.sessionID, {
      type: "busy"
    });
  };
  const setIdle = () => {
    if (!input.optimisticBusy) return;
    setStore("session_status", input.draft.sessionID, {
      type: "idle"
    });
  };
  const wait = async () => {
    const ok = await input.before?.();
    if (ok === false) return false;
    return true;
  };
  const [head, ...tail] = text.split(" ");
  const cmd = head?.startsWith("/") ? head.slice(1) : undefined;
  if (cmd && input.sync.data?.command.find(item => item.name === cmd)) {
    setBusy();
    try {
      if (!(await wait())) {
        setIdle();
        return false;
      }
      await input.client.session.command({
        sessionID: input.draft.sessionID,
        command: cmd,
        arguments: tail.join(" "),
        agent: input.draft.agent,
        model: `${input.draft.model.providerID}/${input.draft.model.modelID}`,
        variant: input.draft.variant,
        parts: images.map(attachment => ({
          id: Identifier.ascending("part"),
          type: "file",
          mime: attachment.mime,
          url: attachment.dataUrl,
          filename: attachment.filename
        }))
      });
      return true;
    } catch (err) {
      setIdle();
      throw err;
    }
  }
  const messageID = input.messageID ?? Identifier.ascending("message");
  const {
    requestParts,
    optimisticParts
  } = buildRequestParts({
    prompt: input.draft.prompt,
    context: input.draft.context,
    images,
    text,
    sessionID: input.draft.sessionID,
    messageID,
    sessionDirectory: input.draft.sessionDirectory
  });
  const message = {
    id: messageID,
    sessionID: input.draft.sessionID,
    role: "user",
    time: {
      created: Date.now()
    },
    agent: input.draft.agent,
    model: {
      ...input.draft.model,
      variant: input.draft.variant
    }
  };
  const add = () => input.sync.session.optimistic.add({
    directory: input.draft.sessionDirectory,
    sessionID: input.draft.sessionID,
    message,
    parts: optimisticParts
  });
  const remove = () => input.sync.session.optimistic.remove({
    directory: input.draft.sessionDirectory,
    sessionID: input.draft.sessionID,
    messageID
  });
  batch(() => {
    setBusy();
    add();
  });
  try {
    if (!(await wait())) {
      batch(() => {
        setIdle();
        remove();
      });
      return false;
    }
    await input.client.session.promptAsync({
      sessionID: input.draft.sessionID,
      agent: input.draft.agent,
      model: input.draft.model,
      messageID,
      parts: requestParts,
      variant: input.draft.variant
    });
    return true;
  } catch (err) {
    batch(() => {
      setIdle();
      remove();
    });
    throw err;
  }
}
/**
 * Build the prompt submit/abort handlers, wiring together routing, SDK, sync, layout, permission, and prompt
 * context. Handles new-session creation (including worktree selection), shell/command/prompt dispatch,
 * optimistic message insertion, queueing, and error recovery.
 * @param {Object} input - Handler inputs and accessors: callbacks (onAbort, onSubmit, onQueue, onNewSessionWorktreeReset), state accessors (imageAttachments, mode, commentCount, working, info, autoAccept, newSessionWorktree, shouldQueue, editor), and helpers (addToHistory, resetHistoryNavigation, setMode, setPopover, promptLength, queueScroll).
 * @returns {Object} An object with `abort` (cancel the in-flight prompt) and `handleSubmit` (form submit handler).
 */
export function createPromptSubmit(input) {
  const navigate = useNavigate();
  const sdk = useSDK();
  const sync = useSync();
  const globalSync = useGlobalSync();
  const local = useLocal();
  const permission = usePermission();
  const prompt = usePrompt();
  const layout = useLayout();
  const language = useLanguage();
  const params = useParams();
  /**
   * Extract a human-readable message from an error/response, falling back to a localized generic message.
   * @param {*} err - The thrown error or error-shaped response.
   * @returns {string} A message string suitable for a toast.
   */
  const errorMessage = err => {
    if (err && typeof err === "object" && "data" in err) {
      const data = err.data;
      if (data?.message) return data.message;
    }
    if (err instanceof Error) return err.message;
    return language.t("common.requestFailed");
  };
  /**
   * Abort the current session's in-flight work: clear its todo list, cancel a queued (pending worktree)
   * send if present, otherwise ask the server to abort.
   * @returns {Promise<void>} Resolves once the abort has been issued.
   */
  const abort = async () => {
    const sessionID = params.id;
    if (!sessionID) return Promise.resolve();
    globalSync.todo.set(sessionID, []);
    const [, setStore] = globalSync.child(sdk.directory);
    setStore("todo", sessionID, []);
    input.onAbort?.();
    const queued = pending.get(sessionID);
    if (queued) {
      queued.abort.abort();
      queued.cleanup();
      pending.delete(sessionID);
      return Promise.resolve();
    }
    return sdk.client.session.abort({
      sessionID
    }).catch(() => {});
  };
  /**
   * Re-add review-comment context items to the prompt (used to restore state after a failed send).
   * @param {Array} items - The comment context items to restore.
   * @returns {void}
   */
  const restoreCommentItems = items => {
    for (const item of items) {
      prompt.context.add({
        type: "file",
        path: item.path,
        selection: item.selection,
        comment: item.comment,
        commentID: item.commentID,
        commentOrigin: item.commentOrigin,
        preview: item.preview
      });
    }
  };
  /**
   * Remove the given comment context items from the prompt by key.
   * @param {Array} items - The comment context items to remove.
   * @returns {void}
   */
  const removeCommentItems = items => {
    for (const item of items) {
      prompt.context.remove(item.key);
    }
  };
  /**
   * Remove all items currently in the prompt context.
   * @returns {void}
   */
  const clearContext = () => {
    for (const item of prompt.context.items()) {
      prompt.context.remove(item.key);
    }
  };
  /**
   * Insert or update a newly created session in the directory's sync store, keeping the list sorted by id.
   * @param {string} dir - The session directory whose store is updated.
   * @param {Object} info - The session info to seed.
   * @returns {void}
   */
  const seed = (dir, info) => {
    const [, setStore] = globalSync.child(dir);
    setStore("session", list => {
      const result = Binary.search(list, info.id, item => item.id);
      const next = [...list];
      if (result.found) {
        next[result.index] = info;
        return next;
      }
      next.splice(result.index, 0, info);
      return next;
    });
  };
  /**
   * Form submit handler for the prompt input. Validates the prompt, records history, resolves the target
   * session (creating one and an optional worktree for new sessions), then dispatches the input as a shell
   * command, custom slash command, queued draft, or prompt message with optimistic UI and error recovery.
   * @param {Event} event - The submit event.
   * @returns {Promise<void>} Resolves once the submission flow completes (or short-circuits).
   */
  const handleSubmit = async event => {
    event.preventDefault();
    const currentPrompt = prompt.current();
    const text = currentPrompt.map(part => "content" in part ? part.content : "").join("");
    const images = input.imageAttachments().slice();
    const mode = input.mode();
    if (text.trim().length === 0 && images.length === 0 && input.commentCount() === 0) {
      if (input.working()) void abort();
      return;
    }
    const currentModel = local.model.current();
    const currentAgent = local.agent.current();
    const variant = local.model.variant.current();
    if (!currentModel || !currentAgent) {
      showToast({
        title: language.t("prompt.toast.modelAgentRequired.title"),
        description: language.t("prompt.toast.modelAgentRequired.description")
      });
      return;
    }
    input.addToHistory(currentPrompt, mode);
    input.resetHistoryNavigation();
    const projectDirectory = sdk.directory;
    const isNewSession = !params.id;
    const shouldAutoAccept = isNewSession && input.autoAccept();
    const worktreeSelection = input.newSessionWorktree?.() || "main";
    let sessionDirectory = projectDirectory;
    let client = sdk.client;
    if (isNewSession) {
      if (worktreeSelection === "create") {
        const createdWorktree = await client.worktree.create({
          directory: projectDirectory
        }).then(x => x.data).catch(err => {
          showToast({
            title: language.t("prompt.toast.worktreeCreateFailed.title"),
            description: errorMessage(err)
          });
          return undefined;
        });
        if (!createdWorktree?.directory) {
          showToast({
            title: language.t("prompt.toast.worktreeCreateFailed.title"),
            description: language.t("common.requestFailed")
          });
          return;
        }
        WorktreeState.pending(createdWorktree.directory);
        sessionDirectory = createdWorktree.directory;
      }
      if (worktreeSelection !== "main" && worktreeSelection !== "create") {
        sessionDirectory = worktreeSelection;
      }
      if (sessionDirectory !== projectDirectory) {
        client = sdk.createClient({
          directory: sessionDirectory,
          throwOnError: true
        });
        globalSync.child(sessionDirectory);
      }
      input.onNewSessionWorktreeReset?.();
    }
    let session = input.info();
    if (!session && isNewSession) {
      const created = await client.session.create().then(x => x.data ?? undefined).catch(err => {
        showToast({
          title: language.t("prompt.toast.sessionCreateFailed.title"),
          description: errorMessage(err)
        });
        return undefined;
      });
      if (created) {
        seed(sessionDirectory, created);
        session = created;
        if (shouldAutoAccept) permission.enableAutoAccept(session.id, sessionDirectory);
        local.session.promote(sessionDirectory, session.id);
        layout.handoff.setTabs(base64Encode(sessionDirectory), session.id);
        navigate(`/${base64Encode(sessionDirectory)}/session/${session.id}`);
      }
    }
    if (!session) {
      showToast({
        title: language.t("prompt.toast.promptSendFailed.title"),
        description: language.t("prompt.toast.promptSendFailed.description")
      });
      return;
    }
    const model = {
      modelID: currentModel.id,
      providerID: currentModel.provider.id
    };
    const agent = currentAgent.name;
    const context = prompt.context.items().slice();
    const draft = {
      sessionID: session.id,
      sessionDirectory,
      prompt: currentPrompt,
      context,
      agent,
      model,
      variant
    };
    /**
     * Reset the prompt editor to an empty normal-mode state with no popover.
     * @returns {void}
     */
    const clearInput = () => {
      prompt.reset();
      input.setMode("normal");
      input.setPopover(null);
    };
    /**
     * Restore the editor to the just-submitted prompt and mode (used after a failed send), refocusing and
     * placing the caret at the end on the next frame.
     * @returns {void}
     */
    const restoreInput = () => {
      prompt.set(currentPrompt, input.promptLength(currentPrompt));
      input.setMode(mode);
      input.setPopover(null);
      requestAnimationFrame(() => {
        const editor = input.editor();
        if (!editor) return;
        editor.focus();
        setCursorPosition(editor, input.promptLength(currentPrompt));
        input.queueScroll();
      });
    };
    if (!isNewSession && mode === "normal" && input.shouldQueue?.()) {
      input.onQueue?.(draft);
      clearContext();
      clearInput();
      return;
    }
    input.onSubmit?.();
    if (mode === "shell") {
      clearInput();
      client.session.shell({
        sessionID: session.id,
        agent,
        model,
        command: text
      }).catch(err => {
        showToast({
          title: language.t("prompt.toast.shellSendFailed.title"),
          description: errorMessage(err)
        });
        restoreInput();
      });
      return;
    }
    if (text.startsWith("/")) {
      const [cmdName, ...args] = text.split(" ");
      const commandName = cmdName.slice(1);
      const customCommand = sync.data?.command.find(c => c.name === commandName);
      if (customCommand) {
        clearInput();
        client.session.command({
          sessionID: session.id,
          command: commandName,
          arguments: args.join(" "),
          agent,
          model: `${model.providerID}/${model.modelID}`,
          variant,
          parts: images.map(attachment => ({
            id: Identifier.ascending("part"),
            type: "file",
            mime: attachment.mime,
            url: attachment.dataUrl,
            filename: attachment.filename
          }))
        }).catch(err => {
          showToast({
            title: language.t("prompt.toast.commandSendFailed.title"),
            description: formatServerError(err, language.t, language.t("common.requestFailed"))
          });
          restoreInput();
        });
        return;
      }
    }
    const commentItems = context.filter(item => item.type === "file" && !!item.comment?.trim());
    const messageID = Identifier.ascending("message");
    /**
     * Remove the optimistic user message previously inserted for this submission.
     * @returns {void}
     */
    const removeOptimisticMessage = () => {
      sync.session.optimistic.remove({
        directory: sessionDirectory,
        sessionID: session.id,
        messageID
      });
    };
    removeCommentItems(commentItems);
    clearInput();
    /**
     * Block until a pending worktree for the session directory is ready, racing against abort and a 5-minute
     * timeout. Registers a cancellable pending entry and, on failure/cancel, restores the input and context.
     * @returns {Promise<boolean>} Resolves true when the worktree is ready, false if the wait was aborted; throws on failure/timeout.
     */
    const waitForWorktree = async () => {
      const worktree = WorktreeState.get(sessionDirectory);
      if (!worktree || worktree.status !== "pending") return true;
      if (sessionDirectory === projectDirectory) {
        sync.set("session_status", session.id, {
          type: "busy"
        });
      }
      const controller = new AbortController();
      const cleanup = () => {
        if (sessionDirectory === projectDirectory) {
          sync.set("session_status", session.id, {
            type: "idle"
          });
        }
        removeOptimisticMessage();
        restoreCommentItems(commentItems);
        restoreInput();
      };
      pending.set(session.id, {
        abort: controller,
        cleanup
      });
      const abortWait = new Promise(resolve => {
        if (controller.signal.aborted) {
          resolve({
            status: "failed",
            message: "aborted"
          });
          return;
        }
        controller.signal.addEventListener("abort", () => {
          resolve({
            status: "failed",
            message: "aborted"
          });
        }, {
          once: true
        });
      });
      const timeoutMs = 5 * 60 * 1000;
      const timer = {
        id: undefined
      };
      const timeout = new Promise(resolve => {
        timer.id = window.setTimeout(() => {
          resolve({
            status: "failed",
            message: language.t("workspace.error.stillPreparing")
          });
        }, timeoutMs);
      });
      const result = await Promise.race([WorktreeState.wait(sessionDirectory), abortWait, timeout]).finally(() => {
        if (timer.id === undefined) return;
        clearTimeout(timer.id);
      });
      pending.delete(session.id);
      if (controller.signal.aborted) return false;
      if (result.status === "failed") throw new Error(result.message);
      return true;
    };
    void sendFollowupDraft({
      client,
      sync,
      globalSync,
      draft,
      messageID,
      optimisticBusy: sessionDirectory === projectDirectory,
      before: waitForWorktree
    }).catch(err => {
      pending.delete(session.id);
      if (sessionDirectory === projectDirectory) {
        sync.set("session_status", session.id, {
          type: "idle"
        });
      }
      showToast({
        title: language.t("prompt.toast.promptSendFailed.title"),
        description: errorMessage(err)
      });
      removeOptimisticMessage();
      restoreCommentItems(commentItems);
      restoreInput();
    });
  };
  return {
    abort,
    handleSubmit
  };
}