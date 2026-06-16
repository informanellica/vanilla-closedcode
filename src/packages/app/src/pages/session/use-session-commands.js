/** @file Registers the session page's command-palette commands and their handlers. */
import { createComponent } from "../../lib/reactivity.js";
import { useNavigate } from "../../lib/router/index.js";
import { useCommand } from "@/context/command.js";
import { env } from "@/lib/env.js";
import { useDialog } from "@/lib/dialog.js";
import { previewSelectedLines } from "@/vendor/ui/pierre/selection-bridge.js";
import { useFile, selectionFromLines } from "@/context/file.js";
import { useLanguage } from "@/context/language.js";
import { useLayout } from "@/context/layout.js";
import { useLocal } from "@/context/local.js";
import { usePlatform } from "@/context/platform.js";
import { usePrompt } from "@/context/prompt.js";
import { useSettings } from "@/context/settings.js";
import { useSync } from "@/context/sync.js";
import { useTerminal } from "@/context/terminal.js";
import { showToast } from "@/lib/toast.js";
import { createSessionTabs } from "@/pages/session/helpers.js";
import { useSessionLayout } from "@/pages/session/session-layout.js";
import { useSessionController } from "@/controllers/session.js";
import { useProviders } from "../../hooks/use-providers.js";
/**
 * Build a helper that tags command-palette options with a fixed category label.
 * @param {string} category - The category label to attach to each option.
 * @returns {Function} A function that takes an option and returns a copy with the category set.
 */
const withCategory = category => {
  return option => ({
    ...option,
    category
  });
};
/**
 * Register all session-scoped command-palette commands (session, share, file, context,
 * view, terminal, message, model, MCP, agent and permissions actions) for the active session.
 * @param {Object} actions - Session view actions used by the commands.
 * @param {Function} actions.review - Review-panel state/accessor used to derive tab state.
 * @param {Function} actions.navigateMessageByOffset - Moves the active message by a relative offset.
 * @param {Function} actions.setActiveMessage - Sets the active message.
 * @param {Function} actions.focusInput - Focuses the prompt input.
 * @returns {void}
 */
