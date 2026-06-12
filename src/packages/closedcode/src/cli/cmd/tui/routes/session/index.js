import { createTextNode as _$createTextNode } from "@opentui/solid";
import { memo as _$memo } from "@opentui/solid";
import { effect as _$effect } from "@opentui/solid";
import { insert as _$insert } from "@opentui/solid";
import { insertNode as _$insertNode } from "@opentui/solid";
import { use as _$use } from "@opentui/solid";
import { setProp as _$setProp } from "@opentui/solid";
import { createElement as _$createElement } from "@opentui/solid";
import { createComponent as _$createComponent } from "@opentui/solid";
import { batch, createContext, createEffect, createMemo, createSignal, For, Match, on, onMount, Show, Switch, useContext } from "solid-js";
import { Dynamic } from "solid-js/web";
import path from "path";
import { useRoute, useRouteData } from "#tui/context/route.js";
import { useProject } from "#tui/context/project.js";
import { useSync } from "#tui/context/sync.js";
import { useEvent } from "#tui/context/event.js";
import { SplitBorder } from "#tui/component/border.js";
import { Spinner } from "#tui/component/spinner.js";
import { selectedForeground, useTheme } from "#tui/context/theme.js";
import { addDefaultParsers, TextAttributes, RGBA } from "@opentui/core";
import { Prompt } from "#tui/component/prompt/index.js";
import { useLocal } from "#tui/context/local.js";
import { Locale } from "#util/locale.js";
import { ShellID } from "#tool/shell/id.js";
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/solid";
import { useSDK } from "#tui/context/sdk.js";
import { useEditorContext } from "#tui/context/editor.js";
import { useCommandDialog } from "#tui/component/dialog-command.js";
import { useKeybind } from "#tui/context/keybind.js";
import { useDialog } from "../../ui/dialog.js";
import { TodoItem } from "../../component/todo-item.js";
import { DialogMessage } from "./dialog-message.js";
import { DialogConfirm } from "#tui/ui/dialog-confirm.js";
import { DialogTimeline } from "./dialog-timeline.js";
import { DialogForkFromTimeline } from "./dialog-fork-from-timeline.js";
import { DialogSessionRename } from "../../component/dialog-session-rename.js";
import { Sidebar } from "./sidebar.js";
import { SubagentFooter } from "./subagent-footer.js";
import { Flag } from "core/flag/flag";
import { LANGUAGE_EXTENSIONS } from "#lsp/language.js";
import parsers from "../../../../../../parsers-config.js";
import * as Clipboard from "../../util/clipboard.js";
import { errorMessage } from "#util/error.js";
import { Toast, useToast } from "../../ui/toast.js";
import { useKV } from "../../context/kv.js";
import * as Editor from "../../util/editor.js";
import stripAnsi from "strip-ansi";
import { usePromptRef } from "../../context/prompt.js";
import { useExit } from "../../context/exit.js";
import { Filesystem } from "#util/filesystem.js";
import { Global } from "core/global";
import { PermissionPrompt } from "./permission.js";
import { QuestionPrompt } from "./question.js";
import { DialogExportOptions } from "../../ui/dialog-export-options.js";
import * as Model from "../../util/model.js";
import { formatTranscript } from "../../util/transcript.js";
import { UI } from "#cli/ui.js";
import { useTuiConfig } from "../../context/tui-config.js";
import { getScrollAcceleration } from "../../util/scroll.js";
import { TuiPluginRuntime } from "#cli/cmd/tui/plugin/runtime.js";
import { DialogGoUpsell } from "../../component/dialog-go-upsell.js";
import { SessionRetry } from "#session/retry.js";
import { getRevertDiffFiles } from "../../util/revert-diff.js";
// The default tree-sitter parsers fetch .wasm/.scm artifacts from GitHub on use.
// Gate them behind the tool-download opt-in so syntax highlighting never triggers
// unsolicited egress; the @opentui built-in parsers (md/js/ts) still work.
if (["1", "true"].includes(process.env["CLOSEDCODE_ENABLE_TOOL_DOWNLOAD"]) || ["1", "true"].includes(process.env["CLOSEDCODE_ENABLE_LSP_DOWNLOAD"])) addDefaultParsers(parsers.parsers);
const GO_UPSELL_LAST_SEEN_AT = "go_upsell_last_seen_at";
const GO_UPSELL_DONT_SHOW = "go_upsell_dont_show";
const GO_UPSELL_WINDOW = 86_400_000; // 24 hrs

