import { template as _$template } from "solid-js/web";
import { delegateEvents as _$delegateEvents } from "solid-js/web";
import { style as _$style } from "solid-js/web";
import { setStyleProperty as _$setStyleProperty } from "solid-js/web";
import { classList as _$classList } from "solid-js/web";
import { setAttribute as _$setAttribute } from "solid-js/web";
import { effect as _$effect } from "solid-js/web";
import { addEventListener as _$addEventListener } from "solid-js/web";
import { use as _$use } from "solid-js/web";
import { memo as _$memo } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<div class="d-flex align-items-center gap-2"><span></span><span class="text-secondary small fw-medium text-[10px]!">`),
  _tmpl$2 = /*#__PURE__*/_$template(`<div class="d-flex align-items-center gap-2"><span>`),
  _tmpl$3 = /*#__PURE__*/_$template(`<div class=relative><div class="relative max-h-[240px] overflow-y-auto no-scrollbar"style=scroll-padding-bottom:56px><div data-component=prompt-input role=textbox aria-multiline=true contenteditable=true inputmode=text autocomplete=off style=padding-bottom:56px></div><div class="absolute top-0 inset-x-0 pl-3 pr-2 pt-2 fw-normal text-secondary pointer-events-none whitespace-nowrap truncate"style=padding-bottom:56px></div></div><div aria-hidden=true class="pointer-events-none absolute inset-x-0 bottom-0"style="height:56px;background:linear-gradient(to top, var(--surface-raised-stronger-non-alpha) calc(100% - 20px), transparent)"></div><div class="pointer-events-none absolute bottom-2 right-2 d-flex align-items-center gap-2"><input type=file multiple class=d-none><div class="d-flex align-items-center gap-1 pointer-events-auto"></div></div><div class="pointer-events-none absolute bottom-2 left-2"><div class=pointer-events-auto>`),
  _tmpl$4 = /*#__PURE__*/_$template(`<div data-component=prompt-agent-control>`),
  _tmpl$5 = /*#__PURE__*/_$template(`<span class=truncate>`),
  _tmpl$6 = /*#__PURE__*/_$template(`<div data-component=prompt-model-control>`),
  _tmpl$7 = /*#__PURE__*/_$template(`<div data-component=prompt-variant-control>`),
  _tmpl$8 = /*#__PURE__*/_$template(`<div class="px-1.75 pt-5.5 pb-2 d-flex align-items-center gap-2 min-w-0"><div class="d-flex align-items-center gap-1.5 min-w-0 flex-fill relative"><div class="h-7 d-flex align-items-center gap-1.5 min-w-0 absolute inset-0"style="padding:0 0px 0 8px"><span class="truncate fw-medium text-body"></span><div class=flex-fill></div></div><div class="d-flex align-items-center gap-1.5 min-w-0 flex-fill h-7">`),
  _tmpl$9 = /*#__PURE__*/_$template(`<div class="relative size-full _max-h-[320px] d-flex flex-column gap-0">`);
import { useFilteredList } from "@/lib/hooks.js";
import { useSpring } from "@/vendor/ui/components/motion-spring.js";
import { createEffect, on, Show, onCleanup, createMemo, createSignal } from "solid-js";
import { createStore } from "solid-js/store";
import { useLocal } from "@/context/local.js";
import { useProvidersController } from "@/controllers/providers.js";
import { showToast } from "@/lib/toast.js";
import { selectionFromLines, useFile } from "@/context/file.js";
import { DEFAULT_PROMPT, isPromptEqual, usePrompt } from "@/context/prompt.js";
import { useLayout } from "@/context/layout.js";
import { useSync } from "@/context/sync.js";
import { useComments } from "@/context/comments.js";
import { Button } from "@/bs/button.js";
import { DockShellForm, DockTray } from "@/vendor/ui/components/dock-surface.js";
import { Icon } from "@/bs/icon.js";
import { ProviderIcon } from "@/vendor/ui/components/provider-icon.js";
import { Tooltip, TooltipKeybind } from "@/bs/tooltip.js";
import { IconButton } from "@/bs/icon-button.js";
import { Select } from "@/bs/select.js";
import { useDialog } from "@/lib/dialog.js";
import { ModelSelectorPopover } from "@/components/dialog-select-model.js";
import { useProviders } from "@/hooks/use-providers.js";
import { useCommand } from "@/context/command.js";
import { Persist, persisted } from "@/utils/persist.js";
import { useLanguage } from "@/context/language.js";
import { usePlatform } from "@/context/platform.js";
import { useSessionLayout } from "@/pages/session/session-layout.js";
import { createSessionTabs } from "@/pages/session/helpers.js";
import { createTextFragment, getCursorPosition, setCursorPosition, setRangeEdge } from "./prompt-input/editor-dom.js";
import { createPromptAttachments } from "./prompt-input/attachments.js";
import { ACCEPTED_FILE_TYPES } from "./prompt-input/files.js";
import { canNavigateHistoryAtCursor, navigatePromptHistory, prependHistoryEntry, promptLength } from "./prompt-input/history.js";
import { useComposerController } from "@/controllers/session-composer.js";
import { PromptPopover } from "./prompt-input/slash-popover.js";
import { PromptContextItems } from "./prompt-input/context-items.js";
import { PromptImageAttachments } from "./prompt-input/image-attachments.js";
import { PromptDragOverlay } from "./prompt-input/drag-overlay.js";
import { promptPlaceholder } from "./prompt-input/placeholder.js";
import { ImagePreview } from "@/vendor/ui/components/image-preview.js";
const EXAMPLES = ["prompt.example.1", "prompt.example.2", "prompt.example.3", "prompt.example.4", "prompt.example.5", "prompt.example.6", "prompt.example.7", "prompt.example.8", "prompt.example.9", "prompt.example.10", "prompt.example.11", "prompt.example.12", "prompt.example.13", "prompt.example.14", "prompt.example.15", "prompt.example.16", "prompt.example.17", "prompt.example.18", "prompt.example.19", "prompt.example.20", "prompt.example.21", "prompt.example.22", "prompt.example.23", "prompt.example.24", "prompt.example.25"];
const NON_EMPTY_TEXT = /[^\s\u200B]/;
export const PromptInput = props => {
  const sync = useSync();
  const local = useLocal();
  const files = useFile();
  const prompt = usePrompt();
  const layout = useLayout();
  const comments = useComments();
  const dialog = useDialog();
  const providers = useProviders();
  const command = useCommand();
  const language = useLanguage();
  const platform = usePlatform();
  const {
    params,
    tabs,
    view
  } = useSessionLayout();
  let editorRef;
  let fileInputRef;
  let scrollRef;
  let slashPopoverRef;
  const mirror = {
    input: false
  };
  const inset = 56;
  const space = `${inset}px`;
  const scrollCursorIntoView = () => {
    const container = scrollRef;
    const selection = window.getSelection();
    if (!container || !selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    if (!editorRef.contains(range.startContainer)) return;
    const cursor = getCursorPosition(editorRef);
    const length = promptLength(prompt.current().filter(part => part.type !== "image"));
    if (cursor >= length) {
      container.scrollTop = container.scrollHeight;
      return;
    }
    const rect = range.getClientRects().item(0) ?? range.getBoundingClientRect();
    if (!rect.height) return;
    const containerRect = container.getBoundingClientRect();
    const top = rect.top - containerRect.top + container.scrollTop;
    const bottom = rect.bottom - containerRect.top + container.scrollTop;
    const padding = 12;
    if (top < container.scrollTop + padding) {
      container.scrollTop = Math.max(0, top - padding);
      return;
    }
    if (bottom > container.scrollTop + container.clientHeight - inset) {
      container.scrollTop = bottom - container.clientHeight + inset;
    }
  };
  const queueScroll = (count = 2) => {
    requestAnimationFrame(() => {
      scrollCursorIntoView();
      if (count > 1) queueScroll(count - 1);
    });
  };
  const activeFileTab = createSessionTabs({
    tabs,
    pathFromTab: files.pathFromTab,
    normalizeTab: tab => tab.startsWith("file://") ? files.tab(tab) : tab
  }).activeFileTab;
  const commentInReview = path => {
    const sessionID = params.id;
    if (!sessionID) return false;
    const diffs = sync.data?.session_diff?.[sessionID];
    if (!diffs) return false;
    return diffs.some(diff => diff.file === path);
  };
  const openComment = item => {
    if (!item.commentID) return;
    const focus = {
      file: item.path,
      id: item.commentID
    };
    comments.setActive(focus);
    const queueCommentFocus = (attempts = 6) => {
      const schedule = left => {
        requestAnimationFrame(() => {
          comments.setFocus({
            ...focus
          });
          if (left <= 0) return;
          requestAnimationFrame(() => {
            const current = comments.focus();
            if (!current) return;
            if (current.file !== focus.file || current.id !== focus.id) return;
            schedule(left - 1);
          });
        });
      };
      schedule(attempts);
    };
    const wantsReview = item.commentOrigin === "review" || item.commentOrigin !== "file" && commentInReview(item.path);
    if (wantsReview) {
      if (!view().reviewPanel.opened()) view().reviewPanel.open();
      layout.fileTree.setTab("changes");
      tabs().setActive("review");
      queueCommentFocus();
      return;
    }
    if (!view().reviewPanel.opened()) view().reviewPanel.open();
    layout.fileTree.setTab("all");
    const tab = files.tab(item.path);
    void tabs().open(tab);
    tabs().setActive(tab);
    void Promise.resolve(files.load(item.path)).finally(() => queueCommentFocus());
  };
  const recent = createMemo(() => {
    const all = tabs().all();
    const active = activeFileTab();
    const order = active ? [active, ...all.filter(x => x !== active)] : all;
    const seen = new Set();
    const paths = [];
    for (const tab of order) {
      const path = files.pathFromTab(tab);
      if (!path) continue;
      if (seen.has(path)) continue;
      seen.add(path);
      paths.push(path);
    }
    return paths;
  });
  const info = createMemo(() => params.id ? sync.session.get(params.id) : undefined);
  const status = createMemo(() => sync.data?.session_status?.[params.id ?? ""] ?? {
    type: "idle"
  });
  const working = createMemo(() => status()?.type !== "idle");
  const imageAttachments = createMemo(() => prompt.current().filter(part => part.type === "image"));
  // Warn when images are attached to a model that can't see them. Ollama reports
  // model capabilities via /api/show (checked in the main process); only models
  // explicitly lacking "vision" trigger the warning — unknown capability never
  // blocks. Warns once per model so it isn't noisy.
  const providersController = useProvidersController();
  const [visionWarnedFor, setVisionWarnedFor] = createSignal("");
  createEffect(() => {
    const images = imageAttachments();
    const model = local.model.current();
    if (!images.length || !model) return;
    const key = `${model.provider?.id}:${model.id}`;
    if (visionWarnedFor() === key) return;
    const baseURL = providersController.getCustom(model.provider?.id)?.options?.baseURL;
    const api = typeof window !== "undefined" ? window.api : null;
    if (!baseURL || !api?.llmModelVision) return;
    api.llmModelVision(baseURL, model.id).then(supports => {
      if (supports !== false) return;
      setVisionWarnedFor(key);
      showToast({
        title: "画像非対応のモデル",
        description: `「${model.name}」は画像入力に対応していません（テキストのみ）。画像を使うには vision 対応モデルを選んでください。`
      });
    }).catch(() => {});
  });
  const [store, setStore] = createStore({
    popover: null,
    historyIndex: -1,
    savedPrompt: null,
    placeholder: Math.floor(Math.random() * EXAMPLES.length),
    draggingType: null,
    mode: "normal",
    applyingHistory: false
  });
  const buttonsSpring = useSpring(() => store.mode === "normal" ? 1 : 0, {
    visualDuration: 0.2,
    bounce: 0
  });
  const motion = value => ({
    opacity: value,
    transform: `scale(${0.98 + value * 0.02})`,
    filter: `blur(${(1 - value) * 2}px)`,
    "pointer-events": value > 0.5 ? "auto" : "none"
  });
  const buttons = createMemo(() => motion(buttonsSpring()));
  const shell = createMemo(() => motion(1 - buttonsSpring()));
  const control = createMemo(() => ({
    height: "28px",
    ...buttons()
  }));
  const commentCount = createMemo(() => {
    if (store.mode === "shell") return 0;
    return prompt.context.items().filter(item => !!item.comment?.trim()).length;
  });
  const blank = createMemo(() => {
    const text = prompt.current().map(part => "content" in part ? part.content : "").join("");
    return text.trim().length === 0 && imageAttachments().length === 0 && commentCount() === 0;
  });
  const stopping = createMemo(() => working() && blank());
  const tip = () => {
    if (stopping()) {
      return (() => {
        var _el$ = _tmpl$(),
          _el$2 = _el$.firstChild,
          _el$3 = _el$2.nextSibling;
        _$insert(_el$2, () => language.t("prompt.action.stop"));
        _$insert(_el$3, () => language.t("common.key.esc"));
        return _el$;
      })();
    }
    return (() => {
      var _el$4 = _tmpl$2(),
        _el$5 = _el$4.firstChild;
      _$insert(_el$5, () => language.t("prompt.action.send"));
      _$insert(_el$4, _$createComponent(Icon, {
        name: "enter",
        size: "small",
        "class": "text-secondary"
      }), null);
      return _el$4;
    })();
  };
  const contextItems = createMemo(() => {
    const items = prompt.context.items();
    if (store.mode !== "shell") return items;
    return items.filter(item => !item.comment?.trim());
  });
  const hasUserPrompt = createMemo(() => {
    const sessionID = params.id;
    if (!sessionID) return false;
    const messages = sync.data?.message?.[sessionID];
    if (!messages) return false;
    return messages.some(m => m.role === "user");
  });
  const [history, setHistory] = persisted(Persist.global("prompt-history", ["prompt-history.v1"]), createStore({
    entries: []
  }));
  const [shellHistory, setShellHistory] = persisted(Persist.global("prompt-history-shell", ["prompt-history-shell.v1"]), createStore({
    entries: []
  }));
  const suggest = createMemo(() => !hasUserPrompt());
  const placeholder = createMemo(() => promptPlaceholder({
    mode: store.mode,
    commentCount: commentCount(),
    example: suggest() ? store.mode === "shell" ? "git status" : language.t(EXAMPLES[store.placeholder]) : "",
    suggest: suggest(),
    t: (key, params) => language.t(key, params)
  }));
  const historyComments = () => {
    const byID = new Map(comments.all().map(item => [`${item.file}\n${item.id}`, item]));
    return prompt.context.items().flatMap(item => {
      if (item.type !== "file") return [];
      const comment = item.comment?.trim();
      if (!comment) return [];
      const selection = item.commentID ? byID.get(`${item.path}\n${item.commentID}`)?.selection : undefined;
      const nextSelection = selection ?? (item.selection ? {
        start: item.selection.startLine,
        end: item.selection.endLine
      } : undefined);
      if (!nextSelection) return [];
      return [{
        id: item.commentID ?? item.key,
        path: item.path,
        selection: {
          ...nextSelection
        },
        comment,
        time: item.commentID ? byID.get(`${item.path}\n${item.commentID}`)?.time ?? Date.now() : Date.now(),
        origin: item.commentOrigin,
        preview: item.preview
      }];
    });
  };
  const applyHistoryComments = items => {
    comments.replace(items.map(item => ({
      id: item.id,
      file: item.path,
      selection: {
        ...item.selection
      },
      comment: item.comment,
      time: item.time
    })));
    prompt.context.replaceComments(items.map(item => ({
      type: "file",
      path: item.path,
      selection: selectionFromLines(item.selection),
      comment: item.comment,
      commentID: item.id,
      commentOrigin: item.origin,
      preview: item.preview
    })));
  };
  const applyHistoryPrompt = (entry, position) => {
    const p = entry.prompt;
    const length = position === "start" ? 0 : promptLength(p);
    setStore("applyingHistory", true);
    applyHistoryComments(entry.comments);
    prompt.set(p, length);
    requestAnimationFrame(() => {
      editorRef.focus();
      setCursorPosition(editorRef, length);
      setStore("applyingHistory", false);
      queueScroll();
    });
  };
  const getCaretState = () => {
    const selection = window.getSelection();
    const textLength = promptLength(prompt.current());
    if (!selection || selection.rangeCount === 0) {
      return {
        collapsed: false,
        cursorPosition: 0,
        textLength
      };
    }
    const anchorNode = selection.anchorNode;
    if (!anchorNode || !editorRef.contains(anchorNode)) {
      return {
        collapsed: false,
        cursorPosition: 0,
        textLength
      };
    }
    return {
      collapsed: selection.isCollapsed,
      cursorPosition: getCursorPosition(editorRef),
      textLength
    };
  };
  const escBlur = () => platform.platform === "desktop" && platform.os === "macos";
  const pick = () => fileInputRef?.click();
  const setMode = mode => {
    setStore("mode", mode);
    setStore("popover", null);
    requestAnimationFrame(() => editorRef?.focus());
  };
  const shellModeKey = "mod+shift+x";
  const normalModeKey = "mod+shift+e";
  command.register("prompt-input", () => [{
    id: "file.attach",
    title: language.t("prompt.action.attachFile"),
    category: language.t("command.category.file"),
    keybind: "mod+u",
    disabled: store.mode !== "normal",
    onSelect: pick
  }, {
    id: "prompt.mode.shell",
    title: language.t("command.prompt.mode.shell"),
    category: language.t("command.category.session"),
    keybind: shellModeKey,
    disabled: store.mode === "shell",
    onSelect: () => setMode("shell")
  }, {
    id: "prompt.mode.normal",
    title: language.t("command.prompt.mode.normal"),
    category: language.t("command.category.session"),
    keybind: normalModeKey,
    disabled: store.mode === "normal",
    onSelect: () => setMode("normal")
  }]);
  const closePopover = () => setStore("popover", null);
  const resetHistoryNavigation = (force = false) => {
    if (!force && (store.historyIndex < 0 || store.applyingHistory)) return;
    setStore("historyIndex", -1);
    setStore("savedPrompt", null);
  };
  const clearEditor = () => {
    editorRef.innerHTML = "";
  };
  const setEditorText = text => {
    clearEditor();
    editorRef.textContent = text;
  };
  const focusEditorEnd = () => {
    requestAnimationFrame(() => {
      editorRef.focus();
      const range = document.createRange();
      const selection = window.getSelection();
      range.selectNodeContents(editorRef);
      range.collapse(false);
      selection?.removeAllRanges();
      selection?.addRange(range);
    });
  };
  const currentCursor = () => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || !editorRef.contains(selection.anchorNode)) return null;
    return getCursorPosition(editorRef);
  };
  const restoreFocus = () => {
    requestAnimationFrame(() => {
      const cursor = prompt.cursor() ?? promptLength(prompt.current());
      editorRef.focus();
      setCursorPosition(editorRef, cursor);
      queueScroll();
    });
  };
  const renderEditorWithCursor = parts => {
    const cursor = currentCursor();
    renderEditor(parts);
    if (cursor !== null) setCursorPosition(editorRef, cursor);
  };
  createEffect(() => {
    params.id;
    if (params.id) return;
    if (!suggest()) return;
    const interval = setInterval(() => {
      setStore("placeholder", prev => (prev + 1) % EXAMPLES.length);
    }, 6500);
    onCleanup(() => clearInterval(interval));
  });
  const [composing, setComposing] = createSignal(false);
  const isImeComposing = event => event.isComposing || composing() || event.keyCode === 229;
  const handleBlur = () => {
    closePopover();
    setComposing(false);
  };
  const handleCompositionStart = () => {
    setComposing(true);
  };
  const handleCompositionEnd = () => {
    setComposing(false);
    requestAnimationFrame(() => {
      if (composing()) return;
      reconcile(prompt.current().filter(part => part.type !== "image"));
    });
  };
  const agentList = createMemo(() => sync.data?.agent.filter(agent => !agent.hidden && agent.mode !== "primary").map(agent => ({
    type: "agent",
    name: agent.name,
    display: agent.name
  })));
  const agentNames = createMemo(() => local.agent.list().map(agent => agent.name));
  const handleAtSelect = option => {
    if (!option) return;
    if (option.type === "agent") {
      addPart({
        type: "agent",
        name: option.name,
        content: "@" + option.name,
        start: 0,
        end: 0
      });
    } else {
      addPart({
        type: "file",
        path: option.path,
        content: "@" + option.path,
        start: 0,
        end: 0
      });
    }
  };
  const atKey = x => {
    if (!x) return "";
    return x.type === "agent" ? `agent:${x.name}` : `file:${x.path}`;
  };
  const {
    flat: atFlat,
    active: atActive,
    setActive: setAtActive,
    onInput: atOnInput,
    onKeyDown: atOnKeyDown
  } = useFilteredList({
    items: async query => {
      const agents = agentList();
      const open = recent();
      const seen = new Set(open);
      const pinned = open.map(path => ({
        type: "file",
        path,
        display: path,
        recent: true
      }));
      if (!query.trim()) return [...agents, ...pinned];
      const paths = await files.searchFilesAndDirectories(query);
      const fileOptions = paths.filter(path => !seen.has(path)).map(path => ({
        type: "file",
        path,
        display: path
      }));
      return [...agents, ...pinned, ...fileOptions];
    },
    key: atKey,
    filterKeys: ["display"],
    groupBy: item => {
      if (item.type === "agent") return "agent";
      if (item.recent) return "recent";
      return "file";
    },
    sortGroupsBy: (a, b) => {
      const rank = category => {
        if (category === "agent") return 0;
        if (category === "recent") return 1;
        return 2;
      };
      return rank(a.category) - rank(b.category);
    },
    onSelect: handleAtSelect
  });
  const slashCommands = createMemo(() => {
    const builtin = command.options.filter(opt => !opt.disabled && !opt.id.startsWith("suggested.") && opt.slash).map(opt => ({
      id: opt.id,
      trigger: opt.slash,
      title: opt.title,
      description: opt.description,
      keybind: opt.keybind,
      type: "builtin"
    }));
    const custom = sync.data?.command.map(cmd => ({
      id: `custom.${cmd.name}`,
      trigger: cmd.name,
      title: cmd.name,
      description: cmd.description,
      type: "custom",
      source: cmd.source
    }));
    return [...custom, ...builtin];
  });
  const handleSlashSelect = cmd => {
    if (!cmd) return;
    closePopover();
    const images = imageAttachments();
    if (cmd.type === "custom") {
      const text = `/${cmd.trigger} `;
      setEditorText(text);
      prompt.set([{
        type: "text",
        content: text,
        start: 0,
        end: text.length
      }, ...images], text.length);
      focusEditorEnd();
      return;
    }
    clearEditor();
    prompt.set([...DEFAULT_PROMPT, ...images], 0);
    command.trigger(cmd.id, "slash");
  };
  const {
    flat: slashFlat,
    active: slashActive,
    setActive: setSlashActive,
    onInput: slashOnInput,
    onKeyDown: slashOnKeyDown
  } = useFilteredList({
    items: slashCommands,
    key: x => x?.id,
    filterKeys: ["trigger", "title"],
    onSelect: handleSlashSelect
  });
  const createPill = part => {
    const pill = document.createElement("span");
    pill.textContent = part.content;
    pill.setAttribute("data-type", part.type);
    if (part.type === "file") pill.setAttribute("data-path", part.path);
    if (part.type === "agent") pill.setAttribute("data-name", part.name);
    pill.setAttribute("contenteditable", "false");
    pill.style.userSelect = "text";
    pill.style.cursor = "default";
    return pill;
  };
  const isNormalizedEditor = () => Array.from(editorRef.childNodes).every(node => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? "";
      if (!text.includes("\u200B")) return true;
      if (text !== "\u200B") return false;
      const prev = node.previousSibling;
      const next = node.nextSibling;
      const prevIsBr = prev?.nodeType === Node.ELEMENT_NODE && prev.tagName === "BR";
      return !!prevIsBr && !next;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return false;
    const el = node;
    if (el.dataset.type === "file") return true;
    if (el.dataset.type === "agent") return true;
    return el.tagName === "BR";
  });
  const renderEditor = parts => {
    clearEditor();
    for (const part of parts) {
      if (part.type === "text") {
        editorRef.appendChild(createTextFragment(part.content));
        continue;
      }
      if (part.type === "file" || part.type === "agent") {
        editorRef.appendChild(createPill(part));
      }
    }
    const last = editorRef.lastChild;
    if (last?.nodeType === Node.ELEMENT_NODE && last.tagName === "BR") {
      editorRef.appendChild(document.createTextNode("\u200B"));
    }
  };

  // Auto-scroll active command into view when navigating with keyboard
  createEffect(() => {
    const activeId = slashActive();
    if (!activeId || !slashPopoverRef) return;
    requestAnimationFrame(() => {
      const element = slashPopoverRef.querySelector(`[data-slash-id="${activeId}"]`);
      element?.scrollIntoView({
        block: "nearest",
        behavior: "smooth"
      });
    });
  });
  const selectPopoverActive = () => {
    if (store.popover === "at") {
      const items = atFlat();
      if (items.length === 0) return;
      const active = atActive();
      const item = items.find(entry => atKey(entry) === active) ?? items[0];
      handleAtSelect(item);
      return;
    }
    if (store.popover === "slash") {
      const items = slashFlat();
      if (items.length === 0) return;
      const active = slashActive();
      const item = items.find(entry => entry.id === active) ?? items[0];
      handleSlashSelect(item);
    }
  };
  const reconcile = input => {
    if (mirror.input) {
      mirror.input = false;
      if (isNormalizedEditor()) return;
      renderEditorWithCursor(input);
      return;
    }
    const dom = parseFromDOM();
    if (isNormalizedEditor() && isPromptEqual(input, dom)) return;
    renderEditorWithCursor(input);
  };
  createEffect(on(() => prompt.current(), parts => {
    if (composing()) return;
    reconcile(parts.filter(part => part.type !== "image"));
  }));
  const parseFromDOM = () => {
    const parts = [];
    let position = 0;
    let buffer = "";
    const flushText = () => {
      let content = buffer;
      if (content.includes("\r")) content = content.replace(/\r\n?/g, "\n");
      if (content.includes("\u200B")) content = content.replace(/\u200B/g, "");
      buffer = "";
      if (!content) return;
      parts.push({
        type: "text",
        content,
        start: position,
        end: position + content.length
      });
      position += content.length;
    };
    const pushFile = file => {
      const content = file.textContent ?? "";
      parts.push({
        type: "file",
        path: file.dataset.path,
        content,
        start: position,
        end: position + content.length
      });
      position += content.length;
    };
    const pushAgent = agent => {
      const content = agent.textContent ?? "";
      parts.push({
        type: "agent",
        name: agent.dataset.name,
        content,
        start: position,
        end: position + content.length
      });
      position += content.length;
    };
    const visit = node => {
      if (node.nodeType === Node.TEXT_NODE) {
        buffer += node.textContent ?? "";
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const el = node;
      if (el.dataset.type === "file") {
        flushText();
        pushFile(el);
        return;
      }
      if (el.dataset.type === "agent") {
        flushText();
        pushAgent(el);
        return;
      }
      if (el.tagName === "BR") {
        buffer += "\n";
        return;
      }
      for (const child of Array.from(el.childNodes)) {
        visit(child);
      }
    };
    const children = Array.from(editorRef.childNodes);
    children.forEach((child, index) => {
      const isBlock = child.nodeType === Node.ELEMENT_NODE && ["DIV", "P"].includes(child.tagName);
      visit(child);
      if (isBlock && index < children.length - 1) {
        buffer += "\n";
      }
    });
    flushText();
    if (parts.length === 0) parts.push(...DEFAULT_PROMPT);
    return parts;
  };
  const handleInput = () => {
    const rawParts = parseFromDOM();
    const images = imageAttachments();
    const cursorPosition = getCursorPosition(editorRef);
    const rawText = rawParts.length === 1 && rawParts[0]?.type === "text" ? rawParts[0].content : rawParts.map(p => "content" in p ? p.content : "").join("");
    const hasNonText = rawParts.some(part => part.type !== "text");
    const shouldReset = !NON_EMPTY_TEXT.test(rawText) && !hasNonText && images.length === 0;
    if (shouldReset) {
      closePopover();
      resetHistoryNavigation();
      if (prompt.dirty()) {
        mirror.input = true;
        prompt.set(DEFAULT_PROMPT, 0);
      }
      queueScroll();
      return;
    }
    const shellMode = store.mode === "shell";
    if (!shellMode) {
      const atMatch = rawText.substring(0, cursorPosition).match(/@(\S*)$/);
      const slashMatch = rawText.match(/^\/(\S*)$/);
      if (atMatch) {
        atOnInput(atMatch[1]);
        setStore("popover", "at");
      } else if (slashMatch) {
        slashOnInput(slashMatch[1]);
        setStore("popover", "slash");
      } else {
        closePopover();
      }
    } else {
      closePopover();
    }
    resetHistoryNavigation();
    mirror.input = true;
    prompt.set([...rawParts, ...images], cursorPosition);
    queueScroll();
  };
  const addPart = part => {
    if (part.type === "image") return false;
    const selection = window.getSelection();
    if (!selection) return false;
    if (selection.rangeCount === 0 || !editorRef.contains(selection.anchorNode)) {
      editorRef.focus();
      const cursor = prompt.cursor() ?? promptLength(prompt.current());
      setCursorPosition(editorRef, cursor);
    }
    if (selection.rangeCount === 0) return false;
    const range = selection.getRangeAt(0);
    if (!editorRef.contains(range.startContainer)) return false;
    if (part.type === "file" || part.type === "agent") {
      const cursorPosition = getCursorPosition(editorRef);
      const rawText = prompt.current().map(p => "content" in p ? p.content : "").join("");
      const textBeforeCursor = rawText.substring(0, cursorPosition);
      const atMatch = textBeforeCursor.match(/@(\S*)$/);
      const pill = createPill(part);
      const gap = document.createTextNode(" ");
      if (atMatch) {
        const start = atMatch.index ?? cursorPosition - atMatch[0].length;
        setRangeEdge(editorRef, range, "start", start);
        setRangeEdge(editorRef, range, "end", cursorPosition);
      }
      range.deleteContents();
      range.insertNode(gap);
      range.insertNode(pill);
      range.setStartAfter(gap);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    if (part.type === "text") {
      const fragment = createTextFragment(part.content);
      const last = fragment.lastChild;
      range.deleteContents();
      range.insertNode(fragment);
      if (last) {
        if (last.nodeType === Node.TEXT_NODE) {
          const text = last.textContent ?? "";
          if (text === "\u200B") {
            range.setStart(last, 0);
          }
          if (text !== "\u200B") {
            range.setStart(last, text.length);
          }
        }
        if (last.nodeType !== Node.TEXT_NODE) {
          const isBreak = last.nodeType === Node.ELEMENT_NODE && last.tagName === "BR";
          const next = last.nextSibling;
          const emptyText = next?.nodeType === Node.TEXT_NODE && (next.textContent ?? "") === "";
          if (isBreak && (!next || emptyText)) {
            const placeholder = next && emptyText ? next : document.createTextNode("\u200B");
            if (!next) last.parentNode?.insertBefore(placeholder, null);
            placeholder.textContent = "\u200B";
            range.setStart(placeholder, 0);
          } else {
            range.setStartAfter(last);
          }
        }
      }
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    handleInput();
    closePopover();
    return true;
  };
  const addToHistory = (prompt, mode) => {
    const currentHistory = mode === "shell" ? shellHistory : history;
    const setCurrentHistory = mode === "shell" ? setShellHistory : setHistory;
    const next = prependHistoryEntry(currentHistory.entries, prompt, mode === "shell" ? [] : historyComments());
    if (next === currentHistory.entries) return;
    setCurrentHistory("entries", next);
  };
  createEffect(on(() => props.edit?.id, id => {
    const edit = props.edit;
    if (!id || !edit) return;
    for (const item of prompt.context.items()) {
      prompt.context.remove(item.key);
    }
    for (const item of edit.context) {
      prompt.context.add({
        type: item.type,
        path: item.path,
        selection: item.selection,
        comment: item.comment,
        commentID: item.commentID,
        commentOrigin: item.commentOrigin,
        preview: item.preview
      });
    }
    setStore("mode", "normal");
    setStore("popover", null);
    setStore("historyIndex", -1);
    setStore("savedPrompt", null);
    prompt.set(edit.prompt, promptLength(edit.prompt));
    requestAnimationFrame(() => {
      editorRef.focus();
      setCursorPosition(editorRef, promptLength(edit.prompt));
      queueScroll();
    });
    props.onEditLoaded?.();
  }, {
    defer: true
  }));
  const navigateHistory = direction => {
    const result = navigatePromptHistory({
      direction,
      entries: store.mode === "shell" ? shellHistory.entries : history.entries,
      historyIndex: store.historyIndex,
      currentPrompt: prompt.current(),
      currentComments: historyComments(),
      savedPrompt: store.savedPrompt
    });
    if (!result.handled) return false;
    setStore("historyIndex", result.historyIndex);
    setStore("savedPrompt", result.savedPrompt);
    applyHistoryPrompt(result.entry, result.cursor);
    return true;
  };
  const {
    addAttachments,
    removeAttachment,
    handlePaste
  } = createPromptAttachments({
    editor: () => editorRef,
    isDialogActive: () => !!dialog.active,
    setDraggingType: type => setStore("draggingType", type),
    focusEditor: () => {
      editorRef.focus();
      setCursorPosition(editorRef, promptLength(prompt.current()));
    },
    addPart,
    readClipboardImage: platform.readClipboardImage
  });
  const variants = createMemo(() => ["default", ...local.model.variant.list()]);
  const composer = useComposerController({
    info,
    imageAttachments,
    commentCount,
    mode: () => store.mode,
    working,
    editor: () => editorRef,
    queueScroll,
    promptLength,
    addToHistory,
    resetHistoryNavigation: () => {
      resetHistoryNavigation(true);
    },
    setMode: mode => setStore("mode", mode),
    setPopover: popover => setStore("popover", popover),
    newSessionWorktree: () => props.newSessionWorktree,
    onNewSessionWorktreeReset: props.onNewSessionWorktreeReset,
    shouldQueue: props.shouldQueue,
    onQueue: props.onQueue,
    onAbort: props.onAbort,
    onSubmit: props.onSubmit
  });
  const abort = composer.abort;
  const handleSubmit = composer.submit;
  const handleKeyDown = event => {
    if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "u") {
      event.preventDefault();
      if (store.mode !== "normal") return;
      pick();
      return;
    }
    if (event.key === "Backspace") {
      const selection = window.getSelection();
      if (selection && selection.isCollapsed) {
        const node = selection.anchorNode;
        const offset = selection.anchorOffset;
        if (node && node.nodeType === Node.TEXT_NODE) {
          const text = node.textContent ?? "";
          if (/^\u200B+$/.test(text) && offset > 0) {
            const range = document.createRange();
            range.setStart(node, 0);
            range.collapse(true);
            selection.removeAllRanges();
            selection.addRange(range);
          }
        }
      }
    }
    if (event.key === "!" && store.mode === "normal") {
      const cursorPosition = getCursorPosition(editorRef);
      if (cursorPosition === 0) {
        setStore("mode", "shell");
        setStore("popover", null);
        event.preventDefault();
        return;
      }
    }
    if (event.key === "Escape") {
      if (store.popover) {
        closePopover();
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (store.mode === "shell") {
        setStore("mode", "normal");
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (working()) {
        void abort();
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (escBlur()) {
        editorRef.blur();
        event.preventDefault();
        event.stopPropagation();
        return;
      }
    }
    if (store.mode === "shell") {
      const {
        collapsed,
        cursorPosition,
        textLength
      } = getCaretState();
      if (event.key === "Backspace" && collapsed && cursorPosition === 0 && textLength === 0) {
        setStore("mode", "normal");
        event.preventDefault();
        return;
      }
    }

    // Handle Shift+Enter BEFORE IME check - Shift+Enter is never used for IME input
    // and should always insert a newline regardless of composition state
    if (event.key === "Enter" && event.shiftKey) {
      addPart({
        type: "text",
        content: "\n",
        start: 0,
        end: 0
      });
      event.preventDefault();
      return;
    }
    if (event.key === "Enter" && isImeComposing(event)) {
      return;
    }
    const ctrl = event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey;
    if (store.popover) {
      if (event.key === "Tab") {
        selectPopoverActive();
        event.preventDefault();
        return;
      }
      const nav = event.key === "ArrowUp" || event.key === "ArrowDown" || event.key === "Enter";
      const ctrlNav = ctrl && (event.key === "n" || event.key === "p");
      if (nav || ctrlNav) {
        if (store.popover === "at") {
          atOnKeyDown(event);
          event.preventDefault();
          return;
        }
        if (store.popover === "slash") {
          slashOnKeyDown(event);
        }
        event.preventDefault();
        return;
      }
    }
    if (ctrl && event.code === "KeyG") {
      if (store.popover) {
        closePopover();
        event.preventDefault();
        return;
      }
      if (working()) {
        void abort();
        event.preventDefault();
      }
      return;
    }
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const {
        collapsed
      } = getCaretState();
      if (!collapsed) return;
      const cursorPosition = getCursorPosition(editorRef);
      const textContent = prompt.current().map(part => "content" in part ? part.content : "").join("");
      const direction = event.key === "ArrowUp" ? "up" : "down";
      if (!canNavigateHistoryAtCursor(direction, textContent, cursorPosition, store.historyIndex >= 0)) return;
      if (navigateHistory(direction)) {
        event.preventDefault();
      }
      return;
    }

    // Note: Shift+Enter is handled earlier, before IME check
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (event.repeat) return;
      if (working() && prompt.current().map(part => "content" in part ? part.content : "").join("").trim().length === 0 && imageAttachments().length === 0 && commentCount() === 0) {
        return;
      }
      void handleSubmit(event);
    }
  };
  const agentsLoading = composer.agentsLoading;
  const agentsShouldFadeIn = composer.agentsShouldFadeIn;
  const providersLoading = composer.providersLoading;
  const providersShouldFadeIn = composer.providersShouldFadeIn;
  const promptReady = composer.promptReady;
  return (() => {
    var _el$6 = _tmpl$9();
    _$insert(_el$6, () => (promptReady(), null), null);
    _$insert(_el$6, _$createComponent(PromptPopover, {
      get popover() {
        return store.popover;
      },
      setSlashPopoverRef: el => slashPopoverRef = el,
      get atFlat() {
        return atFlat();
      },
      get atActive() {
        return atActive() ?? undefined;
      },
      atKey: atKey,
      setAtActive: setAtActive,
      onAtSelect: handleAtSelect,
      get slashFlat() {
        return slashFlat();
      },
      get slashActive() {
        return slashActive() ?? undefined;
      },
      setSlashActive: setSlashActive,
      onSlashSelect: handleSlashSelect,
      get commandKeybind() {
        return command.keybind;
      },
      t: key => language.t(key)
    }), null);
    _$insert(_el$6, _$createComponent(DockShellForm, {
      onSubmit: handleSubmit,
      get classList() {
        return {
          "group/prompt-input": true,
          "focus-within:shadow-xs-border": true,
          "border border-dashed": store.draggingType !== null,
          [props.class ?? ""]: !!props.class
        };
      },
      get children() {
        return [_$createComponent(PromptDragOverlay, {
          get type() {
            return store.draggingType;
          },
          get label() {
            return language.t(store.draggingType === "@mention" ? "prompt.dropzone.file.label" : "prompt.dropzone.label");
          }
        }), _$createComponent(PromptContextItems, {
          get items() {
            return contextItems();
          },
          active: item => {
            const active = comments.active();
            return !!item.commentID && item.commentID === active?.id && item.path === active?.file;
          },
          openComment: openComment,
          remove: item => {
            if (item.commentID) comments.remove(item.path, item.commentID);
            prompt.context.remove(item.key);
          },
          t: key => language.t(key)
        }), _$createComponent(PromptImageAttachments, {
          get attachments() {
            return imageAttachments();
          },
          onOpen: attachment => dialog.show(() => _$createComponent(ImagePreview, {
            get src() {
              return attachment.dataUrl;
            },
            get alt() {
              return attachment.filename;
            }
          })),
          onRemove: removeAttachment,
          get removeLabel() {
            return language.t("prompt.attachment.remove");
          }
        }), (() => {
          var _el$7 = _tmpl$3(),
            _el$8 = _el$7.firstChild,
            _el$9 = _el$8.firstChild,
            _el$0 = _el$9.nextSibling,
            _el$1 = _el$8.nextSibling,
            _el$10 = _el$1.nextSibling,
            _el$11 = _el$10.firstChild,
            _el$12 = _el$11.nextSibling,
            _el$13 = _el$10.nextSibling,
            _el$14 = _el$13.firstChild;
          _el$7.$$mousedown = e => {
            const target = e.target;
            if (!(target instanceof HTMLElement)) return;
            if (target.closest('[data-action="prompt-attach"], [data-action="prompt-submit"]')) {
              return;
            }
            editorRef?.focus();
          };
          _$use(el => scrollRef = el, _el$8);
          _el$9.$$keydown = handleKeyDown;
          _el$9.addEventListener("blur", handleBlur);
          _el$9.addEventListener("compositionend", handleCompositionEnd);
          _el$9.addEventListener("compositionstart", handleCompositionStart);
          _$addEventListener(_el$9, "paste", handlePaste);
          _el$9.$$input = handleInput;
          _$use(el => {
            editorRef = el;
            props.ref?.(el);
          }, _el$9);
          _$insert(_el$0, placeholder);
          _el$11.addEventListener("change", e => {
            const list = e.currentTarget.files;
            if (list) void addAttachments(Array.from(list));
            e.currentTarget.value = "";
          });
          var _ref$ = fileInputRef;
          typeof _ref$ === "function" ? _$use(_ref$, _el$11) : fileInputRef = _el$11;
          _$insert(_el$12, _$createComponent(Tooltip, {
            placement: "top",
            get inactive() {
              return _$memo(() => !!!working())() && blank();
            },
            get value() {
              return tip();
            },
            get children() {
              return _$createComponent(IconButton, {
                "data-action": "prompt-submit",
                type: "submit",
                get disabled() {
                  return _$memo(() => !!!working())() && blank();
                },
                get tabIndex() {
                  return store.mode === "normal" ? undefined : -1;
                },
                get icon() {
                  return _$memo(() => !!stopping())() ? "stop" : store.mode === "shell" ? "arrow-undo-down" : "arrow-up";
                },
                variant: "primary",
                "class": "size-8",
                get ["aria-label"]() {
                  return _$memo(() => !!stopping())() ? language.t("prompt.action.stop") : language.t("prompt.action.send");
                }
              });
            }
          }));
          _$insert(_el$14, _$createComponent(TooltipKeybind, {
            placement: "top",
            get title() {
              return language.t("prompt.action.attachFile");
            },
            get keybind() {
              return command.keybind("file.attach");
            },
            get children() {
              return _$createComponent(Button, {
                "data-action": "prompt-attach",
                type: "button",
                variant: "ghost",
                "class": "size-8 p-0",
                get style() {
                  return buttons();
                },
                onClick: pick,
                get disabled() {
                  return store.mode !== "normal";
                },
                get tabIndex() {
                  return store.mode === "normal" ? undefined : -1;
                },
                get ["aria-label"]() {
                  return language.t("prompt.action.attachFile");
                },
                get children() {
                  return _$createComponent(Icon, {
                    name: "plus",
                    "class": "size-4.5"
                  });
                }
              });
            }
          }));
          _$effect(_p$ => {
            var _v$ = placeholder(),
              _v$2 = store.mode === "normal" ? "sentences" : "off",
              _v$3 = store.mode === "normal" ? "on" : "off",
              _v$4 = store.mode === "normal",
              _v$5 = {
                "select-text": true,
                "w-full pl-3 pr-2 pt-2 fw-normal text-body-emphasis focus:outline-none whitespace-pre-wrap": true,
                "[&_[data-type=file]]:text-syntax-property": true,
                "[&_[data-type=agent]]:text-syntax-type": true,
                "font-mono!": store.mode === "shell"
              },
              _v$6 = !!(store.mode === "shell"),
              _v$7 = prompt.dirty() ? "none" : undefined,
              _v$8 = ACCEPTED_FILE_TYPES.join(","),
              _v$9 = store.mode !== "normal",
              _v$0 = buttonsSpring() > 0.5 ? "auto" : "none";
            _v$ !== _p$.e && _$setAttribute(_el$9, "aria-label", _p$.e = _v$);
            _v$2 !== _p$.t && _$setAttribute(_el$9, "autocapitalize", _p$.t = _v$2);
            _v$3 !== _p$.a && _$setAttribute(_el$9, "autocorrect", _p$.a = _v$3);
            _v$4 !== _p$.o && _$setAttribute(_el$9, "spellcheck", _p$.o = _v$4);
            _p$.i = _$classList(_el$9, _v$5, _p$.i);
            _v$6 !== _p$.n && _el$0.classList.toggle("font-mono!", _p$.n = _v$6);
            _v$7 !== _p$.s && _$setStyleProperty(_el$0, "display", _p$.s = _v$7);
            _v$8 !== _p$.h && _$setAttribute(_el$11, "accept", _p$.h = _v$8);
            _v$9 !== _p$.r && _$setAttribute(_el$14, "aria-hidden", _p$.r = _v$9);
            _v$0 !== _p$.d && _$setStyleProperty(_el$14, "pointer-events", _p$.d = _v$0);
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
            d: undefined
          });
          return _el$7;
        })()];
      }
    }), null);
    _$insert(_el$6, _$createComponent(Show, {
      get when() {
        return store.mode === "normal" || store.mode === "shell";
      },
      get children() {
        return _$createComponent(DockTray, {
          attach: "top",
          get children() {
            var _el$15 = _tmpl$8(),
              _el$16 = _el$15.firstChild,
              _el$17 = _el$16.firstChild,
              _el$18 = _el$17.firstChild,
              _el$19 = _el$18.nextSibling,
              _el$20 = _el$17.nextSibling;
            _$insert(_el$17, _$createComponent(Icon, {
              name: "console"
            }), _el$18);
            _$insert(_el$18, () => language.t("prompt.mode.shell"));
            _$insert(_el$17, _$createComponent(Button, {
              variant: "ghost",
              "class": "text-body",
              onClick: () => {
                setStore("mode", "normal");
              },
              get children() {
                return language.t("common.cancel");
              }
            }), null);
            _$insert(_el$20, _$createComponent(Show, {
              get when() {
                return !agentsLoading();
              },
              get children() {
                var _el$21 = _tmpl$4();
                _$insert(_el$21, _$createComponent(TooltipKeybind, {
                  placement: "top",
                  gutter: 4,
                  get title() {
                    return language.t("command.agent.cycle");
                  },
                  get keybind() {
                    return command.keybind("agent.cycle");
                  },
                  get children() {
                    return _$createComponent(Select, {
                      size: "normal",
                      get options() {
                        return agentNames();
                      },
                      get current() {
                        return local.agent.current()?.name ?? "";
                      },
                      onSelect: value => {
                        local.agent.set(value);
                        restoreFocus();
                      },
                      "class": "capitalize max-w-[160px] text-body",
                      valueClass: "truncate fw-normal text-body",
                      get triggerStyle() {
                        return control();
                      },
                      triggerProps: {
                        "data-action": "prompt-agent"
                      },
                      variant: "ghost"
                    });
                  }
                }));
                _$effect(_$p => _$style(_el$21, agentsShouldFadeIn() ? {
                  animation: "fade-in 0.3s"
                } : undefined, _$p));
                return _el$21;
              }
            }), null);
            _$insert(_el$20, _$createComponent(Show, {
              get when() {
                return !providersLoading();
              },
              get children() {
                return _$createComponent(Show, {
                  get when() {
                    return store.mode !== "shell";
                  },
                  get children() {
                    return [(() => {
                      var _el$22 = _tmpl$6();
                      _$insert(_el$22, _$createComponent(Show, {
                        get when() {
                          return providers.connected().length > 0;
                        },
                        get fallback() {
                          return _$createComponent(TooltipKeybind, {
                            placement: "top",
                            gutter: 4,
                            get title() {
                              return language.t("command.model.choose");
                            },
                            get keybind() {
                              return command.keybind("model.choose");
                            },
                            get children() {
                              return _$createComponent(Button, {
                                "data-action": "prompt-model",
                                as: "div",
                                variant: "ghost",
                                size: "normal",
                                "class": "min-w-0 max-w-[320px] fw-normal text-body group",
                                get style() {
                                  return control();
                                },
                                onClick: () => {
                                  void import("@/components/dialog-select-model-unpaid.js").then(x => {
                                    dialog.show(() => _$createComponent(x.DialogSelectModelUnpaid, {
                                      get model() {
                                        return local.model;
                                      }
                                    }));
                                  });
                                },
                                get children() {
                                  return [_$createComponent(Show, {
                                    get when() {
                                      return local.model.current()?.provider?.id;
                                    },
                                    get children() {
                                      return _$createComponent(ProviderIcon, {
                                        get id() {
                                          return local.model.current()?.provider?.id ?? "";
                                        },
                                        "class": "size-4 shrink-0 opacity-40 group-hover:opacity-100 transition-opacity duration-150",
                                        style: {
                                          "will-change": "opacity",
                                          transform: "translateZ(0)"
                                        }
                                      });
                                    }
                                  }), (() => {
                                    var _el$25 = _tmpl$5();
                                    _$insert(_el$25, () => local.model.current()?.name ?? language.t("dialog.model.select.title"));
                                    return _el$25;
                                  })(), _$createComponent(Icon, {
                                    name: "chevron-down",
                                    size: "small",
                                    "class": "shrink-0"
                                  })];
                                }
                              });
                            }
                          });
                        },
                        get children() {
                          return _$createComponent(TooltipKeybind, {
                            placement: "top",
                            gutter: 4,
                            get title() {
                              return language.t("command.model.choose");
                            },
                            get keybind() {
                              return command.keybind("model.choose");
                            },
                            get children() {
                              return _$createComponent(Select, {
                                get options() {
                                  const list = local.model.list().filter(m => local.model.visible({ modelID: m.id, providerID: m.provider.id }));
                                  return list;
                                },
                                get current() { return local.model.current?.(); },
                                label: opt => opt.name,
                                value: opt => `${opt.provider.id}/${opt.id}`,
                                onSelect: opt => {
                                  if (opt) {
                                    local.model.set({ modelID: opt.id, providerID: opt.provider.id }, { recent: true });
                                  }
                                  restoreFocus();
                                },
                                variant: "ghost",
                                size: "small",
                                style: control(),
                                class: "min-w-0 max-w-[320px] fw-normal text-body group"
                              });
                            }
                          });
                        }
                      }));
                      _$effect(_$p => _$style(_el$22, providersShouldFadeIn() ? {
                        animation: "fade-in 0.3s"
                      } : undefined, _$p));
                      return _el$22;
                    })(), _$createComponent(Show, {
                      get when() {
                        return variants().length > 2;
                      },
                      get children() {
                        var _el$24 = _tmpl$7();
                        _$insert(_el$24, _$createComponent(TooltipKeybind, {
                          placement: "top",
                          gutter: 4,
                          get title() {
                            return language.t("command.model.variant.cycle");
                          },
                          get keybind() {
                            return command.keybind("model.variant.cycle");
                          },
                          get children() {
                            return _$createComponent(Select, {
                              size: "normal",
                              get options() {
                                return variants();
                              },
                              get current() {
                                return local.model.variant.current() ?? "default";
                              },
                              label: x => x === "default" ? language.t("common.default") : x,
                              onSelect: value => {
                                local.model.variant.set(value === "default" ? undefined : value);
                                restoreFocus();
                              },
                              "class": "capitalize max-w-[160px] text-body",
                              valueClass: "truncate fw-normal text-body",
                              get triggerStyle() {
                                return control();
                              },
                              triggerProps: {
                                "data-action": "prompt-model-variant"
                              },
                              variant: "ghost"
                            });
                          }
                        }));
                        _$effect(_$p => _$style(_el$24, providersShouldFadeIn() ? {
                          animation: "fade-in 0.3s"
                        } : undefined, _$p));
                        return _el$24;
                      }
                    })];
                  }
                });
              }
            }), null);
            _$effect(_$p => _$style(_el$17, {
              ...shell()
            }, _$p));
            return _el$15;
          }
        });
      }
    }), null);
    return _el$6;
  })();
};
_$delegateEvents(["mousedown", "input", "keydown"]);