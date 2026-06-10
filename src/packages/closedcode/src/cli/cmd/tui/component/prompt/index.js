import { createTextNode as _$createTextNode } from "@opentui/solid";
import { effect as _$effect } from "@opentui/solid";
import { memo as _$memo } from "@opentui/solid";
import { insertNode as _$insertNode } from "@opentui/solid";
import { insert as _$insert } from "@opentui/solid";
import { setProp as _$setProp } from "@opentui/solid";
import { use as _$use } from "@opentui/solid";
import { createElement as _$createElement } from "@opentui/solid";
import { createComponent as _$createComponent } from "@opentui/solid";
import { RGBA, decodePasteBytes } from "@opentui/core";
import { createEffect, createMemo, onMount, createSignal, onCleanup, on, Show, Switch, Match } from "solid-js";
import stringWidth from "string-width";
import "opentui-spinner/solid";
import path from "path";
import { fileURLToPath } from "url";
import { Filesystem } from "#util/filesystem.js";
import { useLocal } from "#tui/context/local.js";
import { tint, useTheme } from "#tui/context/theme.js";
import { EmptyBorder, SplitBorder } from "#tui/component/border.js";
import { useSDK } from "#tui/context/sdk.js";
import { useRoute } from "#tui/context/route.js";
import { useProject } from "#tui/context/project.js";
import { useSync } from "#tui/context/sync.js";
import { useEvent } from "#tui/context/event.js";
import { editorSelectionKey, useEditorContext } from "#tui/context/editor.js";
import { MessageID, PartID } from "#session/schema.js";
import { createStore, produce, unwrap } from "solid-js/store";
import { useKeybind } from "#tui/context/keybind.js";
import { usePromptHistory } from "./history.js";
import { computePromptTraits } from "./traits.js";
import { assign } from "./part.js";
import { usePromptStash } from "./stash.js";
import { DialogStash } from "../dialog-stash.js";
import { Autocomplete } from "./autocomplete.js";
import { useCommandDialog } from "../dialog-command.js";
import { useRenderer, useTerminalDimensions } from "@opentui/solid";
import * as Editor from "#tui/util/editor.js";
import { useExit } from "../../context/exit.js";
import * as Clipboard from "../../util/clipboard.js";
import { TuiEvent } from "../../event.js";
import { iife } from "#util/iife.js";
import { Locale } from "#util/locale.js";
import { formatDuration } from "#util/format.js";
import { createColors, createFrames } from "../../ui/spinner.js";
import { useDialog } from "#tui/ui/dialog.js";
import { DialogProvider as DialogProviderConnect } from "../dialog-provider.js";
import { DialogAlert } from "../../ui/dialog-alert.js";
import { useToast } from "../../ui/toast.js";
import { useKV } from "../../context/kv.js";
import { createFadeIn } from "../../util/signal.js";
import { useTextareaKeybindings } from "../textarea-keybindings.js";
import { DialogSkill } from "../dialog-skill.js";
import { DialogWorkspaceCreate, restoreWorkspaceSession } from "../dialog-workspace-create.js";
import { DialogWorkspaceUnavailable } from "../dialog-workspace-unavailable.js";
import { useArgs } from "#tui/context/args.js";
const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD"
});
function randomIndex(count) {
  if (count <= 0) return 0;
  return Math.floor(Math.random() * count);
}
function fadeColor(color, alpha) {
  return RGBA.fromValues(color.r, color.g, color.b, color.a * alpha);
}
function hasEditorRangeSelection(selection) {
  return selection.selection.start.line !== selection.selection.end.line || selection.selection.start.character !== selection.selection.end.character;
}
function getEditorRangeLabel(selection) {
  if (!hasEditorRangeSelection(selection)) return;
  if (selection.selection.start.line === selection.selection.end.line) return `#${selection.selection.start.line}`;
  return `#${selection.selection.start.line}-${selection.selection.end.line}`;
}
function formatEditorContext(selection) {
  const selected = selection.ranges.filter(hasEditorRangeSelection);
  if (selected.length === 0) return `<system-reminder>Note: The user opened the file "${selection.filePath}". This may or may not be relevant to the current task.</system-reminder>\n`;
  const ranges = selected.map((range, index) => {
    const prefix = selected.length > 1 ? `Selection ${index + 1}: ` : "";
    return `Note: The user selected ${prefix}${getEditorRangeLabel(range)} from "${selection.filePath}". \`\`\`${range.text}\`\`\`\n\n`;
  });
  return `<system-reminder>${ranges.join("\n")} This may or may not be relevant to the current task.</system-reminder>\n`;
}
let stashed;
export function Prompt(props) {
  let input;
  let anchor;
  let autocomplete;
  const keybind = useKeybind();
  const local = useLocal();
  const args = useArgs();
  const sdk = useSDK();
  const editor = useEditorContext();
  const route = useRoute();
  const project = useProject();
  const sync = useSync();
  const dialog = useDialog();
  const toast = useToast();
  const status = createMemo(() => sync.data.session_status?.[props.sessionID ?? ""] ?? {
    type: "idle"
  });
  const history = usePromptHistory();
  const stash = usePromptStash();
  const command = useCommandDialog();
  const renderer = useRenderer();
  const dimensions = useTerminalDimensions();
  const {
    theme,
    syntax
  } = useTheme();
  const kv = useKV();
  const animationsEnabled = createMemo(() => kv.get("animations_enabled", true));
  const list = createMemo(() => props.placeholders?.normal ?? []);
  const shell = createMemo(() => props.placeholders?.shell ?? []);
  const fileContextEnabled = createMemo(() => kv.get("file_context_enabled", true));
  const [dismissedEditorSelectionKey, setDismissedEditorSelectionKey] = createSignal();
  const editorContext = createMemo(() => {
    const selection = fileContextEnabled() ? editor.selection() : undefined;
    if (!selection) return;
    return editorSelectionKey(selection) === dismissedEditorSelectionKey() ? undefined : selection;
  });
  const editorPath = createMemo(() => editorContext()?.filePath);
  const editorSelectionLabel = createMemo(() => {
    const ranges = editorContext()?.ranges;
    if (!ranges) return;
    const first = ranges.find(hasEditorRangeSelection) ?? ranges[0];
    if (!first) return;
    return [getEditorRangeLabel(first), ranges.length > 1 ? `+${ranges.length - 1}` : undefined].filter(Boolean).join(" ");
  });
  const editorFileLabel = createMemo(() => {
    const value = editorPath();
    if (!value) return;
    const filename = path.basename(value);
    const file = /^index\.[^./]+$/.test(filename) ? [path.basename(path.dirname(value)), filename].filter(Boolean).join("/") : filename;
    return `${file.split(path.sep).join("/")}${editorSelectionLabel() ?? ""}`;
  });
  const editorFileLabelDisplay = createMemo(() => {
    const file = editorFileLabel();
    if (!file) return;
    return Locale.truncateMiddle(file, Math.max(12, Math.min(48, Math.floor(dimensions().width / 3))));
  });
  const [editorContextHover, setEditorContextHover] = createSignal(false);
  let lastSubmittedEditorSelectionKey;
  const [auto, setAuto] = createSignal();
  const currentProviderLabel = createMemo(() => local.model.parsed().provider);
  const hasRightContent = createMemo(() => Boolean(props.right));
  function promptModelWarning() {
    toast.show({
      variant: "warning",
      message: "Connect a provider to send prompts",
      duration: 3000
    });
    if (sync.data.provider.length === 0) {
      dialog.replace(() => _$createComponent(DialogProviderConnect, {}));
    }
  }
  function dismissEditorContext() {
    setDismissedEditorSelectionKey(editorSelectionKey(editorContext()));
    editor.clearSelection();
  }
  const textareaKeybindings = useTextareaKeybindings();
  const fileStyleId = syntax().getStyleId("extmark.file");
  const agentStyleId = syntax().getStyleId("extmark.agent");
  const pasteStyleId = syntax().getStyleId("extmark.paste");
  let promptPartTypeId = 0;
  const event = useEvent();
  event.on(TuiEvent.PromptAppend.type, evt => {
    if (!input || input.isDestroyed) return;
    input.insertText(evt.properties.text);
    setTimeout(() => {
      // setTimeout is a workaround and needs to be addressed properly
      if (!input || input.isDestroyed) return;
      input.getLayoutNode().markDirty();
      input.gotoBufferEnd();
      renderer.requestRender();
    }, 0);
  });
  createEffect(() => {
    if (props.disabled) input.cursorColor = theme.backgroundElement;
    if (!props.disabled) input.cursorColor = theme.text;
  });
  const lastUserMessage = createMemo(() => {
    if (!props.sessionID) return undefined;
    const messages = sync.data.message[props.sessionID];
    if (!messages) return undefined;
    return messages.findLast(m => m.role === "user");
  });
  const usage = createMemo(() => {
    if (!props.sessionID) return;
    const msg = sync.data.message[props.sessionID] ?? [];
    const last = msg.findLast(item => item.role === "assistant" && item.tokens.output > 0);
    if (!last) return;
    const tokens = last.tokens.input + last.tokens.output + last.tokens.reasoning + last.tokens.cache.read + last.tokens.cache.write;
    if (tokens <= 0) return;
    const model = sync.data.provider.find(item => item.id === last.providerID)?.models[last.modelID];
    const pct = model?.limit.context ? `${Math.round(tokens / model.limit.context * 100)}%` : undefined;
    const cost = msg.reduce((sum, item) => sum + (item.role === "assistant" ? item.cost : 0), 0);
    return {
      context: pct ? `${Locale.number(tokens)} (${pct})` : Locale.number(tokens),
      cost: cost > 0 ? money.format(cost) : undefined
    };
  });
  const [store, setStore] = createStore({
    placeholder: randomIndex(list().length),
    prompt: {
      input: "",
      parts: []
    },
    mode: "normal",
    extmarkToPartIndex: new Map(),
    interrupt: 0
  });
  createEffect(on(() => props.sessionID, () => {
    setStore("placeholder", randomIndex(list().length));
  }, {
    defer: true
  }));

  // Initialize agent/model/variant from last user message when session changes
  let syncedSessionID;
  createEffect(() => {
    const sessionID = props.sessionID;
    const msg = lastUserMessage();
    if (sessionID !== syncedSessionID) {
      if (!sessionID || !msg) return;
      syncedSessionID = sessionID;

      // Only set agent if it's a primary agent (not a subagent)
      const isPrimaryAgent = local.agent.list().some(x => x.name === msg.agent);
      if (msg.agent && isPrimaryAgent) {
        // Keep command line --agent if specified.
        if (!args.agent) local.agent.set(msg.agent);
        if (msg.model) {
          local.model.set(msg.model);
          local.model.variant.set(msg.model.variant);
        }
      }
    }
  });
  command.register(() => {
    return [{
      title: "Clear prompt",
      value: "prompt.clear",
      category: "Prompt",
      hidden: true,
      onSelect: dialog => {
        input.extmarks.clear();
        input.clear();
        dialog.clear();
      }
    }, {
      title: "Submit prompt",
      value: "prompt.submit",
      keybind: "input_submit",
      category: "Prompt",
      hidden: true,
      onSelect: async dialog => {
        if (!input.focused) return;
        const handled = await submit();
        if (!handled) return;
        dialog.clear();
      }
    }, {
      title: "Remove editor context",
      value: "prompt.editor_context.clear",
      category: "Prompt",
      enabled: Boolean(editorContext()),
      onSelect: dialog => {
        dismissEditorContext();
        dialog.clear();
      }
    }, {
      title: "Paste",
      value: "prompt.paste",
      keybind: "input_paste",
      category: "Prompt",
      hidden: true,
      onSelect: async () => {
        const content = await Clipboard.read();
        if (content?.mime.startsWith("image/")) {
          await pasteAttachment({
            filename: "clipboard",
            mime: content.mime,
            content: content.data
          });
        }
      }
    }, {
      title: "Interrupt session",
      value: "session.interrupt",
      keybind: "session_interrupt",
      category: "Session",
      hidden: true,
      enabled: status().type !== "idle",
      onSelect: dialog => {
        if (autocomplete.visible) return;
        if (!input.focused) return;
        // TODO: this should be its own command
        if (store.mode === "shell") {
          setStore("mode", "normal");
          return;
        }
        if (!props.sessionID) return;
        setStore("interrupt", store.interrupt + 1);
        setTimeout(() => {
          setStore("interrupt", 0);
        }, 5000);
        if (store.interrupt >= 2) {
          void sdk.client.session.abort({
            sessionID: props.sessionID
          });
          setStore("interrupt", 0);
        }
        dialog.clear();
      }
    }, {
      title: "Open editor",
      category: "Session",
      keybind: "editor_open",
      value: "prompt.editor",
      slash: {
        name: "editor"
      },
      onSelect: async dialog => {
        dialog.clear();

        // replace summarized text parts with the actual text
        const text = store.prompt.parts.filter(p => p.type === "text").reduce((acc, p) => {
          if (!p.source) return acc;
          return acc.replace(p.source.text.value, p.text);
        }, store.prompt.input);
        const nonTextParts = store.prompt.parts.filter(p => p.type !== "text");
        const value = text;
        const content = await Editor.open({
          value,
          renderer
        });
        if (!content) return;
        input.setText(content);

        // Update positions for nonTextParts based on their location in new content
        // Filter out parts whose virtual text was deleted
        // this handles a case where the user edits the text in the editor
        // such that the virtual text moves around or is deleted
        const updatedNonTextParts = nonTextParts.map(part => {
          let virtualText = "";
          if (part.type === "file" && part.source?.text) {
            virtualText = part.source.text.value;
          } else if (part.type === "agent" && part.source) {
            virtualText = part.source.value;
          }
          if (!virtualText) return part;
          const newStart = content.indexOf(virtualText);
          // if the virtual text is deleted, remove the part
          if (newStart === -1) return null;
          const newEnd = newStart + virtualText.length;
          if (part.type === "file" && part.source?.text) {
            return {
              ...part,
              source: {
                ...part.source,
                text: {
                  ...part.source.text,
                  start: newStart,
                  end: newEnd
                }
              }
            };
          }
          if (part.type === "agent" && part.source) {
            return {
              ...part,
              source: {
                ...part.source,
                start: newStart,
                end: newEnd
              }
            };
          }
          return part;
        }).filter(part => part !== null);
        setStore("prompt", {
          input: content,
          // keep only the non-text parts because the text parts were
          // already expanded inline
          parts: updatedNonTextParts
        });
        restoreExtmarksFromParts(updatedNonTextParts);
        input.cursorOffset = stringWidth(content);
      }
    }, {
      title: "Skills",
      value: "prompt.skills",
      category: "Prompt",
      slash: {
        name: "skills"
      },
      onSelect: () => {
        dialog.replace(() => _$createComponent(DialogSkill, {
          onSelect: skill => {
            input.setText(`/${skill} `);
            setStore("prompt", {
              input: `/${skill} `,
              parts: []
            });
            input.gotoBufferEnd();
          }
        }));
      }
    }];
  });
  const ref = {
    get focused() {
      return input.focused;
    },
    get current() {
      return store.prompt;
    },
    focus() {
      input.focus();
    },
    blur() {
      input.blur();
    },
    set(prompt) {
      input.setText(prompt.input);
      setStore("prompt", prompt);
      restoreExtmarksFromParts(prompt.parts);
      input.gotoBufferEnd();
    },
    reset() {
      input.clear();
      input.extmarks.clear();
      setStore("prompt", {
        input: "",
        parts: []
      });
      setStore("extmarkToPartIndex", new Map());
    },
    submit() {
      void submit();
    }
  };
  onMount(() => {
    const saved = stashed;
    stashed = undefined;
    if (store.prompt.input) return;
    if (saved && saved.prompt.input) {
      input.setText(saved.prompt.input);
      setStore("prompt", saved.prompt);
      restoreExtmarksFromParts(saved.prompt.parts);
      input.cursorOffset = saved.cursor;
    }
  });
  onCleanup(() => {
    if (store.prompt.input) {
      stashed = {
        prompt: unwrap(store.prompt),
        cursor: input.cursorOffset
      };
    }
    props.ref?.(undefined);
  });
  createEffect(() => {
    if (!input || input.isDestroyed) return;
    if (props.visible === false || dialog.stack.length > 0) {
      if (input.focused) input.blur();
      return;
    }

    // Slot/plugin updates can remount the background prompt while a dialog is open.
    // Keep focus with the dialog and let the prompt reclaim it after the dialog closes.
    if (!input.focused) input.focus();
  });
  createEffect(() => {
    if (!input || input.isDestroyed) return;
    input.traits = computePromptTraits({
      mode: store.mode,
      disabled: !!props.disabled,
      autocompleteVisible: !!auto()?.visible
    });
  });
  function restoreExtmarksFromParts(parts) {
    input.extmarks.clear();
    setStore("extmarkToPartIndex", new Map());
    parts.forEach((part, partIndex) => {
      let start = 0;
      let end = 0;
      let virtualText = "";
      let styleId;
      if (part.type === "file" && part.source?.text) {
        start = part.source.text.start;
        end = part.source.text.end;
        virtualText = part.source.text.value;
        styleId = fileStyleId;
      } else if (part.type === "agent" && part.source) {
        start = part.source.start;
        end = part.source.end;
        virtualText = part.source.value;
        styleId = agentStyleId;
      } else if (part.type === "text" && part.source?.text) {
        start = part.source.text.start;
        end = part.source.text.end;
        virtualText = part.source.text.value;
        styleId = pasteStyleId;
      }
      if (virtualText) {
        const extmarkId = input.extmarks.create({
          start,
          end,
          virtual: true,
          styleId,
          typeId: promptPartTypeId
        });
        setStore("extmarkToPartIndex", map => {
          const newMap = new Map(map);
          newMap.set(extmarkId, partIndex);
          return newMap;
        });
      }
    });
  }
  function syncExtmarksWithPromptParts() {
    const allExtmarks = input.extmarks.getAllForTypeId(promptPartTypeId);
    setStore(produce(draft => {
      const newMap = new Map();
      const newParts = [];
      for (const extmark of allExtmarks) {
        const partIndex = draft.extmarkToPartIndex.get(extmark.id);
        if (partIndex !== undefined) {
          const part = draft.prompt.parts[partIndex];
          if (part) {
            if (part.type === "agent" && part.source) {
              part.source.start = extmark.start;
              part.source.end = extmark.end;
            } else if (part.type === "file" && part.source?.text) {
              part.source.text.start = extmark.start;
              part.source.text.end = extmark.end;
            } else if (part.type === "text" && part.source?.text) {
              part.source.text.start = extmark.start;
              part.source.text.end = extmark.end;
            }
            newMap.set(extmark.id, newParts.length);
            newParts.push(part);
          }
        }
      }
      draft.extmarkToPartIndex = newMap;
      draft.prompt.parts = newParts;
    }));
  }
  command.register(() => [{
    title: "Stash prompt",
    value: "prompt.stash",
    category: "Prompt",
    enabled: !!store.prompt.input,
    onSelect: dialog => {
      if (!store.prompt.input) return;
      stash.push({
        input: store.prompt.input,
        parts: store.prompt.parts
      });
      input.extmarks.clear();
      input.clear();
      setStore("prompt", {
        input: "",
        parts: []
      });
      setStore("extmarkToPartIndex", new Map());
      dialog.clear();
    }
  }, {
    title: "Stash pop",
    value: "prompt.stash.pop",
    category: "Prompt",
    enabled: stash.list().length > 0,
    onSelect: dialog => {
      const entry = stash.pop();
      if (entry) {
        input.setText(entry.input);
        setStore("prompt", {
          input: entry.input,
          parts: entry.parts
        });
        restoreExtmarksFromParts(entry.parts);
        input.gotoBufferEnd();
      }
      dialog.clear();
    }
  }, {
    title: "Stash list",
    value: "prompt.stash.list",
    category: "Prompt",
    enabled: stash.list().length > 0,
    onSelect: dialog => {
      dialog.replace(() => _$createComponent(DialogStash, {
        onSelect: entry => {
          input.setText(entry.input);
          setStore("prompt", {
            input: entry.input,
            parts: entry.parts
          });
          restoreExtmarksFromParts(entry.parts);
          input.gotoBufferEnd();
        }
      }));
    }
  }]);
  async function submit() {
    // IME: double-defer may fire before onContentChange flushes the last
    // composed character (e.g. Korean hangul) to the store, so read
    // plainText directly and sync before any downstream reads.
    if (input && !input.isDestroyed && input.plainText !== store.prompt.input) {
      setStore("prompt", "input", input.plainText);
      syncExtmarksWithPromptParts();
    }
    if (props.disabled) return false;
    if (autocomplete?.visible) return false;
    if (!store.prompt.input) return false;
    const agent = local.agent.current();
    if (!agent) return false;
    const trimmed = store.prompt.input.trim();
    if (trimmed === "exit" || trimmed === "quit" || trimmed === ":q") {
      void exit();
      return true;
    }
    const selectedModel = local.model.current();
    if (!selectedModel) {
      void promptModelWarning();
      return false;
    }
    const workspaceSession = props.sessionID ? sync.session.get(props.sessionID) : undefined;
    const workspaceID = workspaceSession?.workspaceID;
    const workspaceStatus = workspaceID ? project.workspace.status(workspaceID) ?? "error" : undefined;
    if (props.sessionID && workspaceID && workspaceStatus !== "connected") {
      dialog.replace(() => _$createComponent(DialogWorkspaceUnavailable, {
        onRestore: () => {
          dialog.replace(() => _$createComponent(DialogWorkspaceCreate, {
            onSelect: nextWorkspaceID => restoreWorkspaceSession({
              dialog,
              sdk,
              sync,
              project,
              toast,
              workspaceID: nextWorkspaceID,
              sessionID: props.sessionID
            })
          }));
        }
      }));
      return false;
    }
    const variant = local.model.variant.current();
    let sessionID = props.sessionID;
    if (sessionID == null) {
      const res = await sdk.client.session.create({
        workspace: props.workspaceID,
        agent: agent.name,
        model: {
          providerID: selectedModel.providerID,
          id: selectedModel.modelID,
          variant
        }
      });
      if (res.error) {
        console.log("Creating a session failed:", res.error);
        toast.show({
          message: "Creating a session failed. Open console for more details.",
          variant: "error"
        });
        return true;
      }
      sessionID = res.data.id;
    }
    const messageID = MessageID.ascending();
    let inputText = store.prompt.input;

    // Expand pasted text inline before submitting
    const allExtmarks = input.extmarks.getAllForTypeId(promptPartTypeId);
    const sortedExtmarks = allExtmarks.sort((a, b) => b.start - a.start);
    for (const extmark of sortedExtmarks) {
      const partIndex = store.extmarkToPartIndex.get(extmark.id);
      if (partIndex !== undefined) {
        const part = store.prompt.parts[partIndex];
        if (part?.type === "text" && part.text) {
          const before = inputText.slice(0, extmark.start);
          const after = inputText.slice(extmark.end);
          inputText = before + part.text + after;
        }
      }
    }

    // Filter out text parts (pasted content) since they're now expanded inline
    const nonTextParts = store.prompt.parts.filter(part => part.type !== "text");

    // Capture mode before it gets reset
    const currentMode = store.mode;
    const editorSelection = editorContext();
    const currentEditorSelectionKey = editorSelectionKey(editorSelection);
    const editorParts = editorSelection && currentEditorSelectionKey !== lastSubmittedEditorSelectionKey ? [{
      id: PartID.ascending(),
      type: "text",
      text: formatEditorContext(editorSelection),
      synthetic: true,
      metadata: {
        kind: "editor_context",
        source: editorSelection.source ?? "editor",
        filePath: editorSelection.filePath,
        ranges: editorSelection.ranges
      }
    }] : [];
    if (store.mode === "shell") {
      void sdk.client.session.shell({
        sessionID,
        agent: agent.name,
        model: {
          providerID: selectedModel.providerID,
          modelID: selectedModel.modelID
        },
        command: inputText
      });
      setStore("mode", "normal");
    } else if (inputText.startsWith("/") && iife(() => {
      const firstLine = inputText.split("\n")[0];
      const command = firstLine.split(" ")[0].slice(1);
      return sync.data.command.some(x => x.name === command);
    })) {
      // Parse command from first line, preserve multi-line content in arguments
      const firstLineEnd = inputText.indexOf("\n");
      const firstLine = firstLineEnd === -1 ? inputText : inputText.slice(0, firstLineEnd);
      const [command, ...firstLineArgs] = firstLine.split(" ");
      const restOfInput = firstLineEnd === -1 ? "" : inputText.slice(firstLineEnd + 1);
      const args = firstLineArgs.join(" ") + (restOfInput ? "\n" + restOfInput : "");
      void sdk.client.session.command({
        sessionID,
        command: command.slice(1),
        arguments: args,
        agent: agent.name,
        model: `${selectedModel.providerID}/${selectedModel.modelID}`,
        messageID,
        variant,
        parts: nonTextParts.filter(x => x.type === "file").map(x => ({
          id: PartID.ascending(),
          ...x
        }))
      });
    } else {
      sdk.client.session.prompt({
        sessionID,
        ...selectedModel,
        messageID,
        agent: agent.name,
        model: selectedModel,
        variant,
        parts: [...editorParts, {
          id: PartID.ascending(),
          type: "text",
          text: inputText
        }, ...nonTextParts.map(assign)]
      }).catch(() => {});
      lastSubmittedEditorSelectionKey = currentEditorSelectionKey;
    }
    history.append({
      ...store.prompt,
      mode: currentMode
    });
    input.extmarks.clear();
    setStore("prompt", {
      input: "",
      parts: []
    });
    setStore("extmarkToPartIndex", new Map());
    props.onSubmit?.();

    // temporary hack to make sure the message is sent
    if (!props.sessionID) setTimeout(() => {
      route.navigate({
        type: "session",
        sessionID
      });
    }, 50);
    input.clear();
    return true;
  }
  const exit = useExit();
  function pasteText(text, virtualText) {
    const currentOffset = input.visualCursor.offset;
    const extmarkStart = currentOffset;
    const extmarkEnd = extmarkStart + virtualText.length;
    input.insertText(virtualText + " ");
    const extmarkId = input.extmarks.create({
      start: extmarkStart,
      end: extmarkEnd,
      virtual: true,
      styleId: pasteStyleId,
      typeId: promptPartTypeId
    });
    setStore(produce(draft => {
      const partIndex = draft.prompt.parts.length;
      draft.prompt.parts.push({
        type: "text",
        text,
        source: {
          text: {
            start: extmarkStart,
            end: extmarkEnd,
            value: virtualText
          }
        }
      });
      draft.extmarkToPartIndex.set(extmarkId, partIndex);
    }));
  }
  async function pasteAttachment(file) {
    const currentOffset = input.visualCursor.offset;
    const extmarkStart = currentOffset;
    const pdf = file.mime === "application/pdf";
    const count = store.prompt.parts.filter(x => {
      if (x.type !== "file") return false;
      if (pdf) return x.mime === "application/pdf";
      return x.mime.startsWith("image/");
    }).length;
    const virtualText = pdf ? `[PDF ${count + 1}]` : `[Image ${count + 1}]`;
    const extmarkEnd = extmarkStart + virtualText.length;
    const textToInsert = virtualText + " ";
    input.insertText(textToInsert);
    const extmarkId = input.extmarks.create({
      start: extmarkStart,
      end: extmarkEnd,
      virtual: true,
      styleId: pasteStyleId,
      typeId: promptPartTypeId
    });
    const part = {
      type: "file",
      mime: file.mime,
      filename: file.filename,
      url: `data:${file.mime};base64,${file.content}`,
      source: {
        type: "file",
        path: file.filepath ?? file.filename ?? "",
        text: {
          start: extmarkStart,
          end: extmarkEnd,
          value: virtualText
        }
      }
    };
    setStore(produce(draft => {
      const partIndex = draft.prompt.parts.length;
      draft.prompt.parts.push(part);
      draft.extmarkToPartIndex.set(extmarkId, partIndex);
    }));
    return;
  }
  const highlight = createMemo(() => {
    if (keybind.leader) return theme.border;
    if (store.mode === "shell") return theme.primary;
    const agent = local.agent.current();
    if (!agent) return theme.border;
    return local.agent.color(agent.name);
  });
  const showVariant = createMemo(() => {
    const variants = local.model.variant.list();
    if (variants.length === 0) return false;
    const current = local.model.variant.current();
    return !!current;
  });
  const agentMetaAlpha = createFadeIn(() => !!local.agent.current(), animationsEnabled);
  const modelMetaAlpha = createFadeIn(() => !!local.agent.current() && store.mode === "normal", animationsEnabled);
  const variantMetaAlpha = createFadeIn(() => !!local.agent.current() && store.mode === "normal" && showVariant(), animationsEnabled);
  const borderHighlight = createMemo(() => tint(theme.border, highlight(), agentMetaAlpha()));
  const placeholderText = createMemo(() => {
    if (props.showPlaceholder === false) return undefined;
    if (store.mode === "shell") {
      if (!shell().length) return undefined;
      const example = shell()[store.placeholder % shell().length];
      return `Run a command... "${example}"`;
    }
    if (!list().length) return undefined;
    return `Ask anything... "${list()[store.placeholder % list().length]}"`;
  });
  const spinnerDef = createMemo(() => {
    const agent = local.agent.current();
    const color = agent ? local.agent.color(agent.name) : theme.border;
    return {
      frames: createFrames({
        color,
        style: "blocks",
        inactiveFactor: 0.6,
        // enableFading: false,
        minAlpha: 0.3
      }),
      color: createColors({
        color,
        style: "blocks",
        inactiveFactor: 0.6,
        // enableFading: false,
        minAlpha: 0.3
      })
    };
  });
  return [_$createComponent(Autocomplete, {
    get sessionID() {
      return props.sessionID;
    },
    ref: r => {
      autocomplete = r;
      setAuto(() => r);
    },
    anchor: () => anchor,
    input: () => input,
    setPrompt: cb => {
      setStore("prompt", produce(cb));
    },
    setExtmark: (partIndex, extmarkId) => {
      setStore("extmarkToPartIndex", map => {
        const newMap = new Map(map);
        newMap.set(extmarkId, partIndex);
        return newMap;
      });
    },
    get value() {
      return store.prompt.input;
    },
    fileStyleId: fileStyleId,
    agentStyleId: agentStyleId,
    promptPartTypeId: () => promptPartTypeId
  }), (() => {
    var _el$ = _$createElement("box"),
      _el$2 = _$createElement("box"),
      _el$3 = _$createElement("box"),
      _el$4 = _$createElement("textarea"),
      _el$5 = _$createElement("box"),
      _el$6 = _$createElement("box"),
      _el$8 = _$createElement("box"),
      _el$9 = _$createElement("box"),
      _el$0 = _$createElement("box");
    _$insertNode(_el$, _el$2);
    _$insertNode(_el$, _el$8);
    _$insertNode(_el$, _el$0);
    _$use(r => anchor = r, _el$);
    _$insertNode(_el$2, _el$3);
    _$setProp(_el$2, "border", ["left"]);
    _$insertNode(_el$3, _el$4);
    _$insertNode(_el$3, _el$5);
    _$setProp(_el$3, "paddingLeft", 2);
    _$setProp(_el$3, "paddingRight", 2);
    _$setProp(_el$3, "paddingTop", 1);
    _$setProp(_el$3, "flexShrink", 0);
    _$setProp(_el$3, "flexGrow", 1);
    _$use(r => {
      input = r;
      if (promptPartTypeId === 0) {
        promptPartTypeId = input.extmarks.registerType("prompt-part");
      }
      props.ref?.(ref);
      setTimeout(() => {
        // setTimeout is a workaround and needs to be addressed properly
        if (!input || input.isDestroyed) return;
        input.cursorColor = theme.text;
      }, 0);
    }, _el$4);
    _$setProp(_el$4, "minHeight", 1);
    _$setProp(_el$4, "maxHeight", 6);
    _$setProp(_el$4, "onContentChange", () => {
      const value = input.plainText;
      setStore("prompt", "input", value);
      autocomplete.onInput(value);
      syncExtmarksWithPromptParts();
    });
    _$setProp(_el$4, "onKeyDown", async e => {
      if (props.disabled) {
        e.preventDefault();
        return;
      }
      // Check clipboard for images before terminal-handled paste runs.
      // This helps terminals that forward Ctrl+V to the app; Windows
      // Terminal 1.25+ usually handles Ctrl+V before this path.
      if (keybind.match("input_paste", e)) {
        const content = await Clipboard.read();
        if (content?.mime.startsWith("image/")) {
          e.preventDefault();
          await pasteAttachment({
            filename: "clipboard",
            mime: content.mime,
            content: content.data
          });
          return;
        }
        // If no image, let the default paste behavior continue
      }
      if (keybind.match("input_clear", e) && store.prompt.input !== "") {
        input.clear();
        input.extmarks.clear();
        setStore("prompt", {
          input: "",
          parts: []
        });
        setStore("extmarkToPartIndex", new Map());
        return;
      }
      if (keybind.match("app_exit", e)) {
        if (store.prompt.input === "") {
          await exit();
          // Don't preventDefault - let textarea potentially handle the event
          e.preventDefault();
          return;
        }
      }
      if (e.name === "!" && input.visualCursor.offset === 0) {
        setStore("placeholder", randomIndex(shell().length));
        setStore("mode", "shell");
        e.preventDefault();
        return;
      }
      if (store.mode === "shell") {
        if (e.name === "backspace" && input.visualCursor.offset === 0 || e.name === "escape") {
          setStore("mode", "normal");
          e.preventDefault();
          return;
        }
      }
      if (store.mode === "normal") autocomplete.onKeyDown(e);
      if (!autocomplete.visible) {
        if (keybind.match("history_previous", e) && input.cursorOffset === 0 || keybind.match("history_next", e) && input.cursorOffset === input.plainText.length) {
          const direction = keybind.match("history_previous", e) ? -1 : 1;
          const item = history.move(direction, input.plainText);
          if (item) {
            input.setText(item.input);
            setStore("prompt", item);
            setStore("mode", item.mode ?? "normal");
            restoreExtmarksFromParts(item.parts);
            e.preventDefault();
            if (direction === -1) input.cursorOffset = 0;
            if (direction === 1) input.cursorOffset = input.plainText.length;
          }
          return;
        }
        if (keybind.match("history_previous", e) && input.visualCursor.visualRow === 0) input.cursorOffset = 0;
        if (keybind.match("history_next", e) && input.visualCursor.visualRow === input.height - 1) input.cursorOffset = input.plainText.length;
      }
    });
    _$setProp(_el$4, "onSubmit", () => {
      // IME: double-defer so the last composed character (e.g. Korean
      // hangul) is flushed to plainText before we read it for submission.
      setTimeout(() => setTimeout(() => submit(), 0), 0);
    });
    _$setProp(_el$4, "onPaste", async event => {
      if (props.disabled) {
        event.preventDefault();
        return;
      }

      // Normalize line endings at the boundary
      // Windows ConPTY/Terminal often sends CR-only newlines in bracketed paste
      // Replace CRLF first, then any remaining CR
      const normalizedText = decodePasteBytes(event.bytes).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
      const pastedContent = normalizedText.trim();

      // Windows Terminal <1.25 can surface image-only clipboard as an
      // empty bracketed paste. Windows Terminal 1.25+ does not.
      if (!pastedContent) {
        command.trigger("prompt.paste");
        return;
      }

      // Once we cross an async boundary below, the terminal may perform its
      // default paste unless we suppress it first and handle insertion ourselves.
      event.preventDefault();
      const filepath = iife(() => {
        const raw = pastedContent.replace(/^['"]+|['"]+$/g, "");
        if (raw.startsWith("file://")) {
          try {
            return fileURLToPath(raw);
          } catch {}
        }
        if (process.platform === "win32") return raw;
        return raw.replace(/\\(.)/g, "$1");
      });
      const isUrl = /^(https?):\/\//.test(filepath);
      if (!isUrl) {
        try {
          const mime = await Filesystem.mimeType(filepath);
          const filename = path.basename(filepath);
          // Handle SVG as raw text content, not as base64 image
          if (mime === "image/svg+xml") {
            const content = await Filesystem.readText(filepath).catch(() => {});
            if (content) {
              pasteText(content, `[SVG: ${filename ?? "image"}]`);
              return;
            }
          }
          if (mime.startsWith("image/") || mime === "application/pdf") {
            const content = await Filesystem.readArrayBuffer(filepath).then(buffer => Buffer.from(buffer).toString("base64")).catch(() => {});
            if (content) {
              await pasteAttachment({
                filename,
                filepath,
                mime,
                content
              });
              return;
            }
          }
        } catch {}
      }
      const lineCount = (pastedContent.match(/\n/g)?.length ?? 0) + 1;
      if ((lineCount >= 3 || pastedContent.length > 150) && kv.get("paste_summary_enabled", !sync.data.config.experimental?.disable_paste_summary)) {
        pasteText(pastedContent, `[Pasted ~${lineCount} lines]`);
        return;
      }
      input.insertText(normalizedText);

      // Force layout update and render for the pasted content
      setTimeout(() => {
        // setTimeout is a workaround and needs to be addressed properly
        if (!input || input.isDestroyed) return;
        input.getLayoutNode().markDirty();
        renderer.requestRender();
      }, 0);
    });
    _$setProp(_el$4, "onMouseDown", r => r.target?.focus());
    _$insertNode(_el$5, _el$6);
    _$setProp(_el$5, "flexDirection", "row");
    _$setProp(_el$5, "flexShrink", 0);
    _$setProp(_el$5, "paddingTop", 1);
    _$setProp(_el$5, "gap", 1);
    _$setProp(_el$5, "justifyContent", "space-between");
    _$setProp(_el$6, "flexDirection", "row");
    _$setProp(_el$6, "gap", 1);
    _$insert(_el$6, _$createComponent(Show, {
      get when() {
        return local.agent.current();
      },
      get fallback() {
        return (() => {
          var _el$31 = _$createElement("box");
          _$setProp(_el$31, "height", 1);
          return _el$31;
        })();
      },
      children: agent => [(() => {
        var _el$32 = _$createElement("text");
        _$insert(_el$32, (() => {
          var _c$ = _$memo(() => store.mode === "shell");
          return () => _c$() ? "Shell" : Locale.titlecase(agent().name);
        })());
        _$effect(_$p => _$setProp(_el$32, "fg", fadeColor(highlight(), agentMetaAlpha()), _$p));
        return _el$32;
      })(), _$createComponent(Show, {
        get when() {
          return store.mode === "normal";
        },
        get children() {
          var _el$33 = _$createElement("box"),
            _el$34 = _$createElement("text"),
            _el$36 = _$createElement("text"),
            _el$37 = _$createElement("text");
          _$insertNode(_el$33, _el$34);
          _$insertNode(_el$33, _el$36);
          _$insertNode(_el$33, _el$37);
          _$setProp(_el$33, "flexDirection", "row");
          _$setProp(_el$33, "gap", 1);
          _$insertNode(_el$34, _$createTextNode(`·`));
          _$setProp(_el$36, "flexShrink", 0);
          _$insert(_el$36, () => local.model.parsed().model);
          _$insert(_el$37, currentProviderLabel);
          _$insert(_el$33, _$createComponent(Show, {
            get when() {
              return showVariant();
            },
            get children() {
              return [(() => {
                var _el$38 = _$createElement("text");
                _$insertNode(_el$38, _$createTextNode(`·`));
                _$effect(_$p => _$setProp(_el$38, "fg", fadeColor(theme.textMuted, variantMetaAlpha()), _$p));
                return _el$38;
              })(), (() => {
                var _el$40 = _$createElement("text"),
                  _el$41 = _$createElement("span");
                _$insertNode(_el$40, _el$41);
                _$insert(_el$41, () => local.model.variant.current());
                _$effect(_$p => _$setProp(_el$41, "style", {
                  fg: fadeColor(theme.warning, variantMetaAlpha()),
                  bold: true
                }, _$p));
                return _el$40;
              })()];
            }
          }), null);
          _$effect(_p$ => {
            var _v$26 = fadeColor(theme.textMuted, modelMetaAlpha()),
              _v$27 = fadeColor(keybind.leader ? theme.textMuted : theme.text, modelMetaAlpha()),
              _v$28 = fadeColor(theme.textMuted, modelMetaAlpha());
            _v$26 !== _p$.e && (_p$.e = _$setProp(_el$34, "fg", _v$26, _p$.e));
            _v$27 !== _p$.t && (_p$.t = _$setProp(_el$36, "fg", _v$27, _p$.t));
            _v$28 !== _p$.a && (_p$.a = _$setProp(_el$37, "fg", _v$28, _p$.a));
            return _p$;
          }, {
            e: undefined,
            t: undefined,
            a: undefined
          });
          return _el$33;
        }
      })]
    }));
    _$insert(_el$5, _$createComponent(Show, {
      get when() {
        return hasRightContent();
      },
      get children() {
        var _el$7 = _$createElement("box");
        _$setProp(_el$7, "flexDirection", "row");
        _$setProp(_el$7, "gap", 1);
        _$setProp(_el$7, "alignItems", "center");
        _$insert(_el$7, () => props.right);
        return _el$7;
      }
    }), null);
    _$insertNode(_el$8, _el$9);
    _$setProp(_el$8, "height", 1);
    _$setProp(_el$8, "border", ["left"]);
    _$setProp(_el$9, "height", 1);
    _$setProp(_el$9, "border", ["bottom"]);
    _$setProp(_el$0, "width", "100%");
    _$setProp(_el$0, "flexDirection", "row");
    _$setProp(_el$0, "justifyContent", "space-between");
    _$insert(_el$0, _$createComponent(Show, {
      get when() {
        return status().type !== "idle";
      },
      get fallback() {
        return props.hint ?? _$createElement("text");
      },
      get children() {
        var _el$1 = _$createElement("box"),
          _el$10 = _$createElement("box"),
          _el$11 = _$createElement("box"),
          _el$13 = _$createElement("box"),
          _el$14 = _$createElement("text"),
          _el$15 = _$createTextNode(`esc `),
          _el$17 = _$createElement("span");
        _$insertNode(_el$1, _el$10);
        _$insertNode(_el$1, _el$14);
        _$setProp(_el$1, "flexDirection", "row");
        _$setProp(_el$1, "gap", 1);
        _$setProp(_el$1, "flexGrow", 1);
        _$insertNode(_el$10, _el$11);
        _$insertNode(_el$10, _el$13);
        _$setProp(_el$10, "flexShrink", 0);
        _$setProp(_el$10, "flexDirection", "row");
        _$setProp(_el$10, "gap", 1);
        _$setProp(_el$11, "marginLeft", 1);
        _$insert(_el$11, _$createComponent(Show, {
          get when() {
            return kv.get("animations_enabled", true);
          },
          get fallback() {
            return (() => {
              var _el$43 = _$createElement("text");
              _$insertNode(_el$43, _$createTextNode(`[⋯]`));
              _$effect(_$p => _$setProp(_el$43, "fg", theme.textMuted, _$p));
              return _el$43;
            })();
          },
          get children() {
            var _el$12 = _$createElement("spinner");
            _$setProp(_el$12, "interval", 40);
            _$effect(_p$ => {
              var _v$ = spinnerDef().color,
                _v$2 = spinnerDef().frames;
              _v$ !== _p$.e && (_p$.e = _$setProp(_el$12, "color", _v$, _p$.e));
              _v$2 !== _p$.t && (_p$.t = _$setProp(_el$12, "frames", _v$2, _p$.t));
              return _p$;
            }, {
              e: undefined,
              t: undefined
            });
            return _el$12;
          }
        }));
        _$setProp(_el$13, "flexDirection", "row");
        _$setProp(_el$13, "gap", 1);
        _$setProp(_el$13, "flexShrink", 0);
        _$insert(_el$13, () => {
          const retry = createMemo(() => {
            const s = status();
            if (s.type !== "retry") return;
            return s;
          });
          const message = createMemo(() => {
            const r = retry();
            if (!r) return;
            if (r.message.includes("exceeded your current quota") && r.message.includes("gemini")) return "gemini is way too hot right now";
            if (r.message.length > 80) return r.message.slice(0, 80) + "...";
            return r.message;
          });
          const isTruncated = createMemo(() => {
            const r = retry();
            if (!r) return false;
            return r.message.length > 120;
          });
          const [seconds, setSeconds] = createSignal(0);
          onMount(() => {
            const timer = setInterval(() => {
              const next = retry()?.next;
              if (next) setSeconds(Math.round((next - Date.now()) / 1000));
            }, 1000);
            onCleanup(() => {
              clearInterval(timer);
            });
          });
          const handleMessageClick = () => {
            const r = retry();
            if (!r) return;
            if (isTruncated()) {
              void DialogAlert.show(dialog, "Retry Error", r.message);
            }
          };
          const retryText = () => {
            const r = retry();
            if (!r) return "";
            const baseMessage = message();
            const truncatedHint = isTruncated() ? " (click to expand)" : "";
            const duration = formatDuration(seconds());
            const retryInfo = ` [retrying ${duration ? `in ${duration} ` : ""}attempt #${r.attempt}]`;
            return baseMessage + truncatedHint + retryInfo;
          };
          return _$createComponent(Show, {
            get when() {
              return retry();
            },
            get children() {
              var _el$45 = _$createElement("box"),
                _el$46 = _$createElement("text");
              _$insertNode(_el$45, _el$46);
              _$setProp(_el$45, "onMouseUp", handleMessageClick);
              _$insert(_el$46, retryText);
              _$effect(_$p => _$setProp(_el$46, "fg", theme.error, _$p));
              return _el$45;
            }
          });
        });
        _$insertNode(_el$14, _el$15);
        _$insertNode(_el$14, _el$17);
        _$insert(_el$17, () => store.interrupt > 0 ? "again to interrupt" : "interrupt");
        _$effect(_p$ => {
          var _v$3 = status().type === "retry" ? "space-between" : "flex-start",
            _v$4 = store.interrupt > 0 ? theme.primary : theme.text,
            _v$5 = {
              fg: store.interrupt > 0 ? theme.primary : theme.textMuted
            };
          _v$3 !== _p$.e && (_p$.e = _$setProp(_el$1, "justifyContent", _v$3, _p$.e));
          _v$4 !== _p$.t && (_p$.t = _$setProp(_el$14, "fg", _v$4, _p$.t));
          _v$5 !== _p$.a && (_p$.a = _$setProp(_el$17, "style", _v$5, _p$.a));
          return _p$;
        }, {
          e: undefined,
          t: undefined,
          a: undefined
        });
        return _el$1;
      }
    }), null);
    _$insert(_el$0, _$createComponent(Show, {
      get when() {
        return status().type !== "retry";
      },
      get children() {
        var _el$18 = _$createElement("box");
        _$setProp(_el$18, "gap", 2);
        _$setProp(_el$18, "flexDirection", "row");
        _$insert(_el$18, _$createComponent(Show, {
          get when() {
            return editorFileLabelDisplay();
          },
          children: file => (() => {
            var _el$47 = _$createElement("text");
            _$setProp(_el$47, "onMouseOver", () => setEditorContextHover(true));
            _$setProp(_el$47, "onMouseOut", () => setEditorContextHover(false));
            _$setProp(_el$47, "onMouseUp", dismissEditorContext);
            _$insert(_el$47, (() => {
              var _c$2 = _$memo(() => !!editorContextHover());
              return () => _c$2() ? `x ${file()}` : file();
            })());
            _$effect(_$p => _$setProp(_el$47, "fg", theme.secondary, _$p));
            return _el$47;
          })()
        }), null);
        _$insert(_el$18, _$createComponent(Switch, {
          get children() {
            return [_$createComponent(Match, {
              get when() {
                return store.mode === "normal";
              },
              get children() {
                return [_$createComponent(Switch, {
                  get children() {
                    return [_$createComponent(Match, {
                      get when() {
                        return usage();
                      },
                      children: item => (() => {
                        var _el$48 = _$createElement("text");
                        _$setProp(_el$48, "wrapMode", "none");
                        _$insert(_el$48, () => [item().context, item().cost].filter(Boolean).join(" · "));
                        _$effect(_$p => _$setProp(_el$48, "fg", theme.textMuted, _$p));
                        return _el$48;
                      })()
                    }), _$createComponent(Match, {
                      when: true,
                      get children() {
                        var _el$19 = _$createElement("text"),
                          _el$20 = _$createTextNode(` `),
                          _el$21 = _$createElement("span");
                        _$insertNode(_el$19, _el$20);
                        _$insertNode(_el$19, _el$21);
                        _$insert(_el$19, () => keybind.print("agent_cycle"), _el$20);
                        _$insertNode(_el$21, _$createTextNode(`agents`));
                        _$effect(_p$ => {
                          var _v$6 = theme.text,
                            _v$7 = {
                              fg: theme.textMuted
                            };
                          _v$6 !== _p$.e && (_p$.e = _$setProp(_el$19, "fg", _v$6, _p$.e));
                          _v$7 !== _p$.t && (_p$.t = _$setProp(_el$21, "style", _v$7, _p$.t));
                          return _p$;
                        }, {
                          e: undefined,
                          t: undefined
                        });
                        return _el$19;
                      }
                    })];
                  }
                }), (() => {
                  var _el$23 = _$createElement("text"),
                    _el$24 = _$createTextNode(` `),
                    _el$25 = _$createElement("span");
                  _$insertNode(_el$23, _el$24);
                  _$insertNode(_el$23, _el$25);
                  _$insert(_el$23, () => keybind.print("command_list"), _el$24);
                  _$insertNode(_el$25, _$createTextNode(`commands`));
                  _$effect(_p$ => {
                    var _v$8 = theme.text,
                      _v$9 = {
                        fg: theme.textMuted
                      };
                    _v$8 !== _p$.e && (_p$.e = _$setProp(_el$23, "fg", _v$8, _p$.e));
                    _v$9 !== _p$.t && (_p$.t = _$setProp(_el$25, "style", _v$9, _p$.t));
                    return _p$;
                  }, {
                    e: undefined,
                    t: undefined
                  });
                  return _el$23;
                })()];
              }
            }), _$createComponent(Match, {
              get when() {
                return store.mode === "shell";
              },
              get children() {
                var _el$27 = _$createElement("text"),
                  _el$28 = _$createTextNode(`esc `),
                  _el$29 = _$createElement("span");
                _$insertNode(_el$27, _el$28);
                _$insertNode(_el$27, _el$29);
                _$insertNode(_el$29, _$createTextNode(`exit shell mode`));
                _$effect(_p$ => {
                  var _v$0 = theme.text,
                    _v$1 = {
                      fg: theme.textMuted
                    };
                  _v$0 !== _p$.e && (_p$.e = _$setProp(_el$27, "fg", _v$0, _p$.e));
                  _v$1 !== _p$.t && (_p$.t = _$setProp(_el$29, "style", _v$1, _p$.t));
                  return _p$;
                }, {
                  e: undefined,
                  t: undefined
                });
                return _el$27;
              }
            })];
          }
        }), null);
        return _el$18;
      }
    }), null);
    _$effect(_p$ => {
      var _v$10 = props.visible !== false,
        _v$11 = borderHighlight(),
        _v$12 = {
          ...SplitBorder.customBorderChars,
          bottomLeft: "╹"
        },
        _v$13 = theme.backgroundElement,
        _v$14 = placeholderText(),
        _v$15 = theme.textMuted,
        _v$16 = keybind.leader ? theme.textMuted : theme.text,
        _v$17 = keybind.leader ? theme.textMuted : theme.text,
        _v$18 = textareaKeybindings(),
        _v$19 = theme.backgroundElement,
        _v$20 = theme.text,
        _v$21 = syntax(),
        _v$22 = borderHighlight(),
        _v$23 = {
          ...EmptyBorder,
          vertical: theme.backgroundElement.a !== 0 ? "╹" : " "
        },
        _v$24 = theme.backgroundElement,
        _v$25 = theme.backgroundElement.a !== 0 ? {
          ...EmptyBorder,
          horizontal: "▀"
        } : {
          ...EmptyBorder,
          horizontal: " "
        };
      _v$10 !== _p$.e && (_p$.e = _$setProp(_el$, "visible", _v$10, _p$.e));
      _v$11 !== _p$.t && (_p$.t = _$setProp(_el$2, "borderColor", _v$11, _p$.t));
      _v$12 !== _p$.a && (_p$.a = _$setProp(_el$2, "customBorderChars", _v$12, _p$.a));
      _v$13 !== _p$.o && (_p$.o = _$setProp(_el$3, "backgroundColor", _v$13, _p$.o));
      _v$14 !== _p$.i && (_p$.i = _$setProp(_el$4, "placeholder", _v$14, _p$.i));
      _v$15 !== _p$.n && (_p$.n = _$setProp(_el$4, "placeholderColor", _v$15, _p$.n));
      _v$16 !== _p$.s && (_p$.s = _$setProp(_el$4, "textColor", _v$16, _p$.s));
      _v$17 !== _p$.h && (_p$.h = _$setProp(_el$4, "focusedTextColor", _v$17, _p$.h));
      _v$18 !== _p$.r && (_p$.r = _$setProp(_el$4, "keyBindings", _v$18, _p$.r));
      _v$19 !== _p$.d && (_p$.d = _$setProp(_el$4, "focusedBackgroundColor", _v$19, _p$.d));
      _v$20 !== _p$.l && (_p$.l = _$setProp(_el$4, "cursorColor", _v$20, _p$.l));
      _v$21 !== _p$.u && (_p$.u = _$setProp(_el$4, "syntaxStyle", _v$21, _p$.u));
      _v$22 !== _p$.c && (_p$.c = _$setProp(_el$8, "borderColor", _v$22, _p$.c));
      _v$23 !== _p$.w && (_p$.w = _$setProp(_el$8, "customBorderChars", _v$23, _p$.w));
      _v$24 !== _p$.m && (_p$.m = _$setProp(_el$9, "borderColor", _v$24, _p$.m));
      _v$25 !== _p$.f && (_p$.f = _$setProp(_el$9, "customBorderChars", _v$25, _p$.f));
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
      m: undefined,
      f: undefined
    });
    return _el$;
  })()];
}