const context = createContext();
function use() {
  const ctx = useContext(context);
  if (!ctx) throw new Error("useContext must be used within a Session component");
  return ctx;
}
export function Session() {
  const route = useRouteData("session");
  const {
    navigate
  } = useRoute();
  const sync = useSync();
  const event = useEvent();
  const project = useProject();
  const tuiConfig = useTuiConfig();
  const kv = useKV();
  const {
    theme
  } = useTheme();
  const promptRef = usePromptRef();
  const session = createMemo(() => sync.session.get(route.sessionID));
  const children = createMemo(() => {
    const parentID = session()?.parentID ?? session()?.id;
    return sync.data.session.filter(x => x.parentID === parentID || x.id === parentID).toSorted((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  });
  const messages = createMemo(() => sync.data.message[route.sessionID] ?? []);
  const permissions = createMemo(() => {
    if (session()?.parentID) return [];
    return children().flatMap(x => sync.data.permission[x.id] ?? []);
  });
  const questions = createMemo(() => {
    if (session()?.parentID) return [];
    return children().flatMap(x => sync.data.question[x.id] ?? []);
  });
  const visible = createMemo(() => !session()?.parentID && permissions().length === 0 && questions().length === 0);
  const disabled = createMemo(() => permissions().length > 0 || questions().length > 0);
  const pending = createMemo(() => {
    return messages().findLast(x => x.role === "assistant" && !x.time.completed)?.id;
  });
  const lastAssistant = createMemo(() => {
    return messages().findLast(x => x.role === "assistant");
  });
  const dimensions = useTerminalDimensions();
  const [sidebar, setSidebar] = kv.signal("sidebar", "auto");
  const [sidebarOpen, setSidebarOpen] = createSignal(false);
  const [conceal, setConceal] = createSignal(true);
  const [showThinking, setShowThinking] = kv.signal("thinking_visibility", true);
  const [timestamps, setTimestamps] = kv.signal("timestamps", "hide");
  const [showDetails, setShowDetails] = kv.signal("tool_details_visibility", true);
  const [showAssistantMetadata, _setShowAssistantMetadata] = kv.signal("assistant_metadata_visibility", true);
  const [showScrollbar, setShowScrollbar] = kv.signal("scrollbar_visible", false);
  const [diffWrapMode] = kv.signal("diff_wrap_mode", "word");
  const [_animationsEnabled, _setAnimationsEnabled] = kv.signal("animations_enabled", true);
  const [showGenericToolOutput, setShowGenericToolOutput] = kv.signal("generic_tool_output_visibility", false);
  const wide = createMemo(() => dimensions().width > 120);
  const sidebarVisible = createMemo(() => {
    if (session()?.parentID) return false;
    if (sidebarOpen()) return true;
    if (sidebar() === "auto" && wide()) return true;
    return false;
  });
  const showTimestamps = createMemo(() => timestamps() === "show");
  const contentWidth = createMemo(() => dimensions().width - (sidebarVisible() ? 42 : 0) - 4);
  const providers = createMemo(() => Model.index(sync.data.provider));
  const scrollAcceleration = createMemo(() => getScrollAcceleration(tuiConfig));
  const toast = useToast();
  const sdk = useSDK();
  const editor = useEditorContext();
  createEffect(() => {
    const sessionID = route.sessionID;
    void (async () => {
      const previousWorkspace = project.workspace.current();
      const result = await sdk.client.session.get({
        sessionID
      }, {
        throwOnError: true
      });
      if (!result.data) {
        toast.show({
          message: `Session not found: ${sessionID}`,
          variant: "error",
          duration: 5000
        });
        navigate({
          type: "home"
        });
        return;
      }
      if (result.data.workspaceID !== previousWorkspace) {
        project.workspace.set(result.data.workspaceID);

        // Sync all the data for this workspace. Note that this
        // workspace may not exist anymore which is why this is not
        // fatal. If it doesn't we still want to show the session
        // (which will be non-interactive)
        try {
          await sync.bootstrap({
            fatal: false
          });
        } catch {}
      }
      editor.reconnect(result.data.directory);
      await sync.session.sync(sessionID);
      if (route.sessionID === sessionID && scroll) scroll.scrollBy(100_000);
    })().catch(error => {
      if (route.sessionID !== sessionID) return;
      toast.show({
        message: errorMessage(error),
        variant: "error",
        duration: 5000
      });
      navigate({
        type: "home"
      });
    });
  });
  let lastSwitch = undefined;
  event.on("message.part.updated", evt => {
    const part = evt.properties.part;
    if (part.type !== "tool") return;
    if (part.sessionID !== route.sessionID) return;
    if (part.state.status !== "completed") return;
    if (part.id === lastSwitch) return;
    if (part.tool === "plan_exit") {
      local.agent.set("build");
      lastSwitch = part.id;
    } else if (part.tool === "plan_enter") {
      local.agent.set("plan");
      lastSwitch = part.id;
    }
  });
  let seeded = false;
  let scroll;
  let prompt;
  const bind = r => {
    prompt = r;
    promptRef.set(r);
    if (seeded || !route.prompt || !r) return;
    seeded = true;
    r.set(route.prompt);
  };
  const keybind = useKeybind();
  const dialog = useDialog();
  const renderer = useRenderer();
  event.on("session.status", evt => {
    if (evt.properties.sessionID !== route.sessionID) return;
    if (evt.properties.status.type !== "retry") return;
    if (evt.properties.status.message !== SessionRetry.GO_UPSELL_MESSAGE) return;
    if (dialog.stack.length > 0) return;
    const seen = kv.get(GO_UPSELL_LAST_SEEN_AT);
    if (typeof seen === "number" && Date.now() - seen < GO_UPSELL_WINDOW) return;
    if (kv.get(GO_UPSELL_DONT_SHOW)) return;
    void DialogGoUpsell.show(dialog).then(dontShowAgain => {
      if (dontShowAgain) kv.set(GO_UPSELL_DONT_SHOW, true);
      kv.set(GO_UPSELL_LAST_SEEN_AT, Date.now());
    });
  });

  // Allow exit when in child session (prompt is hidden)
  const exit = useExit();
  createEffect(() => {
    const title = Locale.truncate(session()?.title ?? "", 50);
    const pad = text => text.padEnd(10, " ");
    const weak = text => UI.Style.TEXT_DIM + pad(text) + UI.Style.TEXT_NORMAL;
    const logo = UI.logo("  ").split(/\r?\n/);
    return exit.message.set([`${logo[0] ?? ""}`, `${logo[1] ?? ""}`, `${logo[2] ?? ""}`, `${logo[3] ?? ""}`, ``, `  ${weak("Session")}${UI.Style.TEXT_NORMAL_BOLD}${title}${UI.Style.TEXT_NORMAL}`, `  ${weak("Continue")}${UI.Style.TEXT_NORMAL_BOLD}closedcode -s ${session()?.id}${UI.Style.TEXT_NORMAL}`, ``].join("\n"));
  });
  useKeyboard(evt => {
    if (!session()?.parentID) return;
    if (keybind.match("app_exit", evt)) {
      void exit();
    }
  });

  // Helper: Find next visible message boundary in direction
  const findNextVisibleMessage = direction => {
    const children = scroll.getChildren();
    const messagesList = messages();
    const scrollTop = scroll.y;

    // Get visible messages sorted by position, filtering for valid non-synthetic, non-ignored content
    const visibleMessages = children.filter(c => {
      if (!c.id) return false;
      const message = messagesList.find(m => m.id === c.id);
      if (!message) return false;

      // Check if message has valid non-synthetic, non-ignored text parts
      const parts = sync.data.part[message.id];
      if (!parts || !Array.isArray(parts)) return false;
      return parts.some(part => part && part.type === "text" && !part.synthetic && !part.ignored);
    }).sort((a, b) => a.y - b.y);
    if (visibleMessages.length === 0) return null;
    if (direction === "next") {
      // Find first message below current position
      return visibleMessages.find(c => c.y > scrollTop + 10)?.id ?? null;
    }
    // Find last message above current position
    return [...visibleMessages].reverse().find(c => c.y < scrollTop - 10)?.id ?? null;
  };

  // Helper: Scroll to message in direction or fallback to page scroll
  const scrollToMessage = (direction, dialog) => {
    const targetID = findNextVisibleMessage(direction);
    if (!targetID) {
      scroll.scrollBy(direction === "next" ? scroll.height : -scroll.height);
      dialog.clear();
      return;
    }
    const child = scroll.getChildren().find(c => c.id === targetID);
    if (child) scroll.scrollBy(child.y - scroll.y - 1);
    dialog.clear();
  };
  function toBottom() {
    setTimeout(() => {
      if (!scroll || scroll.isDestroyed) return;
      scroll.scrollTo(scroll.scrollHeight);
    }, 50);
  }
  const local = useLocal();
  function moveFirstChild() {
    if (children().length === 1) return;
    const next = children().find(x => !!x.parentID);
    if (next) {
      navigate({
        type: "session",
        sessionID: next.id
      });
    }
  }
  function moveChild(direction) {
    if (children().length === 1) return;
    const sessions = children().filter(x => !!x.parentID);
    let next = sessions.findIndex(x => x.id === session()?.id) - direction;
    if (next >= sessions.length) next = 0;
    if (next < 0) next = sessions.length - 1;
    if (sessions[next]) {
      navigate({
        type: "session",
        sessionID: sessions[next].id
      });
    }
  }
  function childSessionHandler(func) {
    return dialog => {
      if (!session()?.parentID || dialog.stack.length > 0) return;
      func(dialog);
    };
  }
  const command = useCommandDialog();
  command.register(() => [{
    title: session()?.share?.url ? "Copy share link" : "Share session",
    value: "session.share",
    suggested: route.type === "session",
    keybind: "session_share",
    category: "Session",
    enabled: sync.data.config.share !== "disabled",
    slash: {
      name: "share"
    },
    onSelect: async dialog => {
      const copy = url => Clipboard.copy(url).then(() => toast.show({
        message: "Share URL copied to clipboard!",
        variant: "success"
      })).catch(() => toast.show({
        message: "Failed to copy URL to clipboard",
        variant: "error"
      }));
      const url = session()?.share?.url;
      if (url) {
        await copy(url);
        dialog.clear();
        return;
      }
      if (!kv.get("share_consent", false)) {
        const ok = await DialogConfirm.show(dialog, "Share Session", "Are you sure you want to share it?");
        if (ok !== true) return;
        kv.set("share_consent", true);
      }
      await sdk.client.session.share({
        sessionID: route.sessionID
      }).then(res => copy(res.data.share.url)).catch(error => {
        toast.show({
          message: error instanceof Error ? error.message : "Failed to share session",
          variant: "error"
        });
      });
      dialog.clear();
    }
  }, {
    title: "Rename session",
    value: "session.rename",
    keybind: "session_rename",
    category: "Session",
    slash: {
      name: "rename"
    },
    onSelect: dialog => {
      dialog.replace(() => _$createComponent(DialogSessionRename, {
        get session() {
          return route.sessionID;
        }
      }));
    }
  }, {
    title: "Jump to message",
    value: "session.timeline",
    keybind: "session_timeline",
    category: "Session",
    slash: {
      name: "timeline"
    },
    onSelect: dialog => {
      dialog.replace(() => _$createComponent(DialogTimeline, {
        onMove: messageID => {
          const child = scroll.getChildren().find(child => {
            return child.id === messageID;
          });
          if (child) scroll.scrollBy(child.y - scroll.y - 1);
        },
        get sessionID() {
          return route.sessionID;
        },
        setPrompt: promptInfo => prompt?.set(promptInfo)
      }));
    }
  }, {
    title: "Fork session",
    value: "session.fork",
    keybind: "session_fork",
    category: "Session",
    slash: {
      name: "fork"
    },
    onSelect: dialog => {
      dialog.replace(() => _$createComponent(DialogForkFromTimeline, {
        onMove: messageID => {
          if (!messageID) return;
          const child = scroll.getChildren().find(child => {
            return child.id === messageID;
          });
          if (child) scroll.scrollBy(child.y - scroll.y - 1);
        },
        get sessionID() {
          return route.sessionID;
        }
      }));
    }
  }, {
    title: "Compact session",
    value: "session.compact",
    keybind: "session_compact",
    category: "Session",
    slash: {
      name: "compact",
      aliases: ["summarize"]
    },
    onSelect: dialog => {
      const selectedModel = local.model.current();
      if (!selectedModel) {
        toast.show({
          variant: "warning",
          message: "Connect a provider to summarize this session",
          duration: 3000
        });
        return;
      }
      void sdk.client.session.summarize({
        sessionID: route.sessionID,
        modelID: selectedModel.modelID,
        providerID: selectedModel.providerID
      });
      dialog.clear();
    }
  }, {
    title: "Unshare session",
    value: "session.unshare",
    keybind: "session_unshare",
    category: "Session",
    enabled: !!session()?.share?.url,
    slash: {
      name: "unshare"
    },
    onSelect: async dialog => {
      await sdk.client.session.unshare({
        sessionID: route.sessionID
      }).then(() => toast.show({
        message: "Session unshared successfully",
        variant: "success"
      })).catch(error => {
        toast.show({
          message: error instanceof Error ? error.message : "Failed to unshare session",
          variant: "error"
        });
      });
      dialog.clear();
    }
  }, {
    title: "Undo previous message",
    value: "session.undo",
    keybind: "messages_undo",
    category: "Session",
    slash: {
      name: "undo"
    },
    onSelect: async dialog => {
      const status = sync.data.session_status?.[route.sessionID];
      if (status?.type !== "idle") await sdk.client.session.abort({
        sessionID: route.sessionID
      }).catch(() => {});
      const revert = session()?.revert?.messageID;
      const message = messages().findLast(x => (!revert || x.id < revert) && x.role === "user");
      if (!message) return;
      void sdk.client.session.revert({
        sessionID: route.sessionID,
        messageID: message.id
      }).then(() => {
        toBottom();
      });
      const parts = sync.data.part[message.id];
      prompt?.set(parts.reduce((agg, part) => {
        if (part.type === "text") {
          if (!part.synthetic) agg.input += part.text;
        }
        if (part.type === "file") agg.parts.push(part);
        return agg;
      }, {
        input: "",
        parts: []
      }));
      dialog.clear();
    }
  }, {
    title: "Redo",
    value: "session.redo",
    keybind: "messages_redo",
    category: "Session",
    enabled: !!session()?.revert?.messageID,
    slash: {
      name: "redo"
    },
    onSelect: dialog => {
      dialog.clear();
      const messageID = session()?.revert?.messageID;
      if (!messageID) return;
      const message = messages().find(x => x.role === "user" && x.id > messageID);
      if (!message) {
        void sdk.client.session.unrevert({
          sessionID: route.sessionID
        });
        prompt?.set({
          input: "",
          parts: []
        });
        return;
      }
      void sdk.client.session.revert({
        sessionID: route.sessionID,
        messageID: message.id
      });
    }
  }, {
    title: sidebarVisible() ? "Hide sidebar" : "Show sidebar",
    value: "session.sidebar.toggle",
    keybind: "sidebar_toggle",
    category: "Session",
    onSelect: dialog => {
      batch(() => {
        const isVisible = sidebarVisible();
        setSidebar(() => isVisible ? "hide" : "auto");
        setSidebarOpen(!isVisible);
      });
      dialog.clear();
    }
  }, {
    title: conceal() ? "Disable code concealment" : "Enable code concealment",
    value: "session.toggle.conceal",
    keybind: "messages_toggle_conceal",
    category: "Session",
    onSelect: dialog => {
      setConceal(prev => !prev);
      dialog.clear();
    }
  }, {
    title: showTimestamps() ? "Hide timestamps" : "Show timestamps",
    value: "session.toggle.timestamps",
    category: "Session",
    slash: {
      name: "timestamps",
      aliases: ["toggle-timestamps"]
    },
    onSelect: dialog => {
      setTimestamps(prev => prev === "show" ? "hide" : "show");
      dialog.clear();
    }
  }, {
    title: showThinking() ? "Hide thinking" : "Show thinking",
    value: "session.toggle.thinking",
    keybind: "display_thinking",
    category: "Session",
    slash: {
      name: "thinking",
      aliases: ["toggle-thinking"]
    },
    onSelect: dialog => {
      setShowThinking(prev => !prev);
      dialog.clear();
    }
  }, {
    title: showDetails() ? "Hide tool details" : "Show tool details",
    value: "session.toggle.actions",
    keybind: "tool_details",
    category: "Session",
    onSelect: dialog => {
      setShowDetails(prev => !prev);
      dialog.clear();
    }
  }, {
    title: "Toggle session scrollbar",
    value: "session.toggle.scrollbar",
    keybind: "scrollbar_toggle",
    category: "Session",
    onSelect: dialog => {
      setShowScrollbar(prev => !prev);
      dialog.clear();
    }
  }, {
    title: showGenericToolOutput() ? "Hide generic tool output" : "Show generic tool output",
    value: "session.toggle.generic_tool_output",
    category: "Session",
    onSelect: dialog => {
      setShowGenericToolOutput(prev => !prev);
      dialog.clear();
    }
  }, {
    title: "Page up",
    value: "session.page.up",
    keybind: "messages_page_up",
    category: "Session",
    hidden: true,
    onSelect: dialog => {
      scroll.scrollBy(-scroll.height / 2);
      dialog.clear();
    }
  }, {
    title: "Page down",
    value: "session.page.down",
    keybind: "messages_page_down",
    category: "Session",
    hidden: true,
    onSelect: dialog => {
      scroll.scrollBy(scroll.height / 2);
      dialog.clear();
    }
  }, {
    title: "Line up",
    value: "session.line.up",
    keybind: "messages_line_up",
    category: "Session",
    disabled: true,
    onSelect: dialog => {
      scroll.scrollBy(-1);
      dialog.clear();
    }
  }, {
    title: "Line down",
    value: "session.line.down",
    keybind: "messages_line_down",
    category: "Session",
    disabled: true,
    onSelect: dialog => {
      scroll.scrollBy(1);
      dialog.clear();
    }
  }, {
    title: "Half page up",
    value: "session.half.page.up",
    keybind: "messages_half_page_up",
    category: "Session",
    hidden: true,
    onSelect: dialog => {
      scroll.scrollBy(-scroll.height / 4);
      dialog.clear();
    }
  }, {
    title: "Half page down",
    value: "session.half.page.down",
    keybind: "messages_half_page_down",
    category: "Session",
    hidden: true,
    onSelect: dialog => {
      scroll.scrollBy(scroll.height / 4);
      dialog.clear();
    }
  }, {
    title: "First message",
    value: "session.first",
    keybind: "messages_first",
    category: "Session",
    hidden: true,
    onSelect: dialog => {
      scroll.scrollTo(0);
      dialog.clear();
    }
  }, {
    title: "Last message",
    value: "session.last",
    keybind: "messages_last",
    category: "Session",
    hidden: true,
    onSelect: dialog => {
      scroll.scrollTo(scroll.scrollHeight);
      dialog.clear();
    }
  }, {
    title: "Jump to last user message",
    value: "session.messages_last_user",
    keybind: "messages_last_user",
    category: "Session",
    hidden: true,
    onSelect: () => {
      const messages = sync.data.message[route.sessionID];
      if (!messages || !messages.length) return;

      // Find the most recent user message with non-ignored, non-synthetic text parts
      for (let i = messages.length - 1; i >= 0; i--) {
        const message = messages[i];
        if (!message || message.role !== "user") continue;
        const parts = sync.data.part[message.id];
        if (!parts || !Array.isArray(parts)) continue;
        const hasValidTextPart = parts.some(part => part && part.type === "text" && !part.synthetic && !part.ignored);
        if (hasValidTextPart) {
          const child = scroll.getChildren().find(child => {
            return child.id === message.id;
          });
          if (child) scroll.scrollBy(child.y - scroll.y - 1);
          break;
        }
      }
    }
  }, {
    title: "Next message",
    value: "session.message.next",
    keybind: "messages_next",
    category: "Session",
    hidden: true,
    onSelect: dialog => scrollToMessage("next", dialog)
  }, {
    title: "Previous message",
    value: "session.message.previous",
    keybind: "messages_previous",
    category: "Session",
    hidden: true,
    onSelect: dialog => scrollToMessage("prev", dialog)
  }, {
    title: "Copy last assistant message",
    value: "messages.copy",
    keybind: "messages_copy",
    category: "Session",
    onSelect: dialog => {
      const revertID = session()?.revert?.messageID;
      const lastAssistantMessage = messages().findLast(msg => msg.role === "assistant" && (!revertID || msg.id < revertID));
      if (!lastAssistantMessage) {
        toast.show({
          message: "No assistant messages found",
          variant: "error"
        });
        dialog.clear();
        return;
      }
      const parts = sync.data.part[lastAssistantMessage.id] ?? [];
      const textParts = parts.filter(part => part.type === "text");
      if (textParts.length === 0) {
        toast.show({
          message: "No text parts found in last assistant message",
          variant: "error"
        });
        dialog.clear();
        return;
      }
      const text = textParts.map(part => part.text).join("\n").trim();
      if (!text) {
        toast.show({
          message: "No text content found in last assistant message",
          variant: "error"
        });
        dialog.clear();
        return;
      }
      Clipboard.copy(text).then(() => toast.show({
        message: "Message copied to clipboard!",
        variant: "success"
      })).catch(() => toast.show({
        message: "Failed to copy to clipboard",
        variant: "error"
      }));
      dialog.clear();
    }
  }, {
    title: "Copy session transcript",
    value: "session.copy",
    category: "Session",
    slash: {
      name: "copy"
    },
    onSelect: async dialog => {
      try {
        const sessionData = session();
        if (!sessionData) return;
        const sessionMessages = messages();
        const transcript = formatTranscript(sessionData, sessionMessages.map(msg => ({
          info: msg,
          parts: sync.data.part[msg.id] ?? []
        })), {
          thinking: showThinking(),
          toolDetails: showDetails(),
          assistantMetadata: showAssistantMetadata(),
          providers: sync.data.provider
        });
        await Clipboard.copy(transcript);
        toast.show({
          message: "Session transcript copied to clipboard!",
          variant: "success"
        });
      } catch {
        toast.show({
          message: "Failed to copy session transcript",
          variant: "error"
        });
      }
      dialog.clear();
    }
  }, {
    title: "Export session transcript",
    value: "session.export",
    keybind: "session_export",
    category: "Session",
    slash: {
      name: "export"
    },
    onSelect: async dialog => {
      try {
        const sessionData = session();
        if (!sessionData) return;
        const sessionMessages = messages();
        const defaultFilename = `session-${sessionData.id.slice(0, 8)}.md`;
        const options = await DialogExportOptions.show(dialog, defaultFilename, showThinking(), showDetails(), showAssistantMetadata(), false);
        if (options === null) return;
        const transcript = formatTranscript(sessionData, sessionMessages.map(msg => ({
          info: msg,
          parts: sync.data.part[msg.id] ?? []
        })), {
          thinking: options.thinking,
          toolDetails: options.toolDetails,
          assistantMetadata: options.assistantMetadata,
          providers: sync.data.provider
        });
        if (options.openWithoutSaving) {
          // Just open in editor without saving
          await Editor.open({
            value: transcript,
            renderer
          });
        } else {
          const exportDir = process.cwd();
          const filename = options.filename.trim();
          const filepath = path.join(exportDir, filename);
          await Filesystem.write(filepath, transcript);

          // Open with EDITOR if available
          const result = await Editor.open({
            value: transcript,
            renderer
          });
          if (result !== undefined) {
            await Filesystem.write(filepath, result);
          }
          toast.show({
            message: `Session exported to ${filename}`,
            variant: "success"
          });
        }
      } catch {
        toast.show({
          message: "Failed to export session",
          variant: "error"
        });
      }
      dialog.clear();
    }
  }, {
    title: "Go to child session",
    value: "session.child.first",
    keybind: "session_child_first",
    category: "Session",
    hidden: true,
    onSelect: dialog => {
      moveFirstChild();
      dialog.clear();
    }
  }, {
    title: "Go to parent session",
    value: "session.parent",
    keybind: "session_parent",
    category: "Session",
    hidden: true,
    enabled: !!session()?.parentID,
    onSelect: childSessionHandler(dialog => {
      const parentID = session()?.parentID;
      if (parentID) {
        navigate({
          type: "session",
          sessionID: parentID
        });
      }
      dialog.clear();
    })
  }, {
    title: "Next child session",
    value: "session.child.next",
    keybind: "session_child_cycle",
    category: "Session",
    hidden: true,
    enabled: !!session()?.parentID,
    onSelect: childSessionHandler(dialog => {
      moveChild(1);
      dialog.clear();
    })
  }, {
    title: "Previous child session",
    value: "session.child.previous",
    keybind: "session_child_cycle_reverse",
    category: "Session",
    hidden: true,
    enabled: !!session()?.parentID,
    onSelect: childSessionHandler(dialog => {
      moveChild(-1);
      dialog.clear();
    })
  }]);
  const revertInfo = createMemo(() => session()?.revert);
  const revertMessageID = createMemo(() => revertInfo()?.messageID);
  const revertDiffFiles = createMemo(() => getRevertDiffFiles(revertInfo()?.diff ?? ""));
  const revertRevertedMessages = createMemo(() => {
    const messageID = revertMessageID();
    if (!messageID) return [];
    return messages().filter(x => x.id >= messageID && x.role === "user");
  });
  const revert = createMemo(() => {
    const info = revertInfo();
    if (!info) return;
    if (!info.messageID) return;
    return {
      messageID: info.messageID,
      reverted: revertRevertedMessages(),
      diff: info.diff,
      diffFiles: revertDiffFiles()
    };
  });

  // snap to bottom when session changes
  createEffect(on(() => route.sessionID, toBottom));
  return _$createComponent(context.Provider, {
    get value() {
      return {
        get width() {
          return contentWidth();
        },
        sessionID: route.sessionID,
        conceal,
        showThinking,
        showTimestamps,
        showDetails,
        showGenericToolOutput,
        diffWrapMode,
        providers,
        sync,
        tui: tuiConfig
      };
    },
    get children() {
      var _el$ = _$createElement("box"),
        _el$2 = _$createElement("box");
      _$insertNode(_el$, _el$2);
      _$setProp(_el$, "flexDirection", "row");
      _$setProp(_el$2, "flexGrow", 1);
      _$setProp(_el$2, "paddingBottom", 1);
      _$setProp(_el$2, "paddingLeft", 2);
      _$setProp(_el$2, "paddingRight", 2);
      _$setProp(_el$2, "gap", 1);
      _$insert(_el$2, _$createComponent(Show, {
        get when() {
          return session();
        },
        get children() {
          return [(() => {
            var _el$3 = _$createElement("scrollbox"),
              _el$4 = _$createElement("box");
            _$insertNode(_el$3, _el$4);
            _$use(r => scroll = r, _el$3);
            _$setProp(_el$3, "stickyScroll", true);
            _$setProp(_el$3, "stickyStart", "bottom");
            _$setProp(_el$3, "flexGrow", 1);
            _$setProp(_el$4, "height", 1);
            _$insert(_el$3, _$createComponent(For, {
              get each() {
                return messages();
              },
              children: (message, index) => _$createComponent(Switch, {
                get children() {
                  return [_$createComponent(Match, {
                    get when() {
                      return message.id === revert()?.messageID;
                    },
                    get children() {
                      return function () {
                        const command = useCommandDialog();
                        const [hover, setHover] = createSignal(false);
                        const dialog = useDialog();
                        const handleUnrevert = async () => {
                          const confirmed = await DialogConfirm.show(dialog, "Confirm Redo", "Are you sure you want to restore the reverted messages?");
                          if (confirmed) {
                            command.trigger("session.redo");
                          }
                        };
                        return (() => {
                          var _el$7 = _$createElement("box"),
                            _el$8 = _$createElement("box"),
                            _el$9 = _$createElement("text"),
                            _el$0 = _$createTextNode(` message reverted`),
                            _el$1 = _$createElement("text"),
                            _el$10 = _$createElement("span"),
                            _el$11 = _$createTextNode(` or /redo to restore`);
                          _$insertNode(_el$7, _el$8);
                          _$setProp(_el$7, "onMouseOver", () => setHover(true));
                          _$setProp(_el$7, "onMouseOut", () => setHover(false));
                          _$setProp(_el$7, "onMouseUp", handleUnrevert);
                          _$setProp(_el$7, "marginTop", 1);
                          _$setProp(_el$7, "flexShrink", 0);
                          _$setProp(_el$7, "border", ["left"]);
                          _$insertNode(_el$8, _el$9);
                          _$insertNode(_el$8, _el$1);
                          _$setProp(_el$8, "paddingTop", 1);
                          _$setProp(_el$8, "paddingBottom", 1);
                          _$setProp(_el$8, "paddingLeft", 2);
                          _$insertNode(_el$9, _el$0);
                          _$insert(_el$9, () => revert().reverted.length, _el$0);
                          _$insertNode(_el$1, _el$10);
                          _$insertNode(_el$1, _el$11);
                          _$insert(_el$10, () => keybind.print("messages_redo"));
                          _$insert(_el$8, _$createComponent(Show, {
                            get when() {
                              return revert().diffFiles?.length;
                            },
                            get children() {
                              var _el$12 = _$createElement("box");
                              _$setProp(_el$12, "marginTop", 1);
                              _$insert(_el$12, _$createComponent(For, {
                                get each() {
                                  return revert().diffFiles;
                                },
                                children: file => (() => {
                                  var _el$13 = _$createElement("text");
                                  _$insert(_el$13, () => file.filename, null);
                                  _$insert(_el$13, _$createComponent(Show, {
                                    get when() {
                                      return file.additions > 0;
                                    },
                                    get children() {
                                      var _el$14 = _$createElement("span"),
                                        _el$15 = _$createTextNode(` +`);
                                      _$insertNode(_el$14, _el$15);
                                      _$insert(_el$14, () => file.additions, null);
                                      _$effect(_$p => _$setProp(_el$14, "style", {
                                        fg: theme.diffAdded
                                      }, _$p));
                                      return _el$14;
                                    }
                                  }), null);
                                  _$insert(_el$13, _$createComponent(Show, {
                                    get when() {
                                      return file.deletions > 0;
                                    },
                                    get children() {
                                      var _el$16 = _$createElement("span"),
                                        _el$17 = _$createTextNode(` -`);
                                      _$insertNode(_el$16, _el$17);
                                      _$insert(_el$16, () => file.deletions, null);
                                      _$effect(_$p => _$setProp(_el$16, "style", {
                                        fg: theme.diffRemoved
                                      }, _$p));
                                      return _el$16;
                                    }
                                  }), null);
                                  _$effect(_$p => _$setProp(_el$13, "fg", theme.text, _$p));
                                  return _el$13;
                                })()
                              }));
                              return _el$12;
                            }
                          }), null);
                          _$effect(_p$ => {
                            var _v$4 = SplitBorder.customBorderChars,
                              _v$5 = theme.backgroundPanel,
                              _v$6 = hover() ? theme.backgroundElement : theme.backgroundPanel,
                              _v$7 = theme.textMuted,
                              _v$8 = theme.textMuted,
                              _v$9 = {
                                fg: theme.text
                              };
                            _v$4 !== _p$.e && (_p$.e = _$setProp(_el$7, "customBorderChars", _v$4, _p$.e));
                            _v$5 !== _p$.t && (_p$.t = _$setProp(_el$7, "borderColor", _v$5, _p$.t));
                            _v$6 !== _p$.a && (_p$.a = _$setProp(_el$8, "backgroundColor", _v$6, _p$.a));
                            _v$7 !== _p$.o && (_p$.o = _$setProp(_el$9, "fg", _v$7, _p$.o));
                            _v$8 !== _p$.i && (_p$.i = _$setProp(_el$1, "fg", _v$8, _p$.i));
                            _v$9 !== _p$.n && (_p$.n = _$setProp(_el$10, "style", _v$9, _p$.n));
                            return _p$;
                          }, {
                            e: undefined,
                            t: undefined,
                            a: undefined,
                            o: undefined,
                            i: undefined,
                            n: undefined
                          });
                          return _el$7;
                        })();
                      }();
                    }
                  }), _$createComponent(Match, {
                    get when() {
                      return _$memo(() => !!revert()?.messageID)() && message.id >= revert().messageID;
                    },
                    get children() {
                      return [];
                    }
                  }), _$createComponent(Match, {
                    get when() {
                      return message.role === "user";
                    },
                    get children() {
                      return _$createComponent(UserMessage, {
                        get index() {
                          return index();
                        },
                        onMouseUp: () => {
                          if (renderer.getSelection()?.getSelectedText()) return;
                          dialog.replace(() => _$createComponent(DialogMessage, {
                            get messageID() {
                              return message.id;
                            },
                            get sessionID() {
                              return route.sessionID;
                            },
                            setPrompt: promptInfo => prompt?.set(promptInfo)
                          }));
                        },
                        message: message,
                        get parts() {
                          return sync.data.part[message.id] ?? [];
                        },
                        get pending() {
                          return pending();
                        }
                      });
                    }
                  }), _$createComponent(Match, {
                    get when() {
                      return message.role === "assistant";
                    },
                    get children() {
                      return _$createComponent(AssistantMessage, {
                        get last() {
                          return lastAssistant()?.id === message.id;
                        },
                        message: message,
                        get parts() {
                          return sync.data.part[message.id] ?? [];
                        }
                      });
                    }
                  })];
                }
              })
            }), null);
            _$effect(_p$ => {
              var _v$ = {
                  paddingRight: showScrollbar() ? 1 : 0
                },
                _v$2 = {
                  paddingLeft: 1,
                  visible: showScrollbar(),
                  trackOptions: {
                    backgroundColor: theme.backgroundElement,
                    foregroundColor: theme.border
                  }
                },
                _v$3 = scrollAcceleration();
              _v$ !== _p$.e && (_p$.e = _$setProp(_el$3, "viewportOptions", _v$, _p$.e));
              _v$2 !== _p$.t && (_p$.t = _$setProp(_el$3, "verticalScrollbarOptions", _v$2, _p$.t));
              _v$3 !== _p$.a && (_p$.a = _$setProp(_el$3, "scrollAcceleration", _v$3, _p$.a));
              return _p$;
            }, {
              e: undefined,
              t: undefined,
              a: undefined
            });
            return _el$3;
          })(), (() => {
            var _el$5 = _$createElement("box");
            _$setProp(_el$5, "flexShrink", 0);
            _$insert(_el$5, _$createComponent(Show, {
              get when() {
                return permissions().length > 0;
              },
              get children() {
                return _$createComponent(PermissionPrompt, {
                  get request() {
                    return permissions()[0];
                  }
                });
              }
            }), null);
            _$insert(_el$5, _$createComponent(Show, {
              get when() {
                return _$memo(() => permissions().length === 0)() && questions().length > 0;
              },
              get children() {
                return _$createComponent(QuestionPrompt, {
                  get request() {
                    return questions()[0];
                  }
                });
              }
            }), null);
            _$insert(_el$5, _$createComponent(Show, {
              get when() {
                return session()?.parentID;
              },
              get children() {
                return _$createComponent(SubagentFooter, {});
              }
            }), null);
            _$insert(_el$5, _$createComponent(Show, {
              get when() {
                return visible();
              },
              get children() {
                return _$createComponent(TuiPluginRuntime.Slot, {
                  name: "session_prompt",
                  mode: "replace",
                  get session_id() {
                    return route.sessionID;
                  },
                  get visible() {
                    return visible();
                  },
                  get disabled() {
                    return disabled();
                  },
                  on_submit: toBottom,
                  ref: bind,
                  get children() {
                    return _$createComponent(Prompt, {
                      get visible() {
                        return visible();
                      },
                      ref: bind,
                      get disabled() {
                        return disabled();
                      },
                      onSubmit: () => {
                        toBottom();
                      },
                      get sessionID() {
                        return route.sessionID;
                      },
                      get right() {
                        return _$createComponent(TuiPluginRuntime.Slot, {
                          name: "session_prompt_right",
                          get session_id() {
                            return route.sessionID;
                          }
                        });
                      }
                    });
                  }
                });
              }
            }), null);
            return _el$5;
          })()];
        }
      }), null);
      _$insert(_el$2, _$createComponent(Toast, {}), null);
      _$insert(_el$, _$createComponent(Show, {
        get when() {
          return sidebarVisible();
        },
        get children() {
          return _$createComponent(Switch, {
            get children() {
              return [_$createComponent(Match, {
                get when() {
                  return wide();
                },
                get children() {
                  return _$createComponent(Sidebar, {
                    get sessionID() {
                      return route.sessionID;
                    }
                  });
                }
              }), _$createComponent(Match, {
                get when() {
                  return !wide();
                },
                get children() {
                  var _el$6 = _$createElement("box");
                  _$setProp(_el$6, "position", "absolute");
                  _$setProp(_el$6, "top", 0);
                  _$setProp(_el$6, "left", 0);
                  _$setProp(_el$6, "right", 0);
                  _$setProp(_el$6, "bottom", 0);
                  _$setProp(_el$6, "alignItems", "flex-end");
                  _$insert(_el$6, _$createComponent(Sidebar, {
                    get sessionID() {
                      return route.sessionID;
                    }
                  }));
                  _$effect(_$p => _$setProp(_el$6, "backgroundColor", RGBA.fromInts(0, 0, 0, 70), _$p));
                  return _el$6;
                }
              })];
            }
          });
        }
      }), null);
      return _el$;
    }
  });
}
const MIME_BADGE = {
  "text/plain": "txt",
  "image/png": "img",
  "image/jpeg": "img",
  "image/gif": "img",
  "image/webp": "img",
  "application/pdf": "pdf",
  "application/x-directory": "dir"
};
function UserMessage(props) {
  const ctx = use();
  const local = useLocal();
  const text = createMemo(() => {
    const texts = props.parts.map(x => {
      if (x.type === "text" && !x.synthetic) {
        return x.text;
      }
      return null;
    }).filter(Boolean);
    return texts.join("\n\n");
  });
  const files = createMemo(() => props.parts.flatMap(x => x.type === "file" ? [x] : []));
  const {
    theme
  } = useTheme();
  const [hover, setHover] = createSignal(false);
  const queued = createMemo(() => props.pending && props.message.id > props.pending);
  const color = createMemo(() => local.agent.color(props.message.agent));
  const queuedFg = createMemo(() => selectedForeground(theme, color()));
  const metadataVisible = createMemo(() => queued() || ctx.showTimestamps());
  const compaction = createMemo(() => props.parts.find(x => x.type === "compaction"));
  return [_$createComponent(Show, {
    get when() {
      return text();
    },
    get children() {
      var _el$18 = _$createElement("box"),
        _el$19 = _$createElement("box"),
        _el$20 = _$createElement("text");
      _$insertNode(_el$18, _el$19);
      _$setProp(_el$18, "border", ["left"]);
      _$insertNode(_el$19, _el$20);
      _$setProp(_el$19, "onMouseOver", () => {
        setHover(true);
      });
      _$setProp(_el$19, "onMouseOut", () => {
        setHover(false);
      });
      _$setProp(_el$19, "paddingTop", 1);
      _$setProp(_el$19, "paddingBottom", 1);
      _$setProp(_el$19, "paddingLeft", 2);
      _$setProp(_el$19, "flexShrink", 0);
      _$insert(_el$20, text);
      _$insert(_el$19, _$createComponent(Show, {
        get when() {
          return files().length;
        },
        get children() {
          var _el$21 = _$createElement("box");
          _$setProp(_el$21, "flexDirection", "row");
          _$setProp(_el$21, "paddingTop", 1);
          _$setProp(_el$21, "gap", 1);
          _$setProp(_el$21, "flexWrap", "wrap");
          _$insert(_el$21, _$createComponent(For, {
            get each() {
              return files();
            },
            children: file => {
              const bg = createMemo(() => {
                if (file.mime.startsWith("image/")) return theme.accent;
                if (file.mime === "application/pdf") return theme.primary;
                return theme.secondary;
              });
              return (() => {
                var _el$26 = _$createElement("text"),
                  _el$27 = _$createElement("span"),
                  _el$28 = _$createTextNode(` `),
                  _el$29 = _$createTextNode(` `),
                  _el$30 = _$createElement("span"),
                  _el$31 = _$createTextNode(` `),
                  _el$32 = _$createTextNode(` `);
                _$insertNode(_el$26, _el$27);
                _$insertNode(_el$26, _el$30);
                _$insertNode(_el$27, _el$28);
                _$insertNode(_el$27, _el$29);
                _$insert(_el$27, () => MIME_BADGE[file.mime] ?? file.mime, _el$29);
                _$insertNode(_el$30, _el$31);
                _$insertNode(_el$30, _el$32);
                _$insert(_el$30, () => file.filename, _el$32);
                _$effect(_p$ => {
                  var _v$17 = theme.text,
                    _v$18 = {
                      bg: bg(),
                      fg: theme.background
                    },
                    _v$19 = {
                      bg: theme.backgroundElement,
                      fg: theme.textMuted
                    };
                  _v$17 !== _p$.e && (_p$.e = _$setProp(_el$26, "fg", _v$17, _p$.e));
                  _v$18 !== _p$.t && (_p$.t = _$setProp(_el$27, "style", _v$18, _p$.t));
                  _v$19 !== _p$.a && (_p$.a = _$setProp(_el$30, "style", _v$19, _p$.a));
                  return _p$;
                }, {
                  e: undefined,
                  t: undefined,
                  a: undefined
                });
                return _el$26;
              })();
            }
          }));
          _$effect(_$p => _$setProp(_el$21, "paddingBottom", metadataVisible() ? 1 : 0, _$p));
          return _el$21;
        }
      }), null);
      _$insert(_el$19, _$createComponent(Show, {
        get when() {
          return queued();
        },
        get fallback() {
          return _$createComponent(Show, {
            get when() {
              return ctx.showTimestamps();
            },
            get children() {
              var _el$33 = _$createElement("text"),
                _el$34 = _$createElement("span");
              _$insertNode(_el$33, _el$34);
              _$insert(_el$34, () => Locale.todayTimeOrDateTime(props.message.time.created));
              _$effect(_p$ => {
                var _v$20 = theme.textMuted,
                  _v$21 = {
                    fg: theme.textMuted
                  };
                _v$20 !== _p$.e && (_p$.e = _$setProp(_el$33, "fg", _v$20, _p$.e));
                _v$21 !== _p$.t && (_p$.t = _$setProp(_el$34, "style", _v$21, _p$.t));
                return _p$;
              }, {
                e: undefined,
                t: undefined
              });
              return _el$33;
            }
          });
        },
        get children() {
          var _el$22 = _$createElement("text"),
            _el$23 = _$createElement("span");
          _$insertNode(_el$22, _el$23);
          _$insertNode(_el$23, _$createTextNode(` QUEUED `));
          _$effect(_p$ => {
            var _v$0 = theme.textMuted,
              _v$1 = {
                bg: color(),
                fg: queuedFg(),
                bold: true
              };
            _v$0 !== _p$.e && (_p$.e = _$setProp(_el$22, "fg", _v$0, _p$.e));
            _v$1 !== _p$.t && (_p$.t = _$setProp(_el$23, "style", _v$1, _p$.t));
            return _p$;
          }, {
            e: undefined,
            t: undefined
          });
          return _el$22;
        }
      }), null);
      _$effect(_p$ => {
        var _v$10 = props.message.id,
          _v$11 = color(),
          _v$12 = SplitBorder.customBorderChars,
          _v$13 = props.index === 0 ? 0 : 1,
          _v$14 = props.onMouseUp,
          _v$15 = hover() ? theme.backgroundElement : theme.backgroundPanel,
          _v$16 = theme.text;
        _v$10 !== _p$.e && (_p$.e = _$setProp(_el$18, "id", _v$10, _p$.e));
        _v$11 !== _p$.t && (_p$.t = _$setProp(_el$18, "borderColor", _v$11, _p$.t));
        _v$12 !== _p$.a && (_p$.a = _$setProp(_el$18, "customBorderChars", _v$12, _p$.a));
        _v$13 !== _p$.o && (_p$.o = _$setProp(_el$18, "marginTop", _v$13, _p$.o));
        _v$14 !== _p$.i && (_p$.i = _$setProp(_el$19, "onMouseUp", _v$14, _p$.i));
        _v$15 !== _p$.n && (_p$.n = _$setProp(_el$19, "backgroundColor", _v$15, _p$.n));
        _v$16 !== _p$.s && (_p$.s = _$setProp(_el$20, "fg", _v$16, _p$.s));
        return _p$;
      }, {
        e: undefined,
        t: undefined,
        a: undefined,
        o: undefined,
        i: undefined,
        n: undefined,
        s: undefined
      });
      return _el$18;
    }
  }), _$createComponent(Show, {
    get when() {
      return compaction();
    },
    get children() {
      var _el$25 = _$createElement("box");
      _$setProp(_el$25, "marginTop", 1);
      _$setProp(_el$25, "border", ["top"]);
      _$setProp(_el$25, "title", " Compaction ");
      _$setProp(_el$25, "titleAlignment", "center");
      _$effect(_$p => _$setProp(_el$25, "borderColor", theme.borderActive, _$p));
      return _el$25;
    }
  })];
}
function AssistantMessage(props) {
  const ctx = use();
  const local = useLocal();
  const {
    theme
  } = useTheme();
  const sync = useSync();
  const messages = createMemo(() => sync.data.message[props.message.sessionID] ?? []);
  const model = createMemo(() => Model.name(ctx.providers(), props.message.providerID, props.message.modelID));
  const final = createMemo(() => {
    return props.message.finish && !["tool-calls", "unknown"].includes(props.message.finish);
  });
  const duration = createMemo(() => {
    if (!final()) return 0;
    if (!props.message.time.completed) return 0;
    const user = messages().find(x => x.role === "user" && x.id === props.message.parentID);
    if (!user || !user.time) return 0;
    return props.message.time.completed - user.time.created;
  });
  const keybind = useKeybind();
  return [_$createComponent(For, {
    get each() {
      return props.parts;
    },
    children: (part, index) => {
      const component = createMemo(() => PART_MAPPING[part.type]);
      return _$createComponent(Show, {
        get when() {
          return component();
        },
        get children() {
          return _$createComponent(Dynamic, {
            get last() {
              return index() === props.parts.length - 1;
            },
            get component() {
              return component();
            },
            part: part,
            get message() {
              return props.message;
            }
          });
        }
      });
    }
  }), _$createComponent(Show, {
    get when() {
      return props.parts.some(x => x.type === "tool" && x.tool === "task");
    },
    get children() {
      var _el$35 = _$createElement("box"),
        _el$36 = _$createElement("text"),
        _el$37 = _$createElement("span");
      _$insertNode(_el$35, _el$36);
      _$setProp(_el$35, "paddingTop", 1);
      _$setProp(_el$35, "paddingLeft", 3);
      _$insertNode(_el$36, _el$37);
      _$insert(_el$36, () => keybind.print("session_child_first"), _el$37);
      _$insertNode(_el$37, _$createTextNode(` view subagents`));
      _$effect(_p$ => {
        var _v$22 = theme.text,
          _v$23 = {
            fg: theme.textMuted
          };
        _v$22 !== _p$.e && (_p$.e = _$setProp(_el$36, "fg", _v$22, _p$.e));
        _v$23 !== _p$.t && (_p$.t = _$setProp(_el$37, "style", _v$23, _p$.t));
        return _p$;
      }, {
        e: undefined,
        t: undefined
      });
      return _el$35;
    }
  }), _$createComponent(Show, {
    get when() {
      return _$memo(() => !!props.message.error)() && props.message.error.name !== "MessageAbortedError";
    },
    get children() {
      var _el$39 = _$createElement("box"),
        _el$40 = _$createElement("text");
      _$insertNode(_el$39, _el$40);
      _$setProp(_el$39, "border", ["left"]);
      _$setProp(_el$39, "paddingTop", 1);
      _$setProp(_el$39, "paddingBottom", 1);
      _$setProp(_el$39, "paddingLeft", 2);
      _$setProp(_el$39, "marginTop", 1);
      _$insert(_el$40, () => props.message.error?.data.message);
      _$effect(_p$ => {
        var _v$24 = theme.backgroundPanel,
          _v$25 = SplitBorder.customBorderChars,
          _v$26 = theme.error,
          _v$27 = theme.textMuted;
        _v$24 !== _p$.e && (_p$.e = _$setProp(_el$39, "backgroundColor", _v$24, _p$.e));
        _v$25 !== _p$.t && (_p$.t = _$setProp(_el$39, "customBorderChars", _v$25, _p$.t));
        _v$26 !== _p$.a && (_p$.a = _$setProp(_el$39, "borderColor", _v$26, _p$.a));
        _v$27 !== _p$.o && (_p$.o = _$setProp(_el$40, "fg", _v$27, _p$.o));
        return _p$;
      }, {
        e: undefined,
        t: undefined,
        a: undefined,
        o: undefined
      });
      return _el$39;
    }
  }), _$createComponent(Switch, {
    get children() {
      return _$createComponent(Match, {
        get when() {
          return props.last || final() || props.message.error?.name === "MessageAbortedError";
        },
        get children() {
          var _el$41 = _$createElement("box"),
            _el$42 = _$createElement("text"),
            _el$43 = _$createElement("span"),
            _el$44 = _$createTextNode(`▣ `),
            _el$46 = _$createTextNode(` `),
            _el$47 = _$createElement("span"),
            _el$48 = _$createElement("span"),
            _el$49 = _$createTextNode(` · `);
          _$insertNode(_el$41, _el$42);
          _$setProp(_el$41, "paddingLeft", 3);
          _$insertNode(_el$42, _el$43);
          _$insertNode(_el$42, _el$46);
          _$insertNode(_el$42, _el$47);
          _$insertNode(_el$42, _el$48);
          _$setProp(_el$42, "marginTop", 1);
          _$insertNode(_el$43, _el$44);
          _$insert(_el$47, () => Locale.titlecase(props.message.mode));
          _$insertNode(_el$48, _el$49);
          _$insert(_el$48, model, null);
          _$insert(_el$42, _$createComponent(Show, {
            get when() {
              return duration();
            },
            get children() {
              var _el$50 = _$createElement("span"),
                _el$51 = _$createTextNode(` · `);
              _$insertNode(_el$50, _el$51);
              _$insert(_el$50, () => Locale.duration(duration()), null);
              _$effect(_$p => _$setProp(_el$50, "style", {
                fg: theme.textMuted
              }, _$p));
              return _el$50;
            }
          }), null);
          _$insert(_el$42, _$createComponent(Show, {
            get when() {
              return props.message.error?.name === "MessageAbortedError";
            },
            get children() {
              var _el$52 = _$createElement("span");
              _$insertNode(_el$52, _$createTextNode(` · interrupted`));
              _$effect(_$p => _$setProp(_el$52, "style", {
                fg: theme.textMuted
              }, _$p));
              return _el$52;
            }
          }), null);
          _$effect(_p$ => {
            var _v$28 = {
                fg: props.message.error?.name === "MessageAbortedError" ? theme.textMuted : local.agent.color(props.message.agent)
              },
              _v$29 = {
                fg: theme.text
              },
              _v$30 = {
                fg: theme.textMuted
              };
            _v$28 !== _p$.e && (_p$.e = _$setProp(_el$43, "style", _v$28, _p$.e));
            _v$29 !== _p$.t && (_p$.t = _$setProp(_el$47, "style", _v$29, _p$.t));
            _v$30 !== _p$.a && (_p$.a = _$setProp(_el$48, "style", _v$30, _p$.a));
            return _p$;
          }, {
            e: undefined,
            t: undefined,
            a: undefined
          });
          return _el$41;
        }
      });
    }
  })];
}
const PART_MAPPING = {
  text: TextPart,
  tool: ToolPart,
  reasoning: ReasoningPart
};
function ReasoningPart(props) {
  const {
    theme,
    subtleSyntax
  } = useTheme();
  const ctx = use();
  const content = createMemo(() => {
    // Filter out redacted reasoning chunks from OpenRouter
    // OpenRouter sends encrypted reasoning data that appears as [REDACTED]
    return props.part.text.replace("[REDACTED]", "").trim();
  });
  return _$createComponent(Show, {
    get when() {
      return _$memo(() => !!content())() && ctx.showThinking();
    },
    get children() {
      var _el$54 = _$createElement("box"),
        _el$55 = _$createElement("code");
      _$insertNode(_el$54, _el$55);
      _$setProp(_el$54, "paddingLeft", 2);
      _$setProp(_el$54, "marginTop", 1);
      _$setProp(_el$54, "flexDirection", "column");
      _$setProp(_el$54, "border", ["left"]);
      _$setProp(_el$55, "filetype", "markdown");
      _$setProp(_el$55, "drawUnstyledText", false);
      _$setProp(_el$55, "streaming", true);
      _$effect(_p$ => {
        var _v$31 = "text-" + props.part.id,
          _v$32 = SplitBorder.customBorderChars,
          _v$33 = theme.backgroundElement,
          _v$34 = subtleSyntax(),
          _v$35 = "_Thinking:_ " + content(),
          _v$36 = ctx.conceal(),
          _v$37 = theme.textMuted;
        _v$31 !== _p$.e && (_p$.e = _$setProp(_el$54, "id", _v$31, _p$.e));
        _v$32 !== _p$.t && (_p$.t = _$setProp(_el$54, "customBorderChars", _v$32, _p$.t));
        _v$33 !== _p$.a && (_p$.a = _$setProp(_el$54, "borderColor", _v$33, _p$.a));
        _v$34 !== _p$.o && (_p$.o = _$setProp(_el$55, "syntaxStyle", _v$34, _p$.o));
        _v$35 !== _p$.i && (_p$.i = _$setProp(_el$55, "content", _v$35, _p$.i));
        _v$36 !== _p$.n && (_p$.n = _$setProp(_el$55, "conceal", _v$36, _p$.n));
        _v$37 !== _p$.s && (_p$.s = _$setProp(_el$55, "fg", _v$37, _p$.s));
        return _p$;
      }, {
        e: undefined,
        t: undefined,
        a: undefined,
        o: undefined,
        i: undefined,
        n: undefined,
        s: undefined
      });
      return _el$54;
    }
  });
}
function TextPart(props) {
  const ctx = use();
  const {
    theme,
    syntax
  } = useTheme();
  return _$createComponent(Show, {
    get when() {
      return props.part.text.trim();
    },
    get children() {
      var _el$56 = _$createElement("box");
      _$setProp(_el$56, "paddingLeft", 3);
      _$setProp(_el$56, "marginTop", 1);
      _$setProp(_el$56, "flexShrink", 0);
      _$insert(_el$56, _$createComponent(Switch, {
        get children() {
          return [_$createComponent(Match, {
            get when() {
              return Flag.CLOSEDCODE_EXPERIMENTAL_MARKDOWN;
            },
            get children() {
              var _el$57 = _$createElement("markdown");
              _$setProp(_el$57, "streaming", true);
              _$effect(_p$ => {
                var _v$38 = syntax(),
                  _v$39 = props.part.text.trim(),
                  _v$40 = ctx.conceal(),
                  _v$41 = theme.markdownText,
                  _v$42 = theme.background;
                _v$38 !== _p$.e && (_p$.e = _$setProp(_el$57, "syntaxStyle", _v$38, _p$.e));
                _v$39 !== _p$.t && (_p$.t = _$setProp(_el$57, "content", _v$39, _p$.t));
                _v$40 !== _p$.a && (_p$.a = _$setProp(_el$57, "conceal", _v$40, _p$.a));
                _v$41 !== _p$.o && (_p$.o = _$setProp(_el$57, "fg", _v$41, _p$.o));
                _v$42 !== _p$.i && (_p$.i = _$setProp(_el$57, "bg", _v$42, _p$.i));
                return _p$;
              }, {
                e: undefined,
                t: undefined,
                a: undefined,
                o: undefined,
                i: undefined
              });
              return _el$57;
            }
          }), _$createComponent(Match, {
            get when() {
              return !Flag.CLOSEDCODE_EXPERIMENTAL_MARKDOWN;
            },
            get children() {
              var _el$58 = _$createElement("code");
              _$setProp(_el$58, "filetype", "markdown");
              _$setProp(_el$58, "drawUnstyledText", false);
              _$setProp(_el$58, "streaming", true);
              _$effect(_p$ => {
                var _v$43 = syntax(),
                  _v$44 = props.part.text.trim(),
                  _v$45 = ctx.conceal(),
                  _v$46 = theme.text;
                _v$43 !== _p$.e && (_p$.e = _$setProp(_el$58, "syntaxStyle", _v$43, _p$.e));
                _v$44 !== _p$.t && (_p$.t = _$setProp(_el$58, "content", _v$44, _p$.t));
                _v$45 !== _p$.a && (_p$.a = _$setProp(_el$58, "conceal", _v$45, _p$.a));
                _v$46 !== _p$.o && (_p$.o = _$setProp(_el$58, "fg", _v$46, _p$.o));
                return _p$;
              }, {
                e: undefined,
                t: undefined,
                a: undefined,
                o: undefined
              });
              return _el$58;
            }
          })];
        }
      }));
      _$effect(_$p => _$setProp(_el$56, "id", "text-" + props.part.id, _$p));
      return _el$56;
    }
  });
}

// Pending messages moved to individual tool pending functions

function ToolPart(props) {
  const ctx = use();
  const sync = useSync();

  // Hide tool if showDetails is false and tool completed successfully
  const shouldHide = createMemo(() => {
    if (ctx.showDetails()) return false;
    if (props.part.state.status !== "completed") return false;
    return true;
  });
  const toolprops = {
    get metadata() {
      return props.part.state.status === "pending" ? {} : props.part.state.metadata ?? {};
    },
    get input() {
      return props.part.state.input ?? {};
    },
    get output() {
      return props.part.state.status === "completed" ? props.part.state.output : undefined;
    },
    get permission() {
      const permissions = sync.data.permission[props.message.sessionID] ?? [];
      const permissionIndex = permissions.findIndex(x => x.tool?.callID === props.part.callID);
      return permissions[permissionIndex];
    },
    get tool() {
      return props.part.tool;
    },
    get part() {
      return props.part;
    }
  };
  return _$createComponent(Show, {
    get when() {
      return !shouldHide();
    },
    get children() {
      return _$createComponent(Switch, {
        get children() {
          return [_$createComponent(Match, {
            get when() {
              return props.part.tool === ShellID.ToolID;
            },
            get children() {
              return _$createComponent(Shell, toolprops);
            }
          }), _$createComponent(Match, {
            get when() {
              return props.part.tool === "glob";
            },
            get children() {
              return _$createComponent(Glob, toolprops);
            }
          }), _$createComponent(Match, {
            get when() {
              return props.part.tool === "read";
            },
            get children() {
              return _$createComponent(Read, toolprops);
            }
          }), _$createComponent(Match, {
            get when() {
              return props.part.tool === "grep";
            },
            get children() {
              return _$createComponent(Grep, toolprops);
            }
          }), _$createComponent(Match, {
            get when() {
              return props.part.tool === "webfetch";
            },
            get children() {
              return _$createComponent(WebFetch, toolprops);
            }
          }), _$createComponent(Match, {
            get when() {
              return props.part.tool === "websearch";
            },
            get children() {
              return _$createComponent(WebSearch, toolprops);
            }
          }), _$createComponent(Match, {
            get when() {
              return props.part.tool === "write";
            },
            get children() {
              return _$createComponent(Write, toolprops);
            }
          }), _$createComponent(Match, {
            get when() {
              return props.part.tool === "edit";
            },
            get children() {
              return _$createComponent(Edit, toolprops);
            }
          }), _$createComponent(Match, {
            get when() {
              return props.part.tool === "task";
            },
            get children() {
              return _$createComponent(Task, toolprops);
            }
          }), _$createComponent(Match, {
            get when() {
              return props.part.tool === "apply_patch";
            },
            get children() {
              return _$createComponent(ApplyPatch, toolprops);
            }
          }), _$createComponent(Match, {
            get when() {
              return props.part.tool === "todowrite";
            },
            get children() {
              return _$createComponent(TodoWrite, toolprops);
            }
          }), _$createComponent(Match, {
            get when() {
              return props.part.tool === "question";
            },
            get children() {
              return _$createComponent(Question, toolprops);
            }
          }), _$createComponent(Match, {
            get when() {
              return props.part.tool === "skill";
            },
            get children() {
              return _$createComponent(Skill, toolprops);
            }
          }), _$createComponent(Match, {
            when: true,
            get children() {
              return _$createComponent(GenericTool, toolprops);
            }
          })];
        }
      });
    }
  });
}
function GenericTool(props) {
  const {
    theme
  } = useTheme();
  const ctx = use();
  const output = createMemo(() => props.output?.trim() ?? "");
  const [expanded, setExpanded] = createSignal(false);
  const lines = createMemo(() => output().split("\n"));
  const maxLines = 3;
  const overflow = createMemo(() => lines().length > maxLines);
  const limited = createMemo(() => {
    if (expanded() || !overflow()) return output();
    return [...lines().slice(0, maxLines), "…"].join("\n");
  });
  return _$createComponent(Show, {
    get when() {
      return _$memo(() => !!props.output)() && ctx.showGenericToolOutput();
    },
    get fallback() {
      return _$createComponent(InlineTool, {
        icon: "\u2699",
        pending: "Writing command...",
        complete: true,
        get part() {
          return props.part;
        },
        get children() {
          return [_$memo(() => props.tool), " ", _$memo(() => input(props.input))];
        }
      });
    },
    get children() {
      return _$createComponent(BlockTool, {
        get title() {
          return `# ${props.tool} ${input(props.input)}`;
        },
        get part() {
          return props.part;
        },
        get onClick() {
          return overflow() ? () => setExpanded(prev => !prev) : undefined;
        },
        get children() {
          var _el$59 = _$createElement("box"),
            _el$60 = _$createElement("text");
          _$insertNode(_el$59, _el$60);
          _$setProp(_el$59, "gap", 1);
          _$insert(_el$60, limited);
          _$insert(_el$59, _$createComponent(Show, {
            get when() {
              return overflow();
            },
            get children() {
              var _el$61 = _$createElement("text");
              _$insert(_el$61, () => expanded() ? "Click to collapse" : "Click to expand");
              _$effect(_$p => _$setProp(_el$61, "fg", theme.textMuted, _$p));
              return _el$61;
            }
          }), null);
          _$effect(_$p => _$setProp(_el$60, "fg", theme.text, _$p));
          return _el$59;
        }
      });
    }
  });
}
function InlineTool(props) {
  const [margin, setMargin] = createSignal(0);
  const {
    theme
  } = useTheme();
  const ctx = use();
  const sync = useSync();
  const renderer = useRenderer();
  const [hover, setHover] = createSignal(false);
  const permission = createMemo(() => {
    const callID = sync.data.permission[ctx.sessionID]?.at(0)?.tool?.callID;
    if (!callID) return false;
    return callID === props.part.callID;
  });
  const fg = createMemo(() => {
    if (permission()) return theme.warning;
    if (hover() && props.onClick) return theme.text;
    if (props.complete) return theme.textMuted;
    return theme.text;
  });
  const error = createMemo(() => props.part.state.status === "error" ? props.part.state.error : undefined);
  const denied = createMemo(() => error()?.includes("QuestionRejectedError") || error()?.includes("rejected permission") || error()?.includes("specified a rule") || error()?.includes("user dismissed"));
  return (() => {
    var _el$62 = _$createElement("box");
    _$setProp(_el$62, "paddingLeft", 3);
    _$setProp(_el$62, "onMouseOver", () => props.onClick && setHover(true));
    _$setProp(_el$62, "onMouseOut", () => setHover(false));
    _$setProp(_el$62, "onMouseUp", () => {
      if (renderer.getSelection()?.getSelectedText()) return;
      props.onClick?.();
    });
    _$setProp(_el$62, "renderBefore", function () {
      const el = this;
      const parent = el.parent;
      if (!parent) {
        return;
      }
      if (el.height > 1) {
        setMargin(1);
        return;
      }
      const children = parent.getChildren();
      const index = children.indexOf(el);
      const previous = children[index - 1];
      if (!previous) {
        setMargin(0);
        return;
      }
      if (previous.height > 1 || previous.id.startsWith("text-")) {
        setMargin(1);
        return;
      }
    });
    _$insert(_el$62, _$createComponent(Switch, {
      get children() {
        return [_$createComponent(Match, {
          get when() {
            return props.spinner;
          },
          get children() {
            return _$createComponent(Spinner, {
              get color() {
                return fg();
              },
              get children() {
                return props.children;
              }
            });
          }
        }), _$createComponent(Match, {
          when: true,
          get children() {
            var _el$63 = _$createElement("text");
            _$setProp(_el$63, "paddingLeft", 3);
            _$insert(_el$63, _$createComponent(Show, {
              get fallback() {
                return ["~ ", _$memo(() => props.pending)];
              },
              get when() {
                return props.complete;
              },
              get children() {
                return [(() => {
                  var _el$64 = _$createElement("span");
                  _$insert(_el$64, () => props.icon);
                  _$effect(_$p => _$setProp(_el$64, "style", {
                    fg: props.iconColor
                  }, _$p));
                  return _el$64;
                })(), " ", _$memo(() => props.children)];
              }
            }));
            _$effect(_p$ => {
              var _v$47 = fg(),
                _v$48 = denied() ? TextAttributes.STRIKETHROUGH : undefined;
              _v$47 !== _p$.e && (_p$.e = _$setProp(_el$63, "fg", _v$47, _p$.e));
              _v$48 !== _p$.t && (_p$.t = _$setProp(_el$63, "attributes", _v$48, _p$.t));
              return _p$;
            }, {
              e: undefined,
              t: undefined
            });
            return _el$63;
          }
        })];
      }
    }), null);
    _$insert(_el$62, _$createComponent(Show, {
      get when() {
        return _$memo(() => !!error())() && !denied();
      },
      get children() {
        var _el$65 = _$createElement("text");
        _$insert(_el$65, error);
        _$effect(_$p => _$setProp(_el$65, "fg", theme.error, _$p));
        return _el$65;
      }
    }), null);
    _$effect(_$p => _$setProp(_el$62, "marginTop", margin(), _$p));
    return _el$62;
  })();
}
function BlockTool(props) {
  const {
    theme
  } = useTheme();
  const renderer = useRenderer();
  const [hover, setHover] = createSignal(false);
  const error = createMemo(() => props.part?.state.status === "error" ? props.part.state.error : undefined);
  return (() => {
    var _el$66 = _$createElement("box");
    _$setProp(_el$66, "border", ["left"]);
    _$setProp(_el$66, "paddingTop", 1);
    _$setProp(_el$66, "paddingBottom", 1);
    _$setProp(_el$66, "paddingLeft", 2);
    _$setProp(_el$66, "marginTop", 1);
    _$setProp(_el$66, "gap", 1);
    _$setProp(_el$66, "onMouseOver", () => props.onClick && setHover(true));
    _$setProp(_el$66, "onMouseOut", () => setHover(false));
    _$setProp(_el$66, "onMouseUp", () => {
      if (renderer.getSelection()?.getSelectedText()) return;
      props.onClick?.();
    });
    _$insert(_el$66, _$createComponent(Show, {
      get when() {
        return props.spinner;
      },
      get fallback() {
        return (() => {
          var _el$68 = _$createElement("text");
          _$setProp(_el$68, "paddingLeft", 3);
          _$insert(_el$68, () => props.title);
          _$effect(_$p => _$setProp(_el$68, "fg", theme.textMuted, _$p));
          return _el$68;
        })();
      },
      get children() {
        return _$createComponent(Spinner, {
          get color() {
            return theme.textMuted;
          },
          get children() {
            return props.title.replace(/^# /, "");
          }
        });
      }
    }), null);
    _$insert(_el$66, () => props.children, null);
    _$insert(_el$66, _$createComponent(Show, {
      get when() {
        return error();
      },
      get children() {
        var _el$67 = _$createElement("text");
        _$insert(_el$67, error);
        _$effect(_$p => _$setProp(_el$67, "fg", theme.error, _$p));
        return _el$67;
      }
    }), null);
    _$effect(_p$ => {
      var _v$49 = hover() ? theme.backgroundMenu : theme.backgroundPanel,
        _v$50 = SplitBorder.customBorderChars,
        _v$51 = theme.background;
      _v$49 !== _p$.e && (_p$.e = _$setProp(_el$66, "backgroundColor", _v$49, _p$.e));
      _v$50 !== _p$.t && (_p$.t = _$setProp(_el$66, "customBorderChars", _v$50, _p$.t));
      _v$51 !== _p$.a && (_p$.a = _$setProp(_el$66, "borderColor", _v$51, _p$.a));
      return _p$;
    }, {
      e: undefined,
      t: undefined,
      a: undefined
    });
    return _el$66;
  })();
}
function Shell(props) {
  const {
    theme
  } = useTheme();
  const sync = useSync();
  const isRunning = createMemo(() => props.part.state.status === "running");
  const output = createMemo(() => stripAnsi(props.metadata.output?.trim() ?? ""));
  const [expanded, setExpanded] = createSignal(false);
  const lines = createMemo(() => output().split("\n"));
  const overflow = createMemo(() => lines().length > 10);
  const limited = createMemo(() => {
    if (expanded() || !overflow()) return output();
    return [...lines().slice(0, 10), "…"].join("\n");
  });
  const workdirDisplay = createMemo(() => {
    const workdir = props.input.workdir;
    if (!workdir || workdir === ".") return undefined;
    const base = sync.path.directory;
    if (!base) return undefined;
    const absolute = path.resolve(base, workdir);
    if (absolute === base) return undefined;
    const home = Global.Path.home;
    if (!home) return absolute;
    const match = absolute === home || absolute.startsWith(home + path.sep);
    return match ? absolute.replace(home, "~") : absolute;
  });
  const title = createMemo(() => {
    const desc = props.input.description ?? "Shell";
    const wd = workdirDisplay();
    if (!wd) return `# ${desc}`;
    if (desc.includes(wd)) return `# ${desc}`;
    return `# ${desc} in ${wd}`;
  });
  return _$createComponent(Switch, {
    get children() {
      return [_$createComponent(Match, {
        get when() {
          return props.metadata.output !== undefined;
        },
        get children() {
          return _$createComponent(BlockTool, {
            get title() {
              return title();
            },
            get part() {
              return props.part;
            },
            get spinner() {
              return isRunning();
            },
            get onClick() {
              return overflow() ? () => setExpanded(prev => !prev) : undefined;
            },
            get children() {
              var _el$69 = _$createElement("box"),
                _el$70 = _$createElement("text"),
                _el$71 = _$createTextNode(`$ `);
              _$insertNode(_el$69, _el$70);
              _$setProp(_el$69, "gap", 1);
              _$insertNode(_el$70, _el$71);
              _$insert(_el$70, () => props.input.command, null);
              _$insert(_el$69, _$createComponent(Show, {
                get when() {
                  return output();
                },
                get children() {
                  var _el$72 = _$createElement("text");
                  _$insert(_el$72, limited);
                  _$effect(_$p => _$setProp(_el$72, "fg", theme.text, _$p));
                  return _el$72;
                }
              }), null);
              _$insert(_el$69, _$createComponent(Show, {
                get when() {
                  return overflow();
                },
                get children() {
                  var _el$73 = _$createElement("text");
                  _$insert(_el$73, () => expanded() ? "Click to collapse" : "Click to expand");
                  _$effect(_$p => _$setProp(_el$73, "fg", theme.textMuted, _$p));
                  return _el$73;
                }
              }), null);
              _$effect(_$p => _$setProp(_el$70, "fg", theme.text, _$p));
              return _el$69;
            }
          });
        }
      }), _$createComponent(Match, {
        when: true,
        get children() {
          return _$createComponent(InlineTool, {
            icon: "$",
            pending: "Writing command...",
            get complete() {
              return props.input.command;
            },
            get part() {
              return props.part;
            },
            get children() {
              return props.input.command;
            }
          });
        }
      })];
    }
  });
}
function Write(props) {
  const {
    theme,
    syntax
  } = useTheme();
  const code = createMemo(() => {
    if (!props.input.content) return "";
    return props.input.content;
  });
  return _$createComponent(Switch, {
    get children() {
      return [_$createComponent(Match, {
        get when() {
          return props.metadata.diagnostics !== undefined;
        },
        get children() {
          return _$createComponent(BlockTool, {
            get title() {
              return "# Wrote " + normalizePath(props.input.filePath);
            },
            get part() {
              return props.part;
            },
            get children() {
              return [(() => {
                var _el$74 = _$createElement("line_number"),
                  _el$75 = _$createElement("code");
                _$insertNode(_el$74, _el$75);
                _$setProp(_el$74, "minWidth", 3);
                _$setProp(_el$74, "paddingRight", 1);
                _$setProp(_el$75, "conceal", false);
                _$effect(_p$ => {
                  var _v$52 = theme.textMuted,
                    _v$53 = theme.text,
                    _v$54 = filetype(props.input.filePath),
                    _v$55 = syntax(),
                    _v$56 = code();
                  _v$52 !== _p$.e && (_p$.e = _$setProp(_el$74, "fg", _v$52, _p$.e));
                  _v$53 !== _p$.t && (_p$.t = _$setProp(_el$75, "fg", _v$53, _p$.t));
                  _v$54 !== _p$.a && (_p$.a = _$setProp(_el$75, "filetype", _v$54, _p$.a));
                  _v$55 !== _p$.o && (_p$.o = _$setProp(_el$75, "syntaxStyle", _v$55, _p$.o));
                  _v$56 !== _p$.i && (_p$.i = _$setProp(_el$75, "content", _v$56, _p$.i));
                  return _p$;
                }, {
                  e: undefined,
                  t: undefined,
                  a: undefined,
                  o: undefined,
                  i: undefined
                });
                return _el$74;
              })(), _$createComponent(Diagnostics, {
                get diagnostics() {
                  return props.metadata.diagnostics;
                },
                get filePath() {
                  return props.input.filePath ?? "";
                }
              })];
            }
          });
        }
      }), _$createComponent(Match, {
        when: true,
        get children() {
          return _$createComponent(InlineTool, {
            icon: "\u2190",
            pending: "Preparing write...",
            get complete() {
              return props.input.filePath;
            },
            get part() {
              return props.part;
            },
            get children() {
              return ["Write ", _$memo(() => normalizePath(props.input.filePath))];
            }
          });
        }
      })];
    }
  });
}
function Glob(props) {
  return _$createComponent(InlineTool, {
    icon: "\u2731",
    pending: "Finding files...",
    get complete() {
      return props.input.pattern;
    },
    get part() {
      return props.part;
    },
    get children() {
      return ["Glob \"", _$memo(() => props.input.pattern), "\" ", _$createComponent(Show, {
        get when() {
          return props.input.path;
        },
        get children() {
          return ["in ", _$memo(() => normalizePath(props.input.path)), " "];
        }
      }), _$createComponent(Show, {
        get when() {
          return props.metadata.count;
        },
        get children() {
          return ["(", _$memo(() => props.metadata.count), " ", _$memo(() => props.metadata.count === 1 ? "match" : "matches"), ")"];
        }
      })];
    }
  });
}
function Read(props) {
  const {
    theme
  } = useTheme();
  const isRunning = createMemo(() => props.part.state.status === "running");
  const loaded = createMemo(() => {
    if (props.part.state.status !== "completed") return [];
    if (props.part.state.time.compacted) return [];
    const value = props.metadata.loaded;
    if (!value || !Array.isArray(value)) return [];
    return value.filter(p => typeof p === "string");
  });
  return [_$createComponent(InlineTool, {
    icon: "\u2192",
    pending: "Reading file...",
    get complete() {
      return props.input.filePath;
    },
    get spinner() {
      return isRunning();
    },
    get part() {
      return props.part;
    },
    get children() {
      return ["Read ", _$memo(() => normalizePath(props.input.filePath)), " ", _$memo(() => input(props.input, ["filePath"]))];
    }
  }), _$createComponent(For, {
    get each() {
      return loaded();
    },
    children: filepath => (() => {
      var _el$76 = _$createElement("box"),
        _el$77 = _$createElement("text"),
        _el$78 = _$createTextNode(`↳ Loaded `);
      _$insertNode(_el$76, _el$77);
      _$setProp(_el$76, "paddingLeft", 3);
      _$insertNode(_el$77, _el$78);
      _$setProp(_el$77, "paddingLeft", 3);
      _$insert(_el$77, () => normalizePath(filepath), null);
      _$effect(_$p => _$setProp(_el$77, "fg", theme.textMuted, _$p));
      return _el$76;
    })()
  })];
}
function Grep(props) {
  return _$createComponent(InlineTool, {
    icon: "\u2731",
    pending: "Searching content...",
    get complete() {
      return props.input.pattern;
    },
    get part() {
      return props.part;
    },
    get children() {
      return ["Grep \"", _$memo(() => props.input.pattern), "\" ", _$createComponent(Show, {
        get when() {
          return props.input.path;
        },
        get children() {
          return ["in ", _$memo(() => normalizePath(props.input.path)), " "];
        }
      }), _$createComponent(Show, {
        get when() {
          return props.metadata.matches;
        },
        get children() {
          return ["(", _$memo(() => props.metadata.matches), " ", _$memo(() => props.metadata.matches === 1 ? "match" : "matches"), ")"];
        }
      })];
    }
  });
}
function WebFetch(props) {
  return _$createComponent(InlineTool, {
    icon: "%",
    pending: "Fetching from the web...",
    get complete() {
      return props.input.url;
    },
    get part() {
      return props.part;
    },
    get children() {
      return ["WebFetch ", _$memo(() => props.input.url)];
    }
  });
}
function WebSearch(props) {
  const metadata = props.metadata;
  return _$createComponent(InlineTool, {
    icon: "\u25C8",
    pending: "Searching web...",
    get complete() {
      return props.input.query;
    },
    get part() {
      return props.part;
    },
    get children() {
      return ["Exa Web Search \"", _$memo(() => props.input.query), "\" ", _$createComponent(Show, {
        get when() {
          return metadata.numResults;
        },
        get children() {
          return ["(", _$memo(() => metadata.numResults), " results)"];
        }
      })];
    }
  });
}
function Task(props) {
  const {
    navigate
  } = useRoute();
  const sync = useSync();
  onMount(() => {
    if (props.metadata.sessionId && !sync.data.message[props.metadata.sessionId]?.length) void sync.session.sync(props.metadata.sessionId);
  });
  const messages = createMemo(() => sync.data.message[props.metadata.sessionId ?? ""] ?? []);
  const tools = createMemo(() => {
    return messages().flatMap(msg => (sync.data.part[msg.id] ?? []).filter(part => part.type === "tool").map(part => ({
      tool: part.tool,
      state: part.state
    })));
  });
  const current = createMemo(() => tools().findLast(x => (x.state.status === "running" || x.state.status === "completed") && x.state.title));
  const isRunning = createMemo(() => props.part.state.status === "running");
  const duration = createMemo(() => {
    const first = messages().find(x => x.role === "user")?.time.created;
    const assistant = messages().findLast(x => x.role === "assistant")?.time.completed;
    if (!first || !assistant) return 0;
    return assistant - first;
  });
  const content = createMemo(() => {
    if (!props.input.description) return "";
    let content = [`${Locale.titlecase(props.input.subagent_type ?? "General")} Task — ${props.input.description}`];
    if (isRunning() && tools().length > 0) {
      // content[0] += ` · ${tools().length} toolcalls`
      if (current()) {
        const state = current().state;
        const title = state.status === "running" || state.status === "completed" ? state.title : undefined;
        content.push(`↳ ${Locale.titlecase(current().tool)} ${title}`);
      } else content.push(`↳ ${tools().length} toolcalls`);
    }
    if (props.part.state.status === "completed") {
      content.push(`└ ${tools().length} toolcalls · ${Locale.duration(duration())}`);
    }
    return content.join("\n");
  });
  return _$createComponent(InlineTool, {
    icon: "\u2502",
    get spinner() {
      return isRunning();
    },
    get complete() {
      return props.input.description;
    },
    pending: "Delegating...",
    get part() {
      return props.part;
    },
    onClick: () => {
      if (props.metadata.sessionId) {
        navigate({
          type: "session",
          sessionID: props.metadata.sessionId
        });
      }
    },
    get children() {
      return content();
    }
  });
}
function Edit(props) {
  const ctx = use();
  const {
    theme,
    syntax
  } = useTheme();
  const view = createMemo(() => {
    const diffStyle = ctx.tui.diff_style;
    if (diffStyle === "stacked") return "unified";
    // Default to "auto" behavior
    return ctx.width > 120 ? "split" : "unified";
  });
  const ft = createMemo(() => filetype(props.input.filePath));
  const diffContent = createMemo(() => props.metadata.diff);
  return _$createComponent(Switch, {
    get children() {
      return [_$createComponent(Match, {
        get when() {
          return props.metadata.diff !== undefined;
        },
        get children() {
          return _$createComponent(BlockTool, {
            get title() {
              return "← Edit " + normalizePath(props.input.filePath);
            },
            get part() {
              return props.part;
            },
            get children() {
              return [(() => {
                var _el$79 = _$createElement("box"),
                  _el$80 = _$createElement("diff");
                _$insertNode(_el$79, _el$80);
                _$setProp(_el$79, "paddingLeft", 1);
                _$setProp(_el$80, "showLineNumbers", true);
                _$setProp(_el$80, "width", "100%");
                _$effect(_p$ => {
                  var _v$57 = diffContent(),
                    _v$58 = view(),
                    _v$59 = ft(),
                    _v$60 = syntax(),
                    _v$61 = ctx.diffWrapMode(),
                    _v$62 = theme.text,
                    _v$63 = theme.diffAddedBg,
                    _v$64 = theme.diffRemovedBg,
                    _v$65 = theme.diffContextBg,
                    _v$66 = theme.diffHighlightAdded,
                    _v$67 = theme.diffHighlightRemoved,
                    _v$68 = theme.diffLineNumber,
                    _v$69 = theme.diffContextBg,
                    _v$70 = theme.diffAddedLineNumberBg,
                    _v$71 = theme.diffRemovedLineNumberBg;
                  _v$57 !== _p$.e && (_p$.e = _$setProp(_el$80, "diff", _v$57, _p$.e));
                  _v$58 !== _p$.t && (_p$.t = _$setProp(_el$80, "view", _v$58, _p$.t));
                  _v$59 !== _p$.a && (_p$.a = _$setProp(_el$80, "filetype", _v$59, _p$.a));
                  _v$60 !== _p$.o && (_p$.o = _$setProp(_el$80, "syntaxStyle", _v$60, _p$.o));
                  _v$61 !== _p$.i && (_p$.i = _$setProp(_el$80, "wrapMode", _v$61, _p$.i));
                  _v$62 !== _p$.n && (_p$.n = _$setProp(_el$80, "fg", _v$62, _p$.n));
                  _v$63 !== _p$.s && (_p$.s = _$setProp(_el$80, "addedBg", _v$63, _p$.s));
                  _v$64 !== _p$.h && (_p$.h = _$setProp(_el$80, "removedBg", _v$64, _p$.h));
                  _v$65 !== _p$.r && (_p$.r = _$setProp(_el$80, "contextBg", _v$65, _p$.r));
                  _v$66 !== _p$.d && (_p$.d = _$setProp(_el$80, "addedSignColor", _v$66, _p$.d));
                  _v$67 !== _p$.l && (_p$.l = _$setProp(_el$80, "removedSignColor", _v$67, _p$.l));
                  _v$68 !== _p$.u && (_p$.u = _$setProp(_el$80, "lineNumberFg", _v$68, _p$.u));
                  _v$69 !== _p$.c && (_p$.c = _$setProp(_el$80, "lineNumberBg", _v$69, _p$.c));
                  _v$70 !== _p$.w && (_p$.w = _$setProp(_el$80, "addedLineNumberBg", _v$70, _p$.w));
                  _v$71 !== _p$.m && (_p$.m = _$setProp(_el$80, "removedLineNumberBg", _v$71, _p$.m));
                  return _p$;
                }, {
                  e: undefined,
                  t: undefined,
                  a: undefined,
                  o: undefined,
                  i: undefined,
                  n: undefined,
                  s: undefined,
                  h: undefined,
                  r: undefined,
                  d: undefined,
                  l: undefined,
                  u: undefined,
                  c: undefined,
                  w: undefined,
                  m: undefined
                });
                return _el$79;
              })(), _$createComponent(Diagnostics, {
                get diagnostics() {
                  return props.metadata.diagnostics;
                },
                get filePath() {
                  return props.input.filePath ?? "";
                }
              })];
            }
          });
        }
      }), _$createComponent(Match, {
        when: true,
        get children() {
          return _$createComponent(InlineTool, {
            icon: "\u2190",
            pending: "Preparing edit...",
            get complete() {
              return props.input.filePath;
            },
            get part() {
              return props.part;
            },
            get children() {
              return ["Edit ", _$memo(() => normalizePath(props.input.filePath)), " ", _$memo(() => input({
                replaceAll: props.input.replaceAll
              }))];
            }
          });
        }
      })];
    }
  });
}
function ApplyPatch(props) {
  const ctx = use();
  const {
    theme,
    syntax
  } = useTheme();
  const files = createMemo(() => props.metadata.files ?? []);
  const view = createMemo(() => {
    const diffStyle = ctx.tui.diff_style;
    if (diffStyle === "stacked") return "unified";
    return ctx.width > 120 ? "split" : "unified";
  });
  function Diff(p) {
    return (() => {
      var _el$81 = _$createElement("box"),
        _el$82 = _$createElement("diff");
      _$insertNode(_el$81, _el$82);
      _$setProp(_el$81, "paddingLeft", 1);
      _$setProp(_el$82, "showLineNumbers", true);
      _$setProp(_el$82, "width", "100%");
      _$effect(_p$ => {
        var _v$72 = p.diff,
          _v$73 = view(),
          _v$74 = filetype(p.filePath),
          _v$75 = syntax(),
          _v$76 = ctx.diffWrapMode(),
          _v$77 = theme.text,
          _v$78 = theme.diffAddedBg,
          _v$79 = theme.diffRemovedBg,
          _v$80 = theme.diffContextBg,
          _v$81 = theme.diffHighlightAdded,
          _v$82 = theme.diffHighlightRemoved,
          _v$83 = theme.diffLineNumber,
          _v$84 = theme.diffContextBg,
          _v$85 = theme.diffAddedLineNumberBg,
          _v$86 = theme.diffRemovedLineNumberBg;
        _v$72 !== _p$.e && (_p$.e = _$setProp(_el$82, "diff", _v$72, _p$.e));
        _v$73 !== _p$.t && (_p$.t = _$setProp(_el$82, "view", _v$73, _p$.t));
        _v$74 !== _p$.a && (_p$.a = _$setProp(_el$82, "filetype", _v$74, _p$.a));
        _v$75 !== _p$.o && (_p$.o = _$setProp(_el$82, "syntaxStyle", _v$75, _p$.o));
        _v$76 !== _p$.i && (_p$.i = _$setProp(_el$82, "wrapMode", _v$76, _p$.i));
        _v$77 !== _p$.n && (_p$.n = _$setProp(_el$82, "fg", _v$77, _p$.n));
        _v$78 !== _p$.s && (_p$.s = _$setProp(_el$82, "addedBg", _v$78, _p$.s));
        _v$79 !== _p$.h && (_p$.h = _$setProp(_el$82, "removedBg", _v$79, _p$.h));
        _v$80 !== _p$.r && (_p$.r = _$setProp(_el$82, "contextBg", _v$80, _p$.r));
        _v$81 !== _p$.d && (_p$.d = _$setProp(_el$82, "addedSignColor", _v$81, _p$.d));
        _v$82 !== _p$.l && (_p$.l = _$setProp(_el$82, "removedSignColor", _v$82, _p$.l));
        _v$83 !== _p$.u && (_p$.u = _$setProp(_el$82, "lineNumberFg", _v$83, _p$.u));
        _v$84 !== _p$.c && (_p$.c = _$setProp(_el$82, "lineNumberBg", _v$84, _p$.c));
        _v$85 !== _p$.w && (_p$.w = _$setProp(_el$82, "addedLineNumberBg", _v$85, _p$.w));
        _v$86 !== _p$.m && (_p$.m = _$setProp(_el$82, "removedLineNumberBg", _v$86, _p$.m));
        return _p$;
      }, {
        e: undefined,
        t: undefined,
        a: undefined,
        o: undefined,
        i: undefined,
        n: undefined,
        s: undefined,
        h: undefined,
        r: undefined,
        d: undefined,
        l: undefined,
        u: undefined,
        c: undefined,
        w: undefined,
        m: undefined
      });
      return _el$81;
    })();
  }
  function title(file) {
    if (file.type === "delete") return "# Deleted " + file.relativePath;
    if (file.type === "add") return "# Created " + file.relativePath;
    if (file.type === "move") return "# Moved " + normalizePath(file.filePath) + " → " + file.relativePath;
    return "← Patched " + file.relativePath;
  }
  return _$createComponent(Switch, {
    get children() {
      return [_$createComponent(Match, {
        get when() {
          return files().length > 0;
        },
        get children() {
          return _$createComponent(For, {
            get each() {
              return files();
            },
            children: file => _$createComponent(BlockTool, {
              get title() {
                return title(file);
              },
              get part() {
                return props.part;
              },
              get children() {
                return _$createComponent(Show, {
                  get when() {
                    return file.type !== "delete";
                  },
                  get fallback() {
                    return (() => {
                      var _el$83 = _$createElement("text"),
                        _el$84 = _$createTextNode(`-`),
                        _el$85 = _$createTextNode(` line`);
                      _$insertNode(_el$83, _el$84);
                      _$insertNode(_el$83, _el$85);
                      _$insert(_el$83, () => file.deletions, _el$85);
                      _$insert(_el$83, () => file.deletions !== 1 ? "s" : "", null);
                      _$effect(_$p => _$setProp(_el$83, "fg", theme.diffRemoved, _$p));
                      return _el$83;
                    })();
                  },
                  get children() {
                    return [_$createComponent(Diff, {
                      get diff() {
                        return file.patch;
                      },
                      get filePath() {
                        return file.filePath;
                      }
                    }), _$createComponent(Diagnostics, {
                      get diagnostics() {
                        return props.metadata.diagnostics;
                      },
                      get filePath() {
                        return file.movePath ?? file.filePath;
                      }
                    })];
                  }
                });
              }
            })
          });
        }
      }), _$createComponent(Match, {
        when: true,
        get children() {
          return _$createComponent(InlineTool, {
            icon: "%",
            pending: "Preparing patch...",
            complete: false,
            get part() {
              return props.part;
            },
            children: "Patch"
          });
        }
      })];
    }
  });
}
function TodoWrite(props) {
  return _$createComponent(Switch, {
    get children() {
      return [_$createComponent(Match, {
        get when() {
          return props.metadata.todos?.length;
        },
        get children() {
          return _$createComponent(BlockTool, {
            title: "# Todos",
            get part() {
              return props.part;
            },
            get children() {
              var _el$86 = _$createElement("box");
              _$insert(_el$86, _$createComponent(For, {
                get each() {
                  return props.input.todos ?? [];
                },
                children: todo => _$createComponent(TodoItem, {
                  get status() {
                    return todo.status;
                  },
                  get content() {
                    return todo.content;
                  }
                })
              }));
              return _el$86;
            }
          });
        }
      }), _$createComponent(Match, {
        when: true,
        get children() {
          return _$createComponent(InlineTool, {
            icon: "\u2699",
            pending: "Updating todos...",
            complete: false,
            get part() {
              return props.part;
            },
            children: "Updating todos..."
          });
        }
      })];
    }
  });
}
function Question(props) {
  const {
    theme
  } = useTheme();
  const count = createMemo(() => props.input.questions?.length ?? 0);
  function format(answer) {
    if (!answer?.length) return "(no answer)";
    return answer.join(", ");
  }
  return _$createComponent(Switch, {
    get children() {
      return [_$createComponent(Match, {
        get when() {
          return props.metadata.answers;
        },
        get children() {
          return _$createComponent(BlockTool, {
            title: "# Questions",
            get part() {
              return props.part;
            },
            get children() {
              var _el$87 = _$createElement("box");
              _$setProp(_el$87, "gap", 1);
              _$insert(_el$87, _$createComponent(For, {
                get each() {
                  return props.input.questions ?? [];
                },
                children: (q, i) => (() => {
                  var _el$88 = _$createElement("box"),
                    _el$89 = _$createElement("text"),
                    _el$90 = _$createElement("text");
                  _$insertNode(_el$88, _el$89);
                  _$insertNode(_el$88, _el$90);
                  _$setProp(_el$88, "flexDirection", "column");
                  _$insert(_el$89, () => q.question);
                  _$insert(_el$90, () => format(props.metadata.answers?.[i()]));
                  _$effect(_p$ => {
                    var _v$87 = theme.textMuted,
                      _v$88 = theme.text;
                    _v$87 !== _p$.e && (_p$.e = _$setProp(_el$89, "fg", _v$87, _p$.e));
                    _v$88 !== _p$.t && (_p$.t = _$setProp(_el$90, "fg", _v$88, _p$.t));
                    return _p$;
                  }, {
                    e: undefined,
                    t: undefined
                  });
                  return _el$88;
                })()
              }));
              return _el$87;
            }
          });
        }
      }), _$createComponent(Match, {
        when: true,
        get children() {
          return _$createComponent(InlineTool, {
            icon: "\u2192",
            pending: "Asking questions...",
            get complete() {
              return count();
            },
            get part() {
              return props.part;
            },
            get children() {
              return ["Asked ", _$memo(() => count()), " question", _$memo(() => count() !== 1 ? "s" : "")];
            }
          });
        }
      })];
    }
  });
}
function Skill(props) {
  return _$createComponent(InlineTool, {
    icon: "\u2192",
    pending: "Loading skill...",
    get complete() {
      return props.input.name;
    },
    get part() {
      return props.part;
    },
    get children() {
      return ["Skill \"", _$memo(() => props.input.name), "\""];
    }
  });
}
function Diagnostics(props) {
  const {
    theme
  } = useTheme();
  const errors = createMemo(() => {
    const normalized = Filesystem.normalizePath(props.filePath);
    const arr = props.diagnostics?.[normalized] ?? [];
    return arr.filter(x => x.severity === 1).slice(0, 3);
  });
  return _$createComponent(Show, {
    get when() {
      return errors().length;
    },
    get children() {
      var _el$91 = _$createElement("box");
      _$insert(_el$91, _$createComponent(For, {
        get each() {
          return errors();
        },
        children: diagnostic => (() => {
          var _el$92 = _$createElement("text"),
            _el$93 = _$createTextNode(`Error [`),
            _el$94 = _$createTextNode(`:`),
            _el$95 = _$createTextNode(`] `);
          _$insertNode(_el$92, _el$93);
          _$insertNode(_el$92, _el$94);
          _$insertNode(_el$92, _el$95);
          _$insert(_el$92, () => diagnostic.range.start.line + 1, _el$94);
          _$insert(_el$92, () => diagnostic.range.start.character + 1, _el$95);
          _$insert(_el$92, () => diagnostic.message, null);
          _$effect(_$p => _$setProp(_el$92, "fg", theme.error, _$p));
          return _el$92;
        })()
      }));
      return _el$91;
    }
  });
}
function normalizePath(input) {
  if (!input) return "";
  const cwd = process.cwd();
  const absolute = path.isAbsolute(input) ? input : path.resolve(cwd, input);
  const relative = path.relative(cwd, absolute);
  if (!relative) return ".";
  if (!relative.startsWith("..")) return relative;

  // outside cwd - use absolute
  return absolute;
}
function input(input, omit) {
  const primitives = Object.entries(input).filter(([key, value]) => {
    if (omit?.includes(key)) return false;
    return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
  });
  if (primitives.length === 0) return "";
  return `[${primitives.map(([key, value]) => `${key}=${value}`).join(", ")}]`;
}
function filetype(input) {
  if (!input) return "none";
  const ext = path.extname(input);
  const language = LANGUAGE_EXTENSIONS[ext];
  if (["typescriptreact", "javascriptreact", "javascript"].includes(language)) return "typescript";
  return language;
}