export const useSessionCommands = actions => {
  const command = useCommand();
  const dialog = useDialog();
  const providers = useProviders();
  const file = useFile();
  const language = useLanguage();
  const local = useLocal();
  const platform = usePlatform();
  const prompt = usePrompt();
  const settings = useSettings();
  const sync = useSync();
  const terminal = useTerminal();
  const layout = useLayout();
  const navigate = useNavigate();
  const controller = useSessionController();
  const {
    params,
    tabs,
    view
  } = useSessionLayout();
  /**
   * Get the current session record, or undefined when no session is active.
   * @returns {Object} The session data, or undefined.
   */
  const info = () => {
    const id = params.id;
    if (!id) return;
    return sync.session.get(id);
  };
  /**
   * Whether a review panel is available for the current session.
   * @returns {boolean} True when a session id is present.
   */
  const hasReview = () => !!params.id;
  /**
   * Normalize a tab id, mapping file:// tabs through the file context.
   * @param {string} tab - The tab identifier.
   * @returns {string} The normalized tab identifier.
   */
  const normalizeTab = tab => {
    if (!tab.startsWith("file://")) return tab;
    return file.tab(tab);
  };
  const tabState = createSessionTabs({
    tabs,
    pathFromTab: file.pathFromTab,
    normalizeTab,
    review: actions.review,
    hasReview
  });
  const activeFileTab = tabState.activeFileTab;
  const closableTab = tabState.closableTab;
  const shown = () => platform.platform !== "desktop" || env("VITE_CLOSEDCODE_CHANNEL") !== "beta" || settings.general.showFileTree();
  const idle = {
    type: "idle"
  };
  const status = () => sync.data?.session_status?.[params.id ?? ""] ?? idle;
  /**
   * Get all messages for the current session.
   * @returns {Array} The session's messages, or an empty array when no session is active.
   */
  const messages = () => {
    const id = params.id;
    if (!id) return [];
    return sync.data?.message?.[id] ?? [];
  };
  /**
   * Get the current session's user messages.
   * @returns {Array} The user-role messages.
   */
  const userMessages = () => messages().filter(m => m.role === "user");
  /**
   * Get the user messages that are still visible given any active revert point.
   * @returns {Array} The user messages preceding the revert marker (or all of them).
   */
  const visibleUserMessages = () => {
    const revert = info()?.revert?.messageID;
    if (!revert) return userMessages();
    return userMessages().filter(m => m.id < revert);
  };
  const showAllFiles = () => {
    if (layout.fileTree.tab() !== "changes") return;
    layout.fileTree.setTab("all");
  };
  /**
   * Build a preview of the selected lines of a file for use as context.
   * @param {string} path - The file path.
   * @param {Object} selection - The selection with startLine and endLine.
   * @returns {string} The preview text, or undefined when the file content is unavailable.
   */
  const selectionPreview = (path, selection) => {
    const content = file.get(path)?.content?.content;
    if (!content) return undefined;
    return previewSelectedLines(content, {
      start: selection.startLine,
      end: selection.endLine
    });
  };
  /**
   * Add a file selection (with preview) to the prompt context.
   * @param {string} path - The file path.
   * @param {Object} selection - The selection range to attach.
   * @returns {void}
   */
  const addSelectionToContext = (path, selection) => {
    const preview = selectionPreview(path, selection);
    prompt.context.add({
      type: "file",
      path,
      selection,
      preview
    });
  };
  /**
   * Whether the active file tab has a line selection that can be added to context.
   * @returns {boolean} True when a selection is available to add.
   */
  const canAddSelectionContext = () => {
    const tab = activeFileTab();
    if (!tab) return false;
    const path = file.pathFromTab(tab);
    if (!path) return false;
    return file.selectedLines(path) != null;
  };
  const navigateMessageByOffset = actions.navigateMessageByOffset;
  const setActiveMessage = actions.setActiveMessage;
  const focusInput = actions.focusInput;
  const sessionCommand = withCategory(language.t("command.category.session"));
  const fileCommand = withCategory(language.t("command.category.file"));
  const contextCommand = withCategory(language.t("command.category.context"));
  const viewCommand = withCategory(language.t("command.category.view"));
  const terminalCommand = withCategory(language.t("command.category.terminal"));
  const modelCommand = withCategory(language.t("command.category.model"));
  const mcpCommand = withCategory(language.t("command.category.mcp"));
  const agentCommand = withCategory(language.t("command.category.agent"));
  const permissionsCommand = withCategory(language.t("command.category.permissions"));
  const isAutoAcceptActive = () => controller.isAutoAcceptActive();
  /**
   * Copy text to the clipboard, using a hidden textarea with execCommand and
   * falling back to the async clipboard API.
   * @param {string} value - The text to copy.
   * @returns {Promise<boolean>} Resolves true when the copy succeeded.
   */
  const write = async value => {
    const body = typeof document === "undefined" ? undefined : document.body;
    if (body) {
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      textarea.style.pointerEvents = "none";
      body.appendChild(textarea);
      textarea.select();
      const copied = document.execCommand("copy");
      body.removeChild(textarea);
      if (copied) return true;
    }
    const clipboard = typeof navigator === "undefined" ? undefined : navigator.clipboard;
    if (!clipboard?.writeText) return false;
    return clipboard.writeText(value).then(() => true, () => false);
  };
  /**
   * Copy a share URL to the clipboard and show a success or failure toast.
   * @param {string} url - The share URL to copy.
   * @param {boolean} existing - Whether the URL was already shared (changes the toast title).
   * @returns {Promise<void>} Resolves once the toast has been shown.
   */
  const copyShare = async (url, existing) => {
    if (!(await write(url))) {
      showToast({
        title: language.t("toast.session.share.copyFailed.title"),
        variant: "error"
      });
      return;
    }
    showToast({
      title: existing ? language.t("session.share.copy.copied") : language.t("toast.session.share.success.title"),
      description: language.t("toast.session.share.success.description"),
      variant: "success"
    });
  };
  /**
   * Share the current session: copy an existing link or create one, then copy and toast.
   * @returns {Promise<void>} Resolves once sharing has completed or failed.
   */
  const share = async () => {
    const sessionID = params.id;
    if (!sessionID) return;
    const existing = info()?.share?.url;
    if (existing) {
      await copyShare(existing, true);
      return;
    }
    const url = await controller.shareSession(sessionID);
    if (!url) {
      showToast({
        title: language.t("toast.session.share.failed.title"),
        description: language.t("toast.session.share.failed.description"),
        variant: "error"
      });
      return;
    }
    await copyShare(url, false);
  };
  /**
   * Stop sharing the current session and show a success or failure toast.
   * @returns {Promise<void>} Resolves once unsharing has completed or failed.
   */
  const unshare = async () => {
    const sessionID = params.id;
    if (!sessionID) return;
    await controller.unshareSession(sessionID).then(() => showToast({
      title: language.t("toast.session.unshare.success.title"),
      description: language.t("toast.session.unshare.success.description"),
      variant: "success"
    })).catch(() => showToast({
      title: language.t("toast.session.unshare.failed.title"),
      description: language.t("toast.session.unshare.failed.description"),
      variant: "error"
    }));
  };
  /**
   * Open the file-picker dialog, lazily loading its component.
   * @returns {void}
   */
  const openFile = () => {
    void import("@/components/dialog-select-file.js").then(x => {
      dialog.show(() => createComponent(x.DialogSelectFile, {
        onOpenFile: showAllFiles
      }));
    });
  };
  /**
   * Close the currently active closable tab, if any.
   * @returns {void}
   */
  const closeTab = () => {
    const tab = closableTab();
    if (!tab) return;
    tabs().close(tab);
  };
  /**
   * Add the active file tab's selected lines to the prompt context, toasting when none exist.
   * @returns {void}
   */
  const addSelection = () => {
    const tab = activeFileTab();
    if (!tab) return;
    const path = file.pathFromTab(tab);
    if (!path) return;
    const range = file.selectedLines(path);
    if (!range) {
      showToast({
        title: language.t("toast.context.noLineSelection.title"),
        description: language.t("toast.context.noLineSelection.description")
      });
      return;
    }
    addSelectionToContext(path, selectionFromLines(range));
  };
  /**
   * Open the terminal view, creating a new terminal when one already exists.
   * @returns {void}
   */
  const openTerminal = () => {
    if (terminal.all().length > 0) terminal.new();
    view().terminal.open();
  };
  /**
   * Open the model picker, or the connection settings dialog when no provider is connected.
   * @returns {void}
   */
  const chooseModel = () => {
    // With no connected provider there is nothing to choose, so send the user to
    // Settings -> サーバー・プロバイダ to set one up — same as the prompt's model
    // button — instead of opening an empty model picker.
    if (providers.connected().length === 0) {
      void import("../../components/dialog-settings.js").then(x => {
        dialog.show(() => createComponent(x.DialogSettings, { tab: "connection" }));
      });
      return;
    }
    void import("@/components/dialog-select-model.js").then(x => {
      dialog.show(() => createComponent(x.DialogSelectModel, {
        get model() {
          return local.model;
        }
      }));
    });
  };
  /**
   * Open the MCP selection dialog, lazily loading its component.
   * @returns {void}
   */
  const chooseMcp = () => {
    void import("@/components/dialog-select-mcp.js").then(x => {
      dialog.show(() => createComponent(x.DialogSelectMcp, {}));
    });
  };
  /**
   * Toggle auto-accept mode for permissions and show a toast reflecting the new state.
   * @returns {void}
   */
  const toggleAutoAccept = () => {
    const active = controller.toggleAutoAccept();
    showToast({
      title: active ? language.t("toast.permissions.autoaccept.on.title") : language.t("toast.permissions.autoaccept.off.title"),
      description: active ? language.t("toast.permissions.autoaccept.on.description") : language.t("toast.permissions.autoaccept.off.description")
    });
  };
  /**
   * Undo the last session change, updating the active message and status.
   * @returns {*} The result of the controller's undo call.
   */
  const undo = () => controller.undo(setActiveMessage, status);
  /**
   * Redo the last undone session change, updating the active message.
   * @returns {*} The result of the controller's redo call.
   */
  const redo = () => controller.redo(setActiveMessage);
  /**
   * Summarize (compact) the current session using the selected model, toasting when none is set.
   * @returns {Promise<void>} Resolves once summarization has been requested or skipped.
   */
  const compact = async () => {
    const sessionID = params.id;
    if (!sessionID) return;
    const model = local.model.current();
    if (!model) {
      showToast({
        title: language.t("toast.model.none.title"),
        description: language.t("toast.model.none.description")
      });
      return;
    }
    await controller.summarize(model);
  };
  /**
   * Open the fork dialog, lazily loading its component.
   * @returns {void}
   */
  const fork = () => {
    void import("@/components/dialog-fork.js").then(x => {
      dialog.show(() => createComponent(x.DialogFork, {}));
    });
  };
  /**
   * Build the share/unshare commands, returning an empty list when sharing is disabled.
   * @returns {Array} The share-related command-palette options.
   */
  const shareCmds = () => {
    if (sync.data?.config.share === "disabled") return [];
    return [sessionCommand({
      id: "session.share",
      title: info()?.share?.url ? language.t("session.share.copy.copyLink") : language.t("command.session.share"),
      description: info()?.share?.url ? language.t("toast.session.share.success.description") : language.t("command.session.share.description"),
      slash: "share",
      disabled: !params.id,
      onSelect: share
    }), sessionCommand({
      id: "session.unshare",
      title: language.t("command.session.unshare"),
      description: language.t("command.session.unshare.description"),
      slash: "unshare",
      disabled: !params.id || !info()?.share?.url,
      onSelect: unshare
    })];
  };
  /**
   * Build the core session commands (new, undo, redo, compact, fork).
   * @returns {Array} The session command-palette options.
   */
  const sessionCmds = () => [sessionCommand({
    id: "session.new",
    title: language.t("command.session.new"),
    keybind: "mod+shift+s",
    slash: "new",
    onSelect: () => navigate(`/${params.dir}/session`)
  }), sessionCommand({
    id: "session.undo",
    title: language.t("command.session.undo"),
    description: language.t("command.session.undo.description"),
    slash: "undo",
    disabled: !params.id || visibleUserMessages().length === 0,
    onSelect: undo
  }), sessionCommand({
    id: "session.redo",
    title: language.t("command.session.redo"),
    description: language.t("command.session.redo.description"),
    slash: "redo",
    disabled: !params.id || !info()?.revert?.messageID,
    onSelect: redo
  }), sessionCommand({
    id: "session.compact",
    title: language.t("command.session.compact"),
    description: language.t("command.session.compact.description"),
    slash: "compact",
    disabled: !params.id || visibleUserMessages().length === 0,
    onSelect: compact
  }), sessionCommand({
    id: "session.fork",
    title: language.t("command.session.fork"),
    description: language.t("command.session.fork.description"),
    slash: "fork",
    disabled: !params.id || visibleUserMessages().length === 0,
    onSelect: fork
  })];
  /**
   * Build the file commands (open file, close tab).
   * @returns {Array} The file command-palette options.
   */
  const fileCmds = () => [fileCommand({
    id: "file.open",
    title: language.t("command.file.open"),
    description: language.t("palette.search.placeholder"),
    keybind: "mod+k,mod+p",
    slash: "open",
    onSelect: openFile
  }), fileCommand({
    id: "tab.close",
    title: language.t("command.tab.close"),
    keybind: "mod+w",
    disabled: !closableTab(),
    onSelect: closeTab
  })];
  /**
   * Build the context commands (add selection to context).
   * @returns {Array} The context command-palette options.
   */
  const contextCmds = () => [contextCommand({
    id: "context.addSelection",
    title: language.t("command.context.addSelection"),
    description: language.t("command.context.addSelection.description"),
    keybind: "mod+shift+l",
    disabled: !canAddSelectionContext(),
    onSelect: addSelection
  })];
  /**
   * Build the view toggle commands (terminal, review panel, optional file tree, focus input).
   * @returns {Array} The view command-palette options.
   */
  const viewCmds = () => [viewCommand({
    id: "terminal.toggle",
    title: language.t("command.terminal.toggle"),
    keybind: "ctrl+`",
    slash: "terminal",
    onSelect: () => view().terminal.toggle()
  }), viewCommand({
    id: "review.toggle",
    title: language.t("command.review.toggle"),
    keybind: "mod+shift+r",
    onSelect: () => view().reviewPanel.toggle()
  }), ...(shown() ? [viewCommand({
    id: "fileTree.toggle",
    title: language.t("command.fileTree.toggle"),
    keybind: "mod+\\",
    onSelect: () => layout.fileTree.toggle()
  })] : []), viewCommand({
    id: "input.focus",
    title: language.t("command.input.focus"),
    keybind: "ctrl+l",
    onSelect: focusInput
  })];
  /**
   * Build the terminal commands (new terminal).
   * @returns {Array} The terminal command-palette options.
   */
  const terminalCmds = () => [terminalCommand({
    id: "terminal.new",
    title: language.t("command.terminal.new"),
    description: language.t("command.terminal.new.description"),
    keybind: "ctrl+alt+t",
    onSelect: openTerminal
  })];
  /**
   * Build the message navigation commands (previous, next).
   * @returns {Array} The message-navigation command-palette options.
   */
  const messageCmds = () => [sessionCommand({
    id: "message.previous",
    title: language.t("command.message.previous"),
    description: language.t("command.message.previous.description"),
    keybind: "mod+alt+[",
    disabled: !params.id,
    onSelect: () => navigateMessageByOffset(-1)
  }), sessionCommand({
    id: "message.next",
    title: language.t("command.message.next"),
    description: language.t("command.message.next.description"),
    keybind: "mod+alt+]",
    disabled: !params.id,
    onSelect: () => navigateMessageByOffset(1)
  })];
  /**
   * Build the model commands (choose model, cycle variant).
   * @returns {Array} The model command-palette options.
   */
  const modelCmds = () => [modelCommand({
    id: "model.choose",
    title: language.t("command.model.choose"),
    description: language.t("command.model.choose.description"),
    keybind: "mod+'",
    slash: "model",
    onSelect: chooseModel
  }), modelCommand({
    id: "model.variant.cycle",
    title: language.t("command.model.variant.cycle"),
    description: language.t("command.model.variant.cycle.description"),
    keybind: "shift+mod+d",
    onSelect: () => local.model.variant.cycle()
  })];
  /**
   * Build the MCP commands (toggle MCP selection dialog).
   * @returns {Array} The MCP command-palette options.
   */
  const mcpCmds = () => [mcpCommand({
    id: "mcp.toggle",
    title: language.t("command.mcp.toggle"),
    description: language.t("command.mcp.toggle.description"),
    keybind: "mod+;",
    slash: "mcp",
    onSelect: chooseMcp
  })];
  /**
   * Build the agent commands (cycle forward and reverse).
   * @returns {Array} The agent command-palette options.
   */
  const agentCmds = () => [agentCommand({
    id: "agent.cycle",
    title: language.t("command.agent.cycle"),
    description: language.t("command.agent.cycle.description"),
    keybind: "mod+.",
    slash: "agent",
    onSelect: () => local.agent.move(1)
  }), agentCommand({
    id: "agent.cycle.reverse",
    title: language.t("command.agent.cycle.reverse"),
    description: language.t("command.agent.cycle.reverse.description"),
    keybind: "shift+mod+.",
    onSelect: () => local.agent.move(-1)
  })];
  /**
   * Build the permissions commands (toggle auto-accept).
   * @returns {Array} The permissions command-palette options.
   */
  const permissionsCmds = () => [permissionsCommand({
    id: "permissions.autoaccept",
    title: isAutoAcceptActive() ? language.t("command.permissions.autoaccept.disable") : language.t("command.permissions.autoaccept.enable"),
    keybind: "mod+shift+a",
    disabled: false,
    onSelect: toggleAutoAccept
  })];
  command.register("session", () => [...sessionCmds(), ...shareCmds(), ...fileCmds(), ...contextCmds(), ...viewCmds(), ...terminalCmds(), ...messageCmds(), ...modelCmds(), ...mcpCmds(), ...agentCmds(), ...permissionsCmds()]);
};