import { template as _$template } from "solid-js/web";
import { delegateEvents as _$delegateEvents } from "solid-js/web";
import { mergeProps as _$mergeProps } from "solid-js/web";
import { memo as _$memo } from "solid-js/web";
import { setAttribute as _$setAttribute } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
import { style as _$style } from "solid-js/web";
import { setStyleProperty as _$setStyleProperty } from "solid-js/web";
import { effect as _$effect } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { use as _$use } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<span data-component=shell-submessage><span data-slot=shell-submessage-width><span data-slot=basic-tool-tool-subtitle><span data-slot=shell-submessage-value>`),
  _tmpl$2 = /*#__PURE__*/_$template(`<div data-component=diagnostics>`),
  _tmpl$3 = /*#__PURE__*/_$template(`<div data-slot=diagnostic><span data-slot=diagnostic-label></span><span data-slot=diagnostic-location>[<!>:<!>]</span><span data-slot=diagnostic-message>`),
  _tmpl$4 = /*#__PURE__*/_$template(`<div data-component=exa-tool-output><div data-slot=exa-tool-links>`),
  _tmpl$5 = /*#__PURE__*/_$template(`<a data-slot=exa-tool-link target=_blank rel="noopener noreferrer">`),
  _tmpl$6 = /*#__PURE__*/_$template(`<div data-component=context-tool-group-trigger><span data-slot=context-tool-group-title class="min-w-0 d-flex align-items-center gap-2 fw-medium text-body-emphasis"><span data-slot=context-tool-group-label class=shrink-0></span><span data-slot=context-tool-group-summary class="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-normal text-body">`),
  _tmpl$7 = /*#__PURE__*/_$template(`<div data-component=context-tool-group-list>`),
  _tmpl$8 = /*#__PURE__*/_$template(`<span data-slot=basic-tool-tool-subtitle>`),
  _tmpl$9 = /*#__PURE__*/_$template(`<div data-slot=context-tool-group-item><div data-component=tool-trigger><div data-slot=basic-tool-tool-trigger-content><div data-slot=basic-tool-tool-info><div data-slot=basic-tool-tool-info-structured><div data-slot=basic-tool-tool-info-main><span data-slot=basic-tool-tool-title>`),
  _tmpl$0 = /*#__PURE__*/_$template(`<span data-slot=basic-tool-tool-arg>`),
  _tmpl$1 = /*#__PURE__*/_$template(`<div data-slot=user-message-attachments>`),
  _tmpl$10 = /*#__PURE__*/_$template(`<div data-slot=user-message-body><div data-slot=user-message-text>`),
  _tmpl$11 = /*#__PURE__*/_$template(`<span data-slot=user-message-meta class="small fw-normal text-secondary cursor-default">`),
  _tmpl$12 = /*#__PURE__*/_$template(`<span data-slot=user-message-meta-sep class="small fw-normal text-secondary cursor-default"> · `),
  _tmpl$13 = /*#__PURE__*/_$template(`<span data-slot=user-message-meta-tail class="small fw-normal text-secondary cursor-default">`),
  _tmpl$14 = /*#__PURE__*/_$template(`<span data-slot=user-message-meta-wrap>`),
  _tmpl$15 = /*#__PURE__*/_$template(`<div data-slot=user-message-copy-wrapper>`),
  _tmpl$16 = /*#__PURE__*/_$template(`<div data-component=user-message>`),
  _tmpl$17 = /*#__PURE__*/_$template(`<img data-slot=user-message-attachment-image>`),
  _tmpl$18 = /*#__PURE__*/_$template(`<div data-slot=user-message-attachment>`),
  _tmpl$19 = /*#__PURE__*/_$template(`<div data-slot=user-message-attachment-file><span data-slot=user-message-attachment-name>`),
  _tmpl$20 = /*#__PURE__*/_$template(`<span>`),
  _tmpl$21 = /*#__PURE__*/_$template(`<span data-slot=apply-patch-directory>`),
  _tmpl$22 = /*#__PURE__*/_$template(`<div data-slot=apply-patch-trigger-content><div data-slot=apply-patch-file-info><div data-slot=apply-patch-file-name-container><span data-slot=apply-patch-filename></span></div></div><div data-slot=apply-patch-trigger-actions>`),
  _tmpl$23 = /*#__PURE__*/_$template(`<div data-component=tool-part-wrapper>`),
  _tmpl$24 = /*#__PURE__*/_$template(`<div style=width:100%;display:flex;justify-content:flex-end><span class="fw-normal text-secondary cursor-default">`),
  _tmpl$25 = /*#__PURE__*/_$template(`<div data-component=compaction-part><div data-slot=compaction-part-divider><span data-slot=compaction-part-line></span><span data-slot=compaction-part-label class="small fw-normal text-secondary"></span><span data-slot=compaction-part-line>`),
  _tmpl$26 = /*#__PURE__*/_$template(`<span data-slot=text-part-meta class="small fw-normal text-secondary cursor-default">`),
  _tmpl$27 = /*#__PURE__*/_$template(`<div data-slot=text-part-copy-wrapper>`),
  _tmpl$28 = /*#__PURE__*/_$template(`<div data-component=text-part><div data-slot=text-part-body>`),
  _tmpl$29 = /*#__PURE__*/_$template(`<div data-component=reasoning-part>`),
  _tmpl$30 = /*#__PURE__*/_$template(`<div data-component=tool-loaded-file><span> `),
  _tmpl$31 = /*#__PURE__*/_$template(`<div data-component=tool-output data-scrollable>`),
  _tmpl$32 = /*#__PURE__*/_$template(`<a data-slot=basic-tool-tool-subtitle class="clickable subagent-link"target=_blank rel="noopener noreferrer">`),
  _tmpl$33 = /*#__PURE__*/_$template(`<div data-component=tool-action>`),
  _tmpl$34 = /*#__PURE__*/_$template(`<div data-slot=basic-tool-tool-info-structured><div data-slot=basic-tool-tool-info-main><span data-slot=basic-tool-tool-title>`),
  _tmpl$35 = /*#__PURE__*/_$template(`<span data-component=task-tool-spinner>`),
  _tmpl$36 = /*#__PURE__*/_$template(`<div data-component=task-tool-action>`),
  _tmpl$37 = /*#__PURE__*/_$template(`<div data-component=task-tool-card><div data-slot=basic-tool-tool-info-structured><div data-slot=basic-tool-tool-info-main><span data-component=task-tool-title>`),
  _tmpl$38 = /*#__PURE__*/_$template(`<div data-component=bash-output><div data-slot=bash-copy></div><div data-slot=bash-scroll data-scrollable><pre data-slot=bash-pre><code>`),
  _tmpl$39 = /*#__PURE__*/_$template(`<div data-component=edit-content>`),
  _tmpl$40 = /*#__PURE__*/_$template(`<div data-component=edit-tool>`),
  _tmpl$41 = /*#__PURE__*/_$template(`<span data-slot=message-part-title-filename>`),
  _tmpl$42 = /*#__PURE__*/_$template(`<div data-slot=message-part-path><span data-slot=message-part-directory>`),
  _tmpl$43 = /*#__PURE__*/_$template(`<div data-component=edit-trigger><div data-slot=message-part-title-area><div data-slot=message-part-title><span data-slot=message-part-title-text></span></div></div><div data-slot=message-part-actions>`),
  _tmpl$44 = /*#__PURE__*/_$template(`<div data-component=write-content>`),
  _tmpl$45 = /*#__PURE__*/_$template(`<div data-component=write-tool>`),
  _tmpl$46 = /*#__PURE__*/_$template(`<div data-component=write-trigger><div data-slot=message-part-title-area><div data-slot=message-part-title><span data-slot=message-part-title-text></span></div></div><div data-slot=message-part-actions>`),
  _tmpl$47 = /*#__PURE__*/_$template(`<div data-component=apply-patch-file-diff>`),
  _tmpl$48 = /*#__PURE__*/_$template(`<div data-component=apply-patch-tool>`),
  _tmpl$49 = /*#__PURE__*/_$template(`<span data-slot=apply-patch-change data-type=added>`),
  _tmpl$50 = /*#__PURE__*/_$template(`<span data-slot=apply-patch-change data-type=removed>`),
  _tmpl$51 = /*#__PURE__*/_$template(`<span data-slot=apply-patch-change data-type=modified>`),
  _tmpl$52 = /*#__PURE__*/_$template(`<div data-component=todos>`),
  _tmpl$53 = /*#__PURE__*/_$template(`<span data-slot=message-part-todo-content>`),
  _tmpl$54 = /*#__PURE__*/_$template(`<div data-component=question-answers>`),
  _tmpl$55 = /*#__PURE__*/_$template(`<div data-slot=question-answer-item><div data-slot=question-text></div><div data-slot=answer-text>`),
  _tmpl$56 = /*#__PURE__*/_$template(`<div data-slot=basic-tool-tool-info-structured><div data-slot=basic-tool-tool-info-main><span data-slot=basic-tool-tool-title class="capitalize agent-title">`);
import { createEffect, createMemo, createSignal, For, Match, onMount, Show, Switch, onCleanup, Index } from "solid-js";
import { createStore } from "solid-js/store";
import stripAnsi from "strip-ansi";
import { Dynamic } from "solid-js/web";
import { useData } from "../context/index.js";
import { useFileComponent } from "../context/file.js";
import { useDialog } from "../context/dialog.js";
import { useI18n } from "../context/i18n.js";
import { BasicTool, GenericTool } from "./basic-tool.js";
import { Accordion } from "./accordion.js";
import { StickyAccordionHeader } from "./sticky-accordion-header.js";
import { Collapsible } from "./collapsible.js";
import { FileIcon } from "./file-icon.js";
import { Icon } from "./icon.js";
import { ToolErrorCard } from "./tool-error-card.js";
import { Checkbox } from "./checkbox.js";
import { DiffChanges } from "./diff-changes.js";
import { Markdown } from "./markdown.js";
import { ImagePreview } from "./image-preview.js";
import { getDirectory as _getDirectory, getFilename } from "core/util/path";
import { checksum } from "core/util/encode";
import { Tooltip } from "./tooltip.js";
import { IconButton } from "./icon-button.js";
import { Spinner } from "./spinner.js";
import { TextShimmer } from "./text-shimmer.js";
import { AnimatedCountList } from "./tool-count-summary.js";
import { ToolStatusTitle } from "./tool-status-title.js";
import { patchFiles } from "./apply-patch-file.js";
import { animate } from "motion";
import { useLocation } from "@solidjs/router";
import { attached, inline, kind } from "./message-file.js";
function ShellSubmessage(props) {
  let widthRef;
  let valueRef;
  onMount(() => {
    if (!props.animate) return;
    requestAnimationFrame(() => {
      if (widthRef) {
        animate(widthRef, {
          width: "auto"
        }, {
          type: "spring",
          visualDuration: 0.25,
          bounce: 0
        });
      }
      if (valueRef) {
        animate(valueRef, {
          opacity: 1,
          filter: "blur(0px)"
        }, {
          duration: 0.32,
          ease: [0.16, 1, 0.3, 1]
        });
      }
    });
  });
  return (() => {
    var _el$ = _tmpl$(),
      _el$2 = _el$.firstChild,
      _el$3 = _el$2.firstChild,
      _el$4 = _el$3.firstChild;
    var _ref$ = widthRef;
    typeof _ref$ === "function" ? _$use(_ref$, _el$2) : widthRef = _el$2;
    var _ref$2 = valueRef;
    typeof _ref$2 === "function" ? _$use(_ref$2, _el$4) : valueRef = _el$4;
    _$insert(_el$4, () => props.text);
    _$effect(_p$ => {
      var _v$ = props.animate ? "0px" : undefined,
        _v$2 = props.animate ? {
          opacity: 0,
          filter: "blur(2px)"
        } : undefined;
      _v$ !== _p$.e && _$setStyleProperty(_el$2, "width", _p$.e = _v$);
      _p$.t = _$style(_el$4, _v$2, _p$.t);
      return _p$;
    }, {
      e: undefined,
      t: undefined
    });
    return _el$;
  })();
}
function getDiagnostics(diagnosticsByFile, filePath) {
  if (!diagnosticsByFile || !filePath) return [];
  const diagnostics = diagnosticsByFile[filePath] ?? [];
  return diagnostics.filter(d => d.severity === 1).slice(0, 3);
}
function DiagnosticsDisplay(props) {
  const i18n = useI18n();
  return _$createComponent(Show, {
    get when() {
      return props.diagnostics.length > 0;
    },
    get children() {
      var _el$5 = _tmpl$2();
      _$insert(_el$5, _$createComponent(For, {
        get each() {
          return props.diagnostics;
        },
        children: diagnostic => (() => {
          var _el$6 = _tmpl$3(),
            _el$7 = _el$6.firstChild,
            _el$8 = _el$7.nextSibling,
            _el$9 = _el$8.firstChild,
            _el$10 = _el$9.nextSibling,
            _el$0 = _el$10.nextSibling,
            _el$11 = _el$0.nextSibling,
            _el$1 = _el$11.nextSibling,
            _el$12 = _el$8.nextSibling;
          _$insert(_el$7, () => i18n.t("ui.messagePart.diagnostic.error"));
          _$insert(_el$8, () => diagnostic.range.start.line + 1, _el$10);
          _$insert(_el$8, () => diagnostic.range.start.character + 1, _el$11);
          _$insert(_el$12, () => diagnostic.message);
          return _el$6;
        })()
      }));
      return _el$5;
    }
  });
}
export const PART_MAPPING = {};
const TEXT_RENDER_PACE_MS = 24;
const TEXT_RENDER_SNAP = /[\s.,!?;:)\]]/;
function step(size) {
  if (size <= 12) return 2;
  if (size <= 48) return 4;
  if (size <= 96) return 8;
  return Math.min(24, Math.ceil(size / 8));
}
function next(text, start) {
  const end = Math.min(text.length, start + step(text.length - start));
  const max = Math.min(text.length, end + 8);
  for (let i = end; i < max; i++) {
    if (TEXT_RENDER_SNAP.test(text[i] ?? "")) return i + 1;
  }
  return end;
}
function createPacedValue(getValue, live) {
  const [value, setValue] = createSignal(getValue());
  let shown = getValue();
  let timeout;
  const clear = () => {
    if (!timeout) return;
    clearTimeout(timeout);
    timeout = undefined;
  };
  const sync = text => {
    shown = text;
    setValue(text);
  };
  const run = () => {
    timeout = undefined;
    const text = getValue();
    if (!live?.()) {
      sync(text);
      return;
    }
    if (!text.startsWith(shown) || text.length <= shown.length) {
      sync(text);
      return;
    }
    const end = next(text, shown.length);
    sync(text.slice(0, end));
    if (end < text.length) timeout = setTimeout(run, TEXT_RENDER_PACE_MS);
  };
  createEffect(() => {
    const text = getValue();
    if (!live?.()) {
      clear();
      sync(text);
      return;
    }
    if (!text.startsWith(shown) || text.length < shown.length) {
      clear();
      sync(text);
      return;
    }
    if (text.length === shown.length || timeout) return;
    timeout = setTimeout(run, TEXT_RENDER_PACE_MS);
  });
  onCleanup(() => {
    clear();
  });
  return value;
}
function PacedMarkdown(props) {
  const value = createPacedValue(() => props.text, () => props.streaming);
  return _$createComponent(Show, {
    get when() {
      return value();
    },
    get children() {
      return _$createComponent(Markdown, {
        get text() {
          return value();
        },
        get cacheKey() {
          return props.cacheKey;
        },
        get streaming() {
          return props.streaming;
        }
      });
    }
  });
}
function relativizeProjectPath(path, directory) {
  if (!path) return "";
  if (!directory) return path;
  if (directory === "/") return path;
  if (directory === "\\") return path;
  if (path === directory) return "";
  const separator = directory.includes("\\") ? "\\" : "/";
  const prefix = directory.endsWith(separator) ? directory : directory + separator;
  if (!path.startsWith(prefix)) return path;
  return path.slice(directory.length);
}
function getDirectory(path) {
  const data = useData();
  return relativizeProjectPath(_getDirectory(path), data.directory);
}
function agentTitle(i18n, type) {
  if (!type) return i18n.t("ui.tool.agent.default");
  return i18n.t("ui.tool.agent", {
    type
  });
}
const agentTones = {
  ask: "var(--icon-agent-ask-base)",
  build: "var(--icon-agent-build-base)",
  docs: "var(--icon-agent-docs-base)",
  plan: "var(--icon-agent-plan-base)"
};
const agentPalette = ["var(--icon-agent-ask-base)", "var(--icon-agent-build-base)", "var(--icon-agent-docs-base)", "var(--icon-agent-plan-base)", "var(--syntax-info)", "var(--syntax-success)", "var(--syntax-warning)", "var(--syntax-property)", "var(--syntax-constant)", "var(--text-diff-add-base)", "var(--text-diff-delete-base)", "var(--icon-warning-base)"];
function tone(name) {
  let hash = 0;
  for (const char of name) hash = hash * 31 + char.charCodeAt(0) >>> 0;
  return agentPalette[hash % agentPalette.length];
}
function taskAgent(raw, list) {
  if (typeof raw !== "string" || !raw) return {};
  const key = raw.toLowerCase();
  const item = list?.find(entry => entry.name === raw || entry.name.toLowerCase() === key);
  return {
    name: item?.name ?? `${raw[0].toUpperCase()}${raw.slice(1)}`,
    color: item?.color ?? agentTones[key] ?? tone(key)
  };
}
export function getToolInfo(tool, input = {}) {
  const i18n = useI18n();
  switch (tool) {
    case "read":
      return {
        icon: "glasses",
        title: i18n.t("ui.tool.read"),
        subtitle: input.filePath ? getFilename(input.filePath) : undefined
      };
    case "list":
      return {
        icon: "bullet-list",
        title: i18n.t("ui.tool.list"),
        subtitle: input.path ? getFilename(input.path) : undefined
      };
    case "glob":
      return {
        icon: "magnifying-glass-menu",
        title: i18n.t("ui.tool.glob"),
        subtitle: input.pattern
      };
    case "grep":
      return {
        icon: "magnifying-glass-menu",
        title: i18n.t("ui.tool.grep"),
        subtitle: input.pattern
      };
    case "webfetch":
      return {
        icon: "window-cursor",
        title: i18n.t("ui.tool.webfetch"),
        subtitle: input.url
      };
    case "websearch":
      return {
        icon: "window-cursor",
        title: i18n.t("ui.tool.websearch"),
        subtitle: input.query
      };
    case "task":
      {
        const type = typeof input.subagent_type === "string" && input.subagent_type ? input.subagent_type[0].toUpperCase() + input.subagent_type.slice(1) : undefined;
        return {
          icon: "task",
          title: agentTitle(i18n, type),
          subtitle: input.description
        };
      }
    case "bash":
      return {
        icon: "console",
        title: i18n.t("ui.tool.shell"),
        subtitle: input.description
      };
    case "edit":
      return {
        icon: "code-lines",
        title: i18n.t("ui.messagePart.title.edit"),
        subtitle: input.filePath ? getFilename(input.filePath) : undefined
      };
    case "write":
      return {
        icon: "code-lines",
        title: i18n.t("ui.messagePart.title.write"),
        subtitle: input.filePath ? getFilename(input.filePath) : undefined
      };
    case "apply_patch":
      return {
        icon: "code-lines",
        title: i18n.t("ui.tool.patch"),
        subtitle: input.files?.length ? `${input.files.length} ${i18n.t(input.files.length > 1 ? "ui.common.file.other" : "ui.common.file.one")}` : undefined
      };
    case "todowrite":
      return {
        icon: "checklist",
        title: i18n.t("ui.tool.todos")
      };
    case "question":
      return {
        icon: "bubble-5",
        title: i18n.t("ui.tool.questions")
      };
    case "skill":
      return {
        icon: "brain",
        title: input.name || i18n.t("ui.tool.skill")
      };
    default:
      return {
        icon: "mcp",
        title: tool
      };
  }
}
function urls(text) {
  if (!text) return [];
  const seen = new Set();
  return [...text.matchAll(/https?:\/\/[^\s<>"'`)\]]+/g)].map(item => item[0].replace(/[),.;:!?]+$/g, "")).filter(item => {
    if (seen.has(item)) return false;
    seen.add(item);
    return true;
  });
}
function sessionLink(id, path, href) {
  if (!id) return;
  const direct = href?.(id);
  if (direct) return direct;
  const idx = path.indexOf("/session");
  if (idx === -1) return;
  return `${path.slice(0, idx)}/session/${id}`;
}
function currentSession(path) {
  return path.match(/\/session\/([^/?#]+)/)?.[1];
}
function taskSession(input, path, sessions, agents) {
  const parentID = currentSession(path);
  if (!parentID) return;
  const description = typeof input.description === "string" ? input.description : "";
  const agent = taskAgent(input.subagent_type, agents).name;
  return (sessions ?? []).filter(session => session.parentID === parentID && !session.time?.archived).filter(session => description ? session.title.startsWith(description) : true).filter(session => agent ? session.title.includes(`@${agent}`) : true).sort((a, b) => (b.time.created ?? 0) - (a.time.created ?? 0))[0]?.id;
}
const CONTEXT_GROUP_TOOLS = new Set(["read", "glob", "grep", "list"]);
const HIDDEN_TOOLS = new Set(["todowrite"]);
function list(value, fallback) {
  if (Array.isArray(value)) return value;
  return fallback;
}
function same(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  return a.every((x, i) => x === b[i]);
}
function sameRef(a, b) {
  return a.messageID === b.messageID && a.partID === b.partID;
}
function sameGroup(a, b) {
  if (a === b) return true;
  if (a.key !== b.key) return false;
  if (a.type !== b.type) return false;
  if (a.type === "part") {
    if (b.type !== "part") return false;
    return sameRef(a.ref, b.ref);
  }
  if (b.type !== "context") return false;
  if (a.refs.length !== b.refs.length) return false;
  return a.refs.every((ref, i) => sameRef(ref, b.refs[i]));
}
function sameGroups(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  return a.every((item, i) => sameGroup(item, b[i]));
}
function groupParts(parts) {
  const result = [];
  let start = -1;
  const flush = end => {
    if (start < 0) return;
    const first = parts[start];
    const last = parts[end];
    if (!first || !last) {
      start = -1;
      return;
    }
    result.push({
      key: `context:${first.part.id}`,
      type: "context",
      refs: parts.slice(start, end + 1).map(item => ({
        messageID: item.messageID,
        partID: item.part.id
      }))
    });
    start = -1;
  };
  parts.forEach((item, index) => {
    if (isContextGroupTool(item.part)) {
      if (start < 0) start = index;
      return;
    }
    flush(index - 1);
    result.push({
      key: `part:${item.messageID}:${item.part.id}`,
      type: "part",
      ref: {
        messageID: item.messageID,
        partID: item.part.id
      }
    });
  });
  flush(parts.length - 1);
  return result;
}
function index(items) {
  return new Map(items.map(item => [item.id, item]));
}
function renderable(part, showReasoningSummaries = true) {
  if (part.type === "tool") {
    if (HIDDEN_TOOLS.has(part.tool)) return false;
    if (part.tool === "question") return part.state.status !== "pending" && part.state.status !== "running";
    return true;
  }
  if (part.type === "text") return !!part.text?.trim();
  if (part.type === "reasoning") return showReasoningSummaries && !!part.text?.trim();
  return !!PART_MAPPING[part.type];
}
function toolDefaultOpen(tool, shell = false, edit = false) {
  if (tool === "bash") return shell;
  if (tool === "edit" || tool === "write" || tool === "apply_patch") return edit;
}
function partDefaultOpen(part, shell = false, edit = false) {
  if (part.type !== "tool") return;
  return toolDefaultOpen(part.tool, shell, edit);
}
export function AssistantParts(props) {
  const data = useData();
  const emptyParts = [];
  const emptyTools = [];
  const msgs = createMemo(() => index(props.messages));
  const part = createMemo(() => new Map(props.messages.map(message => [message.id, index(list(data.store.part?.[message.id], emptyParts))])));
  const grouped = createMemo(() => groupParts(props.messages.flatMap(message => list(data.store.part?.[message.id], emptyParts).filter(part => renderable(part, props.showReasoningSummaries ?? true)).map(part => ({
    messageID: message.id,
    part
  })))), [], {
    equals: sameGroups
  });
  const last = createMemo(() => grouped().at(-1)?.key);
  return _$createComponent(Index, {
    get each() {
      return grouped();
    },
    children: entryAccessor => {
      const entryType = createMemo(() => entryAccessor().type);
      return [_$createComponent(Show, {
        get when() {
          return entryType() === "context";
        },
        get children() {
          return (() => {
            const parts = createMemo(() => {
              const entry = entryAccessor();
              if (entry.type !== "context") return emptyTools;
              return entry.refs.map(ref => part().get(ref.messageID)?.get(ref.partID)).filter(part => !!part && isContextGroupTool(part));
            }, emptyTools, {
              equals: same
            });
            const busy = createMemo(() => props.working && last() === entryAccessor().key);
            return _$createComponent(Show, {
              get when() {
                return parts().length > 0;
              },
              get children() {
                return _$createComponent(ContextToolGroup, {
                  get parts() {
                    return parts();
                  },
                  get busy() {
                    return busy();
                  }
                });
              }
            });
          })();
        }
      }), _$createComponent(Show, {
        get when() {
          return entryType() === "part";
        },
        get children() {
          return (() => {
            const message = createMemo(() => {
              const entry = entryAccessor();
              if (entry.type !== "part") return;
              return msgs().get(entry.ref.messageID);
            });
            const item = createMemo(() => {
              const entry = entryAccessor();
              if (entry.type !== "part") return;
              return part().get(entry.ref.messageID)?.get(entry.ref.partID);
            });
            return _$createComponent(Show, {
              get when() {
                return message();
              },
              get children() {
                return _$createComponent(Show, {
                  get when() {
                    return item();
                  },
                  get children() {
                    return _$createComponent(Part, {
                      get part() {
                        return item();
                      },
                      get message() {
                        return message();
                      },
                      get showAssistantCopyPartID() {
                        return props.showAssistantCopyPartID;
                      },
                      get turnDurationMs() {
                        return props.turnDurationMs;
                      },
                      get defaultOpen() {
                        return partDefaultOpen(item(), props.shellToolDefaultOpen, props.editToolDefaultOpen);
                      }
                    });
                  }
                });
              }
            });
          })();
        }
      })];
    }
  });
}
function isContextGroupTool(part) {
  return part.type === "tool" && CONTEXT_GROUP_TOOLS.has(part.tool);
}
function contextToolDetail(part) {
  const info = getToolInfo(part.tool, part.state.input ?? {});
  if (info.subtitle) return info.subtitle;
  if (part.state.status === "error") return part.state.error;
  if ((part.state.status === "running" || part.state.status === "completed") && part.state.title) return part.state.title;
  const description = part.state.input?.description;
  if (typeof description === "string") return description;
  return undefined;
}
function contextToolTrigger(part, i18n) {
  const input = part.state.input ?? {};
  const path = typeof input.path === "string" ? input.path : "/";
  const filePath = typeof input.filePath === "string" ? input.filePath : undefined;
  const pattern = typeof input.pattern === "string" ? input.pattern : undefined;
  const include = typeof input.include === "string" ? input.include : undefined;
  const offset = typeof input.offset === "number" ? input.offset : undefined;
  const limit = typeof input.limit === "number" ? input.limit : undefined;
  switch (part.tool) {
    case "read":
      {
        const args = [];
        if (offset !== undefined) args.push("offset=" + offset);
        if (limit !== undefined) args.push("limit=" + limit);
        return {
          title: i18n.t("ui.tool.read"),
          subtitle: filePath ? getFilename(filePath) : "",
          args
        };
      }
    case "list":
      return {
        title: i18n.t("ui.tool.list"),
        subtitle: getDirectory(path)
      };
    case "glob":
      return {
        title: i18n.t("ui.tool.glob"),
        subtitle: getDirectory(path),
        args: pattern ? ["pattern=" + pattern] : []
      };
    case "grep":
      {
        const args = [];
        if (pattern) args.push("pattern=" + pattern);
        if (include) args.push("include=" + include);
        return {
          title: i18n.t("ui.tool.grep"),
          subtitle: getDirectory(path),
          args
        };
      }
    default:
      {
        const info = getToolInfo(part.tool, input);
        return {
          title: info.title,
          subtitle: info.subtitle || contextToolDetail(part),
          args: []
        };
      }
  }
}
function contextToolSummary(parts) {
  const read = parts.filter(part => part.tool === "read").length;
  const search = parts.filter(part => part.tool === "glob" || part.tool === "grep").length;
  const list = parts.filter(part => part.tool === "list").length;
  return {
    read,
    search,
    list
  };
}
function ExaOutput(props) {
  const links = createMemo(() => urls(props.output));
  return _$createComponent(Show, {
    get when() {
      return links().length > 0;
    },
    get children() {
      var _el$13 = _tmpl$4(),
        _el$14 = _el$13.firstChild;
      _$insert(_el$14, _$createComponent(For, {
        get each() {
          return links();
        },
        children: url => (() => {
          var _el$15 = _tmpl$5();
          _el$15.$$click = event => event.stopPropagation();
          _$setAttribute(_el$15, "href", url);
          _$insert(_el$15, url);
          return _el$15;
        })()
      }));
      return _el$13;
    }
  });
}
export function registerPartComponent(type, component) {
  PART_MAPPING[type] = component;
}
export function Message(props) {
  return [_$createComponent(Show, {
    get when() {
      return props.message?.role === "user";
    },
    get children() {
      return _$createComponent(UserMessageDisplay, {
        get message() {
          return props.message;
        },
        get parts() {
          return props.parts;
        },
        get actions() {
          return props.actions;
        }
      });
    }
  }), _$createComponent(Show, {
    get when() {
      return props.message?.role === "assistant";
    },
    get children() {
      return _$createComponent(AssistantMessageDisplay, {
        get message() {
          return props.message;
        },
        get parts() {
          return props.parts;
        },
        get showAssistantCopyPartID() {
          return props.showAssistantCopyPartID;
        },
        get showReasoningSummaries() {
          return props.showReasoningSummaries;
        }
      });
    }
  })];
}
export function AssistantMessageDisplay(props) {
  const emptyTools = [];
  const part = createMemo(() => index(props.parts));
  const grouped = createMemo(() => groupParts(props.parts.filter(part => renderable(part, props.showReasoningSummaries ?? true)).map(part => ({
    messageID: props.message?.id,
    part
  }))), [], {
    equals: sameGroups
  });
  return _$createComponent(Index, {
    get each() {
      return grouped();
    },
    children: entryAccessor => {
      const entryType = createMemo(() => entryAccessor().type);
      return _$createComponent(Switch, {
        get children() {
          return [_$createComponent(Match, {
            get when() {
              return entryType() === "context";
            },
            get children() {
              return (() => {
                const parts = createMemo(() => {
                  const entry = entryAccessor();
                  if (entry.type !== "context") return emptyTools;
                  return entry.refs.map(ref => part().get(ref.partID)).filter(part => !!part && isContextGroupTool(part));
                }, emptyTools, {
                  equals: same
                });
                return _$createComponent(Show, {
                  get when() {
                    return parts().length > 0;
                  },
                  get children() {
                    return _$createComponent(ContextToolGroup, {
                      get parts() {
                        return parts();
                      }
                    });
                  }
                });
              })();
            }
          }), _$createComponent(Match, {
            get when() {
              return entryType() === "part";
            },
            get children() {
              return (() => {
                const item = createMemo(() => {
                  const entry = entryAccessor();
                  if (entry.type !== "part") return;
                  return part().get(entry.ref.partID);
                });
                return _$createComponent(Show, {
                  get when() {
                    return item();
                  },
                  get children() {
                    return _$createComponent(Part, {
                      get part() {
                        return item();
                      },
                      get message() {
                        return props.message;
                      },
                      get showAssistantCopyPartID() {
                        return props.showAssistantCopyPartID;
                      }
                    });
                  }
                });
              })();
            }
          })];
        }
      });
    }
  });
}
function ContextToolGroup(props) {
  const i18n = useI18n();
  const [open, setOpen] = createSignal(false);
  const pending = createMemo(() => !!props.busy || props.parts.some(part => part.state.status === "pending" || part.state.status === "running"));
  const summary = createMemo(() => contextToolSummary(props.parts));
  return _$createComponent(Collapsible, {
    get open() {
      return open();
    },
    onOpenChange: setOpen,
    variant: "ghost",
    "class": "tool-collapsible",
    get children() {
      return [_$createComponent(Collapsible.Trigger, {
        get children() {
          var _el$16 = _tmpl$6(),
            _el$17 = _el$16.firstChild,
            _el$18 = _el$17.firstChild,
            _el$19 = _el$18.nextSibling;
          _$insert(_el$18, _$createComponent(ToolStatusTitle, {
            get active() {
              return pending();
            },
            get activeText() {
              return i18n.t("ui.sessionTurn.status.gatheringContext");
            },
            get doneText() {
              return i18n.t("ui.sessionTurn.status.gatheredContext");
            },
            split: false
          }));
          _$insert(_el$19, _$createComponent(AnimatedCountList, {
            get items() {
              return [{
                key: "read",
                count: summary().read,
                one: i18n.t("ui.messagePart.context.read.one"),
                other: i18n.t("ui.messagePart.context.read.other")
              }, {
                key: "search",
                count: summary().search,
                one: i18n.t("ui.messagePart.context.search.one"),
                other: i18n.t("ui.messagePart.context.search.other")
              }, {
                key: "list",
                count: summary().list,
                one: i18n.t("ui.messagePart.context.list.one"),
                other: i18n.t("ui.messagePart.context.list.other")
              }];
            },
            fallback: ""
          }));
          _$insert(_el$16, _$createComponent(Collapsible.Arrow, {}), null);
          return _el$16;
        }
      }), _$createComponent(Collapsible.Content, {
        get children() {
          var _el$20 = _tmpl$7();
          _$insert(_el$20, _$createComponent(Index, {
            get each() {
              return props.parts;
            },
            children: partAccessor => {
              const trigger = createMemo(() => contextToolTrigger(partAccessor(), i18n));
              const running = createMemo(() => partAccessor().state.status === "pending" || partAccessor().state.status === "running");
              return (() => {
                var _el$21 = _tmpl$9(),
                  _el$22 = _el$21.firstChild,
                  _el$23 = _el$22.firstChild,
                  _el$24 = _el$23.firstChild,
                  _el$25 = _el$24.firstChild,
                  _el$26 = _el$25.firstChild,
                  _el$27 = _el$26.firstChild;
                _$insert(_el$27, _$createComponent(TextShimmer, {
                  get text() {
                    return trigger().title;
                  },
                  get active() {
                    return running();
                  }
                }));
                _$insert(_el$26, _$createComponent(Show, {
                  get when() {
                    return _$memo(() => !!!running())() && trigger().subtitle;
                  },
                  get children() {
                    var _el$28 = _tmpl$8();
                    _$insert(_el$28, () => trigger().subtitle);
                    return _el$28;
                  }
                }), null);
                _$insert(_el$26, _$createComponent(Show, {
                  get when() {
                    return _$memo(() => !!!running())() && trigger().args?.length;
                  },
                  get children() {
                    return _$createComponent(For, {
                      get each() {
                        return trigger().args;
                      },
                      children: arg => (() => {
                        var _el$29 = _tmpl$0();
                        _$insert(_el$29, arg);
                        return _el$29;
                      })()
                    });
                  }
                }), null);
                return _el$21;
              })();
            }
          }));
          return _el$20;
        }
      })];
    }
  });
}
export function UserMessageDisplay(props) {
  const data = useData();
  const dialog = useDialog();
  const i18n = useI18n();
  const [state, setState] = createStore({
    copied: false,
    busy: false
  });
  const copied = () => state.copied;
  const busy = () => state.busy;
  const textPart = createMemo(() => props.parts?.find(p => p.type === "text" && !p.synthetic));
  const text = createMemo(() => textPart()?.text || "");
  const files = createMemo(() => props.parts?.filter(p => p.type === "file") ?? []);
  const attachments = createMemo(() => files().filter(attached));
  const inlineFiles = createMemo(() => files().filter(inline));
  const agents = createMemo(() => props.parts?.filter(p => p.type === "agent") ?? []);
  const model = createMemo(() => {
    const providerID = props.message?.model?.providerID;
    const modelID = props.message?.model?.modelID;
    if (!providerID || !modelID) return "";
    const match = data.store.provider?.all?.find(p => p.id === providerID);
    return match?.models?.[modelID]?.name ?? modelID;
  });
  const timefmt = createMemo(() => new Intl.DateTimeFormat(i18n.locale(), {
    timeStyle: "short"
  }));
  const stamp = createMemo(() => {
    const created = props.message?.time?.created;
    if (typeof created !== "number") return "";
    return timefmt().format(created);
  });
  const metaHead = createMemo(() => {
    const agent = props.message?.agent;
    const items = [agent ? agent[0]?.toUpperCase() + agent.slice(1) : "", model()];
    return items.filter(x => !!x).join("\u00A0\u00B7\u00A0");
  });
  const metaTail = stamp;
  const openImagePreview = (url, alt) => {
    dialog.show(() => _$createComponent(ImagePreview, {
      src: url,
      alt: alt
    }));
  };
  const handleCopy = async () => {
    const content = text();
    if (!content) return;
    await navigator.clipboard.writeText(content);
    setState("copied", true);
    setTimeout(() => setState("copied", false), 2000);
  };
  const revert = () => {
    const act = props.actions?.revert;
    if (!act || busy()) return;
    setState("busy", true);
    void Promise.resolve().then(() => act({
      sessionID: props.message?.sessionID,
      messageID: props.message?.id
    })).finally(() => setState("busy", false));
  };
  return (() => {
    var _el$30 = _tmpl$16();
    _$insert(_el$30, _$createComponent(Show, {
      get when() {
        return attachments().length > 0;
      },
      get children() {
        var _el$31 = _tmpl$1();
        _$insert(_el$31, _$createComponent(For, {
          get each() {
            return attachments();
          },
          children: file => {
            const type = kind(file);
            const name = file.filename ?? i18n.t("ui.message.attachment.alt");
            return (() => {
              var _el$39 = _tmpl$18();
              _el$39.$$click = () => {
                if (type === "image") openImagePreview(file.url, name);
              };
              _$setAttribute(_el$39, "data-type", type);
              _$setAttribute(_el$39, "data-clickable", type === "image" ? "true" : undefined);
              _$setAttribute(_el$39, "title", type === "file" ? name : undefined);
              _$insert(_el$39, _$createComponent(Show, {
                when: type === "image",
                get fallback() {
                  return (() => {
                    var _el$41 = _tmpl$19(),
                      _el$42 = _el$41.firstChild;
                    _$insert(_el$41, _$createComponent(FileIcon, {
                      node: {
                        path: name,
                        type: "file"
                      }
                    }), _el$42);
                    _$insert(_el$42, name);
                    return _el$41;
                  })();
                },
                get children() {
                  var _el$40 = _tmpl$17();
                  _$setAttribute(_el$40, "alt", name);
                  _$effect(() => _$setAttribute(_el$40, "src", file.url));
                  return _el$40;
                }
              }));
              return _el$39;
            })();
          }
        }));
        return _el$31;
      }
    }), null);
    _$insert(_el$30, _$createComponent(Show, {
      get when() {
        return text();
      },
      get children() {
        return [(() => {
          var _el$32 = _tmpl$10(),
            _el$33 = _el$32.firstChild;
          _$insert(_el$33, _$createComponent(HighlightedText, {
            get text() {
              return text();
            },
            get references() {
              return inlineFiles();
            },
            get agents() {
              return agents();
            }
          }));
          return _el$32;
        })(), (() => {
          var _el$34 = _tmpl$15();
          _$insert(_el$34, _$createComponent(Show, {
            get when() {
              return metaHead() || metaTail();
            },
            get children() {
              var _el$35 = _tmpl$14();
              _$insert(_el$35, _$createComponent(Show, {
                get when() {
                  return metaHead();
                },
                get children() {
                  var _el$36 = _tmpl$11();
                  _$insert(_el$36, metaHead);
                  return _el$36;
                }
              }), null);
              _$insert(_el$35, _$createComponent(Show, {
                get when() {
                  return _$memo(() => !!metaHead())() && metaTail();
                },
                get children() {
                  return _tmpl$12();
                }
              }), null);
              _$insert(_el$35, _$createComponent(Show, {
                get when() {
                  return metaTail();
                },
                get children() {
                  var _el$38 = _tmpl$13();
                  _$insert(_el$38, metaTail);
                  return _el$38;
                }
              }), null);
              return _el$35;
            }
          }), null);
          _$insert(_el$34, _$createComponent(Show, {
            get when() {
              return props.actions?.revert;
            },
            get children() {
              return _$createComponent(Tooltip, {
                get value() {
                  return i18n.t("ui.message.revertMessage");
                },
                placement: "top",
                gutter: 4,
                get children() {
                  return _$createComponent(IconButton, {
                    icon: "reset",
                    size: "normal",
                    variant: "ghost",
                    get disabled() {
                      return !!busy();
                    },
                    onMouseDown: e => e.preventDefault(),
                    onClick: event => {
                      event.stopPropagation();
                      revert();
                    },
                    get ["aria-label"]() {
                      return i18n.t("ui.message.revertMessage");
                    }
                  });
                }
              });
            }
          }), null);
          _$insert(_el$34, _$createComponent(Tooltip, {
            get value() {
              return _$memo(() => !!copied())() ? i18n.t("ui.message.copied") : i18n.t("ui.message.copyMessage");
            },
            placement: "top",
            gutter: 4,
            get children() {
              return _$createComponent(IconButton, {
                get icon() {
                  return copied() ? "check" : "copy";
                },
                size: "normal",
                variant: "ghost",
                onMouseDown: e => e.preventDefault(),
                onClick: event => {
                  event.stopPropagation();
                  void handleCopy();
                },
                get ["aria-label"]() {
                  return _$memo(() => !!copied())() ? i18n.t("ui.message.copied") : i18n.t("ui.message.copyMessage");
                }
              });
            }
          }), null);
          return _el$34;
        })()];
      }
    }), null);
    return _el$30;
  })();
}
function HighlightedText(props) {
  const segments = createMemo(() => {
    const text = props.text ?? ""
    const refs = props.references ?? []
    const agents = props.agents ?? []
    const allRefs = [...refs.filter(r => r.source?.text?.start !== undefined && r.source?.text?.end !== undefined).map(r => ({
      start: r.source.text.start,
      end: r.source.text.end,
      type: "file"
    })), ...agents.filter(a => a.source?.start !== undefined && a.source?.end !== undefined).map(a => ({
      start: a.source.start,
      end: a.source.end,
      type: "agent"
    }))].sort((a, b) => a.start - b.start);
    const result = [];
    let lastIndex = 0;
    for (const ref of allRefs) {
      if (ref.start < lastIndex) continue;
      if (ref.start > lastIndex) {
        result.push({
          text: text.slice(lastIndex, ref.start)
        });
      }
      result.push({
        text: text.slice(ref.start, ref.end),
        type: ref.type
      });
      lastIndex = ref.end;
    }
    if (lastIndex < text.length) {
      result.push({
        text: text.slice(lastIndex)
      });
    }
    return result;
  });
  return _$createComponent(For, {
    get each() {
      return segments();
    },
    children: segment => (() => {
      var _el$43 = _tmpl$20();
      _$insert(_el$43, () => segment.text);
      _$effect(() => _$setAttribute(_el$43, "data-highlight", segment.type));
      return _el$43;
    })()
  });
}
export function Part(props) {
  const component = createMemo(() => PART_MAPPING[props.part.type]);
  return _$createComponent(Show, {
    get when() {
      return component();
    },
    get children() {
      return _$createComponent(Dynamic, {
        get component() {
          return component();
        },
        get part() {
          return props.part;
        },
        get message() {
          return props.message;
        },
        get hideDetails() {
          return props.hideDetails;
        },
        get defaultOpen() {
          return props.defaultOpen;
        },
        get showAssistantCopyPartID() {
          return props.showAssistantCopyPartID;
        },
        get turnDurationMs() {
          return props.turnDurationMs;
        }
      });
    }
  });
}
const state = {};
export function registerTool(input) {
  state[input.name] = input;
  return input;
}
export function getTool(name) {
  return state[name]?.render;
}
export const ToolRegistry = {
  register: registerTool,
  render: getTool
};
function ToolFileAccordion(props) {
  const value = createMemo(() => props.path || "tool-file");
  return _$createComponent(Accordion, {
    multiple: true,
    "data-scope": "apply-patch",
    style: {
      "--sticky-accordion-offset": "calc(32px + var(--tool-content-gap))"
    },
    get defaultValue() {
      return [value()];
    },
    get children() {
      return _$createComponent(Accordion.Item, {
        get value() {
          return value();
        },
        get children() {
          return [_$createComponent(StickyAccordionHeader, {
            get children() {
              return _$createComponent(Accordion.Trigger, {
                get children() {
                  var _el$44 = _tmpl$22(),
                    _el$45 = _el$44.firstChild,
                    _el$46 = _el$45.firstChild,
                    _el$48 = _el$46.firstChild,
                    _el$49 = _el$45.nextSibling;
                  _$insert(_el$45, _$createComponent(FileIcon, {
                    get node() {
                      return {
                        path: props.path,
                        type: "file"
                      };
                    }
                  }), _el$46);
                  _$insert(_el$46, _$createComponent(Show, {
                    get when() {
                      return props.path.includes("/");
                    },
                    get children() {
                      var _el$47 = _tmpl$21();
                      _$insert(_el$47, () => `\u202A${getDirectory(props.path)}\u202C`);
                      return _el$47;
                    }
                  }), _el$48);
                  _$insert(_el$48, () => getFilename(props.path));
                  _$insert(_el$49, () => props.actions, null);
                  _$insert(_el$49, _$createComponent(Icon, {
                    name: "chevron-grabber-vertical",
                    size: "small"
                  }), null);
                  return _el$44;
                }
              });
            }
          }), _$createComponent(Accordion.Content, {
            get children() {
              return props.children;
            }
          })];
        }
      });
    }
  });
}
PART_MAPPING["tool"] = function ToolPartDisplay(props) {
  const data = useData();
  const i18n = useI18n();
  const part = () => props.part;
  if (part().tool === "todowrite") return null;
  const hideQuestion = createMemo(() => part().tool === "question" && (part().state.status === "pending" || part().state.status === "running"));
  const emptyInput = {};
  const emptyMetadata = {};
  const input = () => part().state?.input ?? emptyInput;
  const partMetadata = () => part().state?.metadata ?? emptyMetadata;
  const taskId = createMemo(() => {
    if (part().tool !== "task") return;
    const value = partMetadata().sessionId;
    if (typeof value === "string" && value) return value;
  });
  const taskHref = createMemo(() => {
    if (part().tool !== "task") return;
    return sessionLink(taskId(), useLocation().pathname, data.sessionHref);
  });
  const taskSubtitle = createMemo(() => {
    if (part().tool !== "task") return undefined;
    const value = input().description;
    if (typeof value === "string" && value) return value;
    return taskId();
  });
  const render = createMemo(() => ToolRegistry.render(part().tool) ?? GenericTool);
  return _$createComponent(Show, {
    get when() {
      return !hideQuestion();
    },
    get children() {
      var _el$50 = _tmpl$23();
      _$insert(_el$50, _$createComponent(Switch, {
        get children() {
          return [_$createComponent(Match, {
            get when() {
              return _$memo(() => part().state.status === "error")() && part().state.error;
            },
            children: error => {
              const cleaned = error().replace("Error: ", "");
              if (part().tool === "question" && cleaned.includes("dismissed this question")) {
                return (() => {
                  var _el$51 = _tmpl$24(),
                    _el$52 = _el$51.firstChild;
                  _$insert(_el$52, () => i18n.t("ui.messagePart.questions.dismissed"));
                  return _el$51;
                })();
              }
              return _$createComponent(ToolErrorCard, {
                get tool() {
                  return part().tool;
                },
                get error() {
                  return error();
                },
                get defaultOpen() {
                  return props.defaultOpen;
                },
                get subtitle() {
                  return taskSubtitle();
                },
                get href() {
                  return taskHref();
                }
              });
            }
          }), _$createComponent(Match, {
            when: true,
            get children() {
              return _$createComponent(Dynamic, {
                get component() {
                  return render();
                },
                get input() {
                  return input();
                },
                get tool() {
                  return part().tool;
                },
                get metadata() {
                  return partMetadata();
                },
                get output() {
                  return part().state.output;
                },
                get status() {
                  return part().state.status;
                },
                get hideDetails() {
                  return props.hideDetails;
                },
                get defaultOpen() {
                  return props.defaultOpen;
                }
              });
            }
          })];
        }
      }));
      return _el$50;
    }
  });
};
export function MessageDivider(props) {
  return (() => {
    var _el$53 = _tmpl$25(),
      _el$54 = _el$53.firstChild,
      _el$55 = _el$54.firstChild,
      _el$56 = _el$55.nextSibling;
    _$insert(_el$56, () => props.label);
    return _el$53;
  })();
}
PART_MAPPING["compaction"] = function CompactionPartDisplay() {
  const i18n = useI18n();
  return _$createComponent(MessageDivider, {
    get label() {
      return i18n.t("ui.messagePart.compaction");
    }
  });
};
PART_MAPPING["text"] = function TextPartDisplay(props) {
  const data = useData();
  const i18n = useI18n();
  const numfmt = createMemo(() => new Intl.NumberFormat(i18n.locale()));
  const part = () => props.part;
  const interrupted = createMemo(() => props.message?.role === "assistant" && props.message?.error?.name === "MessageAbortedError");
  const model = createMemo(() => {
    if (props.message?.role !== "assistant") return "";
    const message = props.message;
    const match = data.store.provider?.all?.find(p => p.id === message.providerID);
    return match?.models?.[message.modelID]?.name ?? message.modelID;
  });
  const duration = createMemo(() => {
    if (props.message?.role !== "assistant") return "";
    const message = props.message;
    if (!message?.time) return "";
    const completed = message.time.completed;
    const ms = typeof props.turnDurationMs === "number" ? props.turnDurationMs : typeof completed === "number" ? completed - message.time.created : -1;
    if (!(ms >= 0)) return "";
    const total = Math.round(ms / 1000);
    if (total < 60) return i18n.t("ui.message.duration.seconds", {
      count: numfmt().format(total)
    });
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return i18n.t("ui.message.duration.minutesSeconds", {
      minutes: numfmt().format(minutes),
      seconds: numfmt().format(seconds)
    });
  });
  const meta = createMemo(() => {
    if (props.message?.role !== "assistant") return "";
    const agent = props.message?.agent;
    const items = [agent ? agent[0]?.toUpperCase() + agent.slice(1) : "", model(), duration(), interrupted() ? i18n.t("ui.message.interrupted") : ""];
    return items.filter(x => !!x).join(" \u00B7 ");
  });
  const streaming = createMemo(() => props.message?.role === "assistant" && typeof props.message?.time.completed !== "number");
  const text = () => (part().text ?? "").trim();
  const isLastTextPart = createMemo(() => {
    const last = (data.store.part?.[props.message?.id] ?? []).filter(item => item?.type === "text" && !!item.text?.trim()).at(-1);
    return last?.id === part().id;
  });
  const showCopy = createMemo(() => {
    if (props.message?.role !== "assistant") return isLastTextPart();
    if (props.showAssistantCopyPartID === null) return false;
    if (typeof props.showAssistantCopyPartID === "string") return props.showAssistantCopyPartID === part().id;
    return isLastTextPart();
  });
  const [copied, setCopied] = createSignal(false);
  const handleCopy = async () => {
    const content = text();
    if (!content) return;
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return _$createComponent(Show, {
    get when() {
      return text();
    },
    get children() {
      var _el$57 = _tmpl$28(),
        _el$58 = _el$57.firstChild;
      _$insert(_el$58, _$createComponent(Show, {
        get when() {
          return streaming();
        },
        get fallback() {
          return _$createComponent(Markdown, {
            get text() {
              return text();
            },
            get cacheKey() {
              return part().id;
            },
            streaming: false
          });
        },
        get children() {
          return _$createComponent(PacedMarkdown, {
            get text() {
              return text();
            },
            get cacheKey() {
              return part().id;
            },
            get streaming() {
              return streaming();
            }
          });
        }
      }));
      _$insert(_el$57, _$createComponent(Show, {
        get when() {
          return showCopy();
        },
        get children() {
          var _el$59 = _tmpl$27();
          _$insert(_el$59, _$createComponent(Tooltip, {
            get value() {
              return _$memo(() => !!copied())() ? i18n.t("ui.message.copied") : i18n.t("ui.message.copyResponse");
            },
            placement: "top",
            gutter: 4,
            get children() {
              return _$createComponent(IconButton, {
                get icon() {
                  return copied() ? "check" : "copy";
                },
                size: "normal",
                variant: "ghost",
                onMouseDown: e => e.preventDefault(),
                onClick: handleCopy,
                get ["aria-label"]() {
                  return _$memo(() => !!copied())() ? i18n.t("ui.message.copied") : i18n.t("ui.message.copyResponse");
                }
              });
            }
          }), null);
          _$insert(_el$59, _$createComponent(Show, {
            get when() {
              return meta();
            },
            get children() {
              var _el$60 = _tmpl$26();
              _$insert(_el$60, meta);
              return _el$60;
            }
          }), null);
          _$effect(() => _$setAttribute(_el$59, "data-interrupted", interrupted() ? "" : undefined));
          return _el$59;
        }
      }), null);
      return _el$57;
    }
  });
};
PART_MAPPING["reasoning"] = function ReasoningPartDisplay(props) {
  const part = () => props.part;
  const streaming = createMemo(() => props.message?.role === "assistant" && typeof props.message?.time.completed !== "number");
  const text = () => part().text.trim();
  return _$createComponent(Show, {
    get when() {
      return text();
    },
    get children() {
      var _el$61 = _tmpl$29();
      _$insert(_el$61, _$createComponent(Show, {
        get when() {
          return streaming();
        },
        get fallback() {
          return _$createComponent(Markdown, {
            get text() {
              return text();
            },
            get cacheKey() {
              return part().id;
            },
            streaming: false
          });
        },
        get children() {
          return _$createComponent(PacedMarkdown, {
            get text() {
              return text();
            },
            get cacheKey() {
              return part().id;
            },
            get streaming() {
              return streaming();
            }
          });
        }
      }));
      return _el$61;
    }
  });
};
ToolRegistry.register({
  name: "read",
  render(props) {
    const data = useData();
    const i18n = useI18n();
    const args = [];
    if (props.input.offset) args.push("offset=" + props.input.offset);
    if (props.input.limit) args.push("limit=" + props.input.limit);
    const loaded = createMemo(() => {
      if (props.status !== "completed") return [];
      const value = props.metadata.loaded;
      if (!value || !Array.isArray(value)) return [];
      return value.filter(p => typeof p === "string");
    });
    return [_$createComponent(BasicTool, _$mergeProps(props, {
      icon: "glasses",
      get trigger() {
        return {
          title: i18n.t("ui.tool.read"),
          subtitle: props.input.filePath ? getFilename(props.input.filePath) : "",
          args
        };
      }
    })), _$createComponent(For, {
      get each() {
        return loaded();
      },
      children: filepath => (() => {
        var _el$62 = _tmpl$30(),
          _el$63 = _el$62.firstChild,
          _el$64 = _el$63.firstChild;
        _$insert(_el$62, _$createComponent(Icon, {
          name: "enter",
          size: "small"
        }), _el$63);
        _$insert(_el$63, () => i18n.t("ui.tool.loaded"), _el$64);
        _$insert(_el$63, () => relativizeProjectPath(filepath, data.directory), null);
        return _el$62;
      })()
    })];
  }
});
ToolRegistry.register({
  name: "list",
  render(props) {
    const i18n = useI18n();
    return _$createComponent(BasicTool, _$mergeProps(props, {
      icon: "bullet-list",
      get trigger() {
        return {
          title: i18n.t("ui.tool.list"),
          subtitle: getDirectory(props.input.path || "/")
        };
      },
      get children() {
        return _$createComponent(Show, {
          get when() {
            return props.output;
          },
          get children() {
            var _el$65 = _tmpl$31();
            _$insert(_el$65, _$createComponent(Markdown, {
              get text() {
                return props.output;
              }
            }));
            return _el$65;
          }
        });
      }
    }));
  }
});
ToolRegistry.register({
  name: "glob",
  render(props) {
    const i18n = useI18n();
    return _$createComponent(BasicTool, _$mergeProps(props, {
      icon: "magnifying-glass-menu",
      get trigger() {
        return {
          title: i18n.t("ui.tool.glob"),
          subtitle: getDirectory(props.input.path || "/"),
          args: props.input.pattern ? ["pattern=" + props.input.pattern] : []
        };
      },
      get children() {
        return _$createComponent(Show, {
          get when() {
            return props.output;
          },
          get children() {
            var _el$66 = _tmpl$31();
            _$insert(_el$66, _$createComponent(Markdown, {
              get text() {
                return props.output;
              }
            }));
            return _el$66;
          }
        });
      }
    }));
  }
});
ToolRegistry.register({
  name: "grep",
  render(props) {
    const i18n = useI18n();
    const args = [];
    if (props.input.pattern) args.push("pattern=" + props.input.pattern);
    if (props.input.include) args.push("include=" + props.input.include);
    return _$createComponent(BasicTool, _$mergeProps(props, {
      icon: "magnifying-glass-menu",
      get trigger() {
        return {
          title: i18n.t("ui.tool.grep"),
          subtitle: getDirectory(props.input.path || "/"),
          args
        };
      },
      get children() {
        return _$createComponent(Show, {
          get when() {
            return props.output;
          },
          get children() {
            var _el$67 = _tmpl$31();
            _$insert(_el$67, _$createComponent(Markdown, {
              get text() {
                return props.output;
              }
            }));
            return _el$67;
          }
        });
      }
    }));
  }
});
ToolRegistry.register({
  name: "webfetch",
  render(props) {
    const i18n = useI18n();
    const pending = createMemo(() => props.status === "pending" || props.status === "running");
    const url = createMemo(() => {
      const value = props.input.url;
      if (typeof value !== "string") return "";
      return value;
    });
    return _$createComponent(BasicTool, _$mergeProps(props, {
      hideDetails: true,
      icon: "window-cursor",
      get trigger() {
        return (() => {
          var _el$68 = _tmpl$34(),
            _el$69 = _el$68.firstChild,
            _el$70 = _el$69.firstChild;
          _$insert(_el$70, _$createComponent(TextShimmer, {
            get text() {
              return i18n.t("ui.tool.webfetch");
            },
            get active() {
              return pending();
            }
          }));
          _$insert(_el$69, _$createComponent(Show, {
            get when() {
              return _$memo(() => !!!pending())() && url();
            },
            get children() {
              var _el$71 = _tmpl$32();
              _el$71.$$click = event => event.stopPropagation();
              _$insert(_el$71, url);
              _$effect(() => _$setAttribute(_el$71, "href", url()));
              return _el$71;
            }
          }), null);
          _$insert(_el$68, _$createComponent(Show, {
            get when() {
              return _$memo(() => !!!pending())() && url();
            },
            get children() {
              var _el$72 = _tmpl$33();
              _$insert(_el$72, _$createComponent(Icon, {
                name: "square-arrow-top-right",
                size: "small"
              }));
              return _el$72;
            }
          }), null);
          return _el$68;
        })();
      }
    }));
  }
});
ToolRegistry.register({
  name: "websearch",
  render(props) {
    const i18n = useI18n();
    const query = createMemo(() => {
      const value = props.input.query;
      if (typeof value !== "string") return "";
      return value;
    });
    return _$createComponent(BasicTool, _$mergeProps(props, {
      icon: "window-cursor",
      get trigger() {
        return {
          title: i18n.t("ui.tool.websearch"),
          subtitle: query(),
          subtitleClass: "exa-tool-query"
        };
      },
      get children() {
        return _$createComponent(ExaOutput, {
          get output() {
            return props.output;
          }
        });
      }
    }));
  }
});
ToolRegistry.register({
  name: "task",
  render(props) {
    const data = useData();
    const i18n = useI18n();
    const location = useLocation();
    const childSessionId = createMemo(() => {
      const value = props.metadata.sessionId;
      if (typeof value === "string" && value) return value;
      return taskSession(props.input, location.pathname, data.store.session, data.store.agent);
    });
    const agent = createMemo(() => taskAgent(props.input.subagent_type, data.store.agent));
    const title = createMemo(() => agent().name ?? i18n.t("ui.tool.agent.default"));
    const tone = createMemo(() => agent().color);
    const subtitle = createMemo(() => {
      const value = props.input.description;
      if (typeof value === "string" && value) return value;
      return childSessionId();
    });
    const running = createMemo(() => props.status === "pending" || props.status === "running");
    const href = createMemo(() => sessionLink(childSessionId(), location.pathname, data.sessionHref));
    const clickable = createMemo(() => !!(childSessionId() && (data.navigateToSession || href())));
    const open = () => {
      const id = childSessionId();
      if (!id) return;
      if (data.navigateToSession) {
        data.navigateToSession(id);
        return;
      }
      const value = href();
      if (value) window.location.assign(value);
    };
    const navigate = event => {
      if (!data.navigateToSession) return;
      if (event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      event.preventDefault();
      open();
    };
    const trigger = () => (() => {
      var _el$73 = _tmpl$37(),
        _el$74 = _el$73.firstChild,
        _el$75 = _el$74.firstChild,
        _el$77 = _el$75.firstChild;
      _$insert(_el$75, _$createComponent(Show, {
        get when() {
          return running();
        },
        get children() {
          var _el$76 = _tmpl$35();
          _$insert(_el$76, _$createComponent(Spinner, {}));
          _$effect(_$p => _$setStyleProperty(_el$76, "color", tone() ?? "var(--icon-interactive-base)"));
          return _el$76;
        }
      }), _el$77);
      _$insert(_el$77, title);
      _$insert(_el$75, _$createComponent(Show, {
        get when() {
          return subtitle();
        },
        get children() {
          var _el$78 = _tmpl$8();
          _$insert(_el$78, subtitle);
          return _el$78;
        }
      }), null);
      _$insert(_el$73, _$createComponent(Show, {
        get when() {
          return clickable();
        },
        get children() {
          var _el$79 = _tmpl$36();
          _$insert(_el$79, _$createComponent(Icon, {
            name: "square-arrow-top-right",
            size: "small"
          }));
          return _el$79;
        }
      }), null);
      _$effect(_$p => _$setStyleProperty(_el$77, "color", tone() ?? "var(--text-strong)"));
      return _el$73;
    })();
    return _$createComponent(BasicTool, {
      icon: "task",
      get status() {
        return props.status;
      },
      get trigger() {
        return trigger();
      },
      hideDetails: true,
      get triggerHref() {
        return href();
      },
      get clickable() {
        return clickable();
      },
      onTriggerClick: navigate
    });
  }
});
ToolRegistry.register({
  name: "bash",
  render(props) {
    const i18n = useI18n();
    const pending = () => props.status === "pending" || props.status === "running";
    const sawPending = pending();
    const text = createMemo(() => {
      const cmd = props.input.command ?? props.metadata.command ?? "";
      const out = stripAnsi(props.output || props.metadata.output || "");
      return `$ ${cmd}${out ? "\n\n" + out : ""}`;
    });
    const [copied, setCopied] = createSignal(false);
    const handleCopy = async () => {
      const content = text();
      if (!content) return;
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    };
    return _$createComponent(BasicTool, _$mergeProps(props, {
      icon: "console",
      get trigger() {
        return (() => {
          var _el$85 = _tmpl$34(),
            _el$86 = _el$85.firstChild,
            _el$87 = _el$86.firstChild;
          _$insert(_el$87, _$createComponent(TextShimmer, {
            get text() {
              return i18n.t("ui.tool.shell");
            },
            get active() {
              return pending();
            }
          }));
          _$insert(_el$86, _$createComponent(Show, {
            get when() {
              return _$memo(() => !!!pending())() && props.input.description;
            },
            get children() {
              return _$createComponent(ShellSubmessage, {
                get text() {
                  return props.input.description;
                },
                animate: sawPending
              });
            }
          }), null);
          return _el$85;
        })();
      },
      get children() {
        var _el$80 = _tmpl$38(),
          _el$81 = _el$80.firstChild,
          _el$82 = _el$81.nextSibling,
          _el$83 = _el$82.firstChild,
          _el$84 = _el$83.firstChild;
        _$insert(_el$81, _$createComponent(Tooltip, {
          get value() {
            return _$memo(() => !!copied())() ? i18n.t("ui.message.copied") : i18n.t("ui.message.copy");
          },
          placement: "top",
          gutter: 4,
          get children() {
            return _$createComponent(IconButton, {
              get icon() {
                return copied() ? "check" : "copy";
              },
              size: "small",
              variant: "secondary",
              onMouseDown: e => e.preventDefault(),
              onClick: handleCopy,
              get ["aria-label"]() {
                return _$memo(() => !!copied())() ? i18n.t("ui.message.copied") : i18n.t("ui.message.copy");
              }
            });
          }
        }));
        _$insert(_el$84, text);
        return _el$80;
      }
    }));
  }
});
ToolRegistry.register({
  name: "edit",
  render(props) {
    const i18n = useI18n();
    const fileComponent = useFileComponent();
    const diagnostics = createMemo(() => getDiagnostics(props.metadata.diagnostics, props.input.filePath));
    const path = createMemo(() => props.metadata?.filediff?.file || props.input.filePath || "");
    const filename = () => getFilename(props.input.filePath ?? "");
    const pending = () => props.status === "pending" || props.status === "running";
    return (() => {
      var _el$88 = _tmpl$40();
      _$insert(_el$88, _$createComponent(BasicTool, _$mergeProps(props, {
        icon: "code-lines",
        defer: true,
        get trigger() {
          return (() => {
            var _el$90 = _tmpl$43(),
              _el$91 = _el$90.firstChild,
              _el$92 = _el$91.firstChild,
              _el$93 = _el$92.firstChild,
              _el$97 = _el$91.nextSibling;
            _$insert(_el$93, _$createComponent(TextShimmer, {
              get text() {
                return i18n.t("ui.messagePart.title.edit");
              },
              get active() {
                return pending();
              }
            }));
            _$insert(_el$92, _$createComponent(Show, {
              get when() {
                return !pending();
              },
              get children() {
                var _el$94 = _tmpl$41();
                _$insert(_el$94, filename);
                return _el$94;
              }
            }), null);
            _$insert(_el$91, _$createComponent(Show, {
              get when() {
                return _$memo(() => !!!pending())() && props.input.filePath?.includes("/");
              },
              get children() {
                var _el$95 = _tmpl$42(),
                  _el$96 = _el$95.firstChild;
                _$insert(_el$96, () => getDirectory(props.input.filePath));
                return _el$95;
              }
            }), null);
            _$insert(_el$97, _$createComponent(Show, {
              get when() {
                return _$memo(() => !!!pending())() && props.metadata.filediff;
              },
              get children() {
                return _$createComponent(DiffChanges, {
                  get changes() {
                    return props.metadata.filediff;
                  }
                });
              }
            }));
            return _el$90;
          })();
        },
        get children() {
          return [_$createComponent(Show, {
            get when() {
              return path();
            },
            get children() {
              return _$createComponent(ToolFileAccordion, {
                get path() {
                  return path();
                },
                get actions() {
                  return _$createComponent(Show, {
                    get when() {
                      return _$memo(() => !!!pending())() && props.metadata.filediff;
                    },
                    get children() {
                      return _$createComponent(DiffChanges, {
                        get changes() {
                          return props.metadata.filediff;
                        }
                      });
                    }
                  });
                },
                get children() {
                  var _el$89 = _tmpl$39();
                  _$insert(_el$89, _$createComponent(Dynamic, {
                    component: fileComponent,
                    mode: "diff",
                    get before() {
                      return {
                        name: props.metadata?.filediff?.file || props.input.filePath,
                        contents: props.metadata?.filediff?.before || props.input.oldString
                      };
                    },
                    get after() {
                      return {
                        name: props.metadata?.filediff?.file || props.input.filePath,
                        contents: props.metadata?.filediff?.after || props.input.newString
                      };
                    }
                  }));
                  return _el$89;
                }
              });
            }
          }), _$createComponent(DiagnosticsDisplay, {
            get diagnostics() {
              return diagnostics();
            }
          })];
        }
      })));
      return _el$88;
    })();
  }
});
ToolRegistry.register({
  name: "write",
  render(props) {
    const i18n = useI18n();
    const fileComponent = useFileComponent();
    const diagnostics = createMemo(() => getDiagnostics(props.metadata.diagnostics, props.input.filePath));
    const path = createMemo(() => props.input.filePath || "");
    const filename = () => getFilename(props.input.filePath ?? "");
    const pending = () => props.status === "pending" || props.status === "running";
    return (() => {
      var _el$98 = _tmpl$45();
      _$insert(_el$98, _$createComponent(BasicTool, _$mergeProps(props, {
        icon: "code-lines",
        defer: true,
        get trigger() {
          return (() => {
            var _el$100 = _tmpl$46(),
              _el$101 = _el$100.firstChild,
              _el$102 = _el$101.firstChild,
              _el$103 = _el$102.firstChild;
            _$insert(_el$103, _$createComponent(TextShimmer, {
              get text() {
                return i18n.t("ui.messagePart.title.write");
              },
              get active() {
                return pending();
              }
            }));
            _$insert(_el$102, _$createComponent(Show, {
              get when() {
                return !pending();
              },
              get children() {
                var _el$104 = _tmpl$41();
                _$insert(_el$104, filename);
                return _el$104;
              }
            }), null);
            _$insert(_el$101, _$createComponent(Show, {
              get when() {
                return _$memo(() => !!!pending())() && props.input.filePath?.includes("/");
              },
              get children() {
                var _el$105 = _tmpl$42(),
                  _el$106 = _el$105.firstChild;
                _$insert(_el$106, () => getDirectory(props.input.filePath));
                return _el$105;
              }
            }), null);
            return _el$100;
          })();
        },
        get children() {
          return [_$createComponent(Show, {
            get when() {
              return _$memo(() => !!props.input.content)() && path();
            },
            get children() {
              return _$createComponent(ToolFileAccordion, {
                get path() {
                  return path();
                },
                get children() {
                  var _el$99 = _tmpl$44();
                  _$insert(_el$99, _$createComponent(Dynamic, {
                    component: fileComponent,
                    mode: "text",
                    get file() {
                      return {
                        name: props.input.filePath,
                        contents: props.input.content,
                        cacheKey: checksum(props.input.content)
                      };
                    },
                    overflow: "scroll"
                  }));
                  return _el$99;
                }
              });
            }
          }), _$createComponent(DiagnosticsDisplay, {
            get diagnostics() {
              return diagnostics();
            }
          })];
        }
      })));
      return _el$98;
    })();
  }
});
ToolRegistry.register({
  name: "apply_patch",
  render(props) {
    const i18n = useI18n();
    const fileComponent = useFileComponent();
    const files = createMemo(() => patchFiles(props.metadata.files));
    const pending = createMemo(() => props.status === "pending" || props.status === "running");
    const single = createMemo(() => {
      const list = files();
      if (list.length !== 1) return;
      return list[0];
    });
    const [expanded, setExpanded] = createSignal([]);
    let seeded = false;
    createEffect(() => {
      const list = files();
      if (list.length === 0) return;
      if (seeded) return;
      seeded = true;
      setExpanded(list.filter(f => f.type !== "delete").map(f => f.filePath));
    });
    const subtitle = createMemo(() => {
      const count = files().length;
      if (count === 0) return "";
      return `${count} ${i18n.t(count > 1 ? "ui.common.file.other" : "ui.common.file.one")}`;
    });
    return _$createComponent(Show, {
      get when() {
        return single();
      },
      get fallback() {
        return (() => {
          var _el$109 = _tmpl$48();
          _$insert(_el$109, _$createComponent(BasicTool, _$mergeProps(props, {
            icon: "code-lines",
            defer: true,
            get trigger() {
              return {
                title: i18n.t("ui.tool.patch"),
                subtitle: subtitle()
              };
            },
            get children() {
              return _$createComponent(Show, {
                get when() {
                  return files().length > 0;
                },
                get children() {
                  return _$createComponent(Accordion, {
                    multiple: true,
                    "data-scope": "apply-patch",
                    style: {
                      "--sticky-accordion-offset": "calc(32px + var(--tool-content-gap))"
                    },
                    get value() {
                      return expanded();
                    },
                    onChange: value => setExpanded(Array.isArray(value) ? value : value ? [value] : []),
                    get children() {
                      return _$createComponent(For, {
                        get each() {
                          return files();
                        },
                        children: file => {
                          const active = createMemo(() => expanded().includes(file.filePath));
                          const [visible, setVisible] = createSignal(false);
                          createEffect(() => {
                            if (!active()) {
                              setVisible(false);
                              return;
                            }
                            requestAnimationFrame(() => {
                              if (!active()) return;
                              setVisible(true);
                            });
                          });
                          return _$createComponent(Accordion.Item, {
                            get value() {
                              return file.filePath;
                            },
                            get ["data-type"]() {
                              return file.type;
                            },
                            get children() {
                              return [_$createComponent(StickyAccordionHeader, {
                                get children() {
                                  return _$createComponent(Accordion.Trigger, {
                                    get children() {
                                      var _el$110 = _tmpl$22(),
                                        _el$111 = _el$110.firstChild,
                                        _el$112 = _el$111.firstChild,
                                        _el$114 = _el$112.firstChild,
                                        _el$115 = _el$111.nextSibling;
                                      _$insert(_el$111, _$createComponent(FileIcon, {
                                        get node() {
                                          return {
                                            path: file.relativePath,
                                            type: "file"
                                          };
                                        }
                                      }), _el$112);
                                      _$insert(_el$112, _$createComponent(Show, {
                                        get when() {
                                          return file.relativePath.includes("/");
                                        },
                                        get children() {
                                          var _el$113 = _tmpl$21();
                                          _$insert(_el$113, () => `\u202A${getDirectory(file.relativePath)}\u202C`);
                                          return _el$113;
                                        }
                                      }), _el$114);
                                      _$insert(_el$114, () => getFilename(file.relativePath));
                                      _$insert(_el$115, _$createComponent(Switch, {
                                        get children() {
                                          return [_$createComponent(Match, {
                                            get when() {
                                              return file.type === "add";
                                            },
                                            get children() {
                                              var _el$116 = _tmpl$49();
                                              _$insert(_el$116, () => i18n.t("ui.patch.action.created"));
                                              return _el$116;
                                            }
                                          }), _$createComponent(Match, {
                                            get when() {
                                              return file.type === "delete";
                                            },
                                            get children() {
                                              var _el$117 = _tmpl$50();
                                              _$insert(_el$117, () => i18n.t("ui.patch.action.deleted"));
                                              return _el$117;
                                            }
                                          }), _$createComponent(Match, {
                                            get when() {
                                              return file.type === "move";
                                            },
                                            get children() {
                                              var _el$118 = _tmpl$51();
                                              _$insert(_el$118, () => i18n.t("ui.patch.action.moved"));
                                              return _el$118;
                                            }
                                          }), _$createComponent(Match, {
                                            when: true,
                                            get children() {
                                              return _$createComponent(DiffChanges, {
                                                get changes() {
                                                  return {
                                                    additions: file.additions,
                                                    deletions: file.deletions
                                                  };
                                                }
                                              });
                                            }
                                          })];
                                        }
                                      }), null);
                                      _$insert(_el$115, _$createComponent(Icon, {
                                        name: "chevron-grabber-vertical",
                                        size: "small"
                                      }), null);
                                      return _el$110;
                                    }
                                  });
                                }
                              }), _$createComponent(Accordion.Content, {
                                get children() {
                                  return _$createComponent(Show, {
                                    get when() {
                                      return visible();
                                    },
                                    get children() {
                                      var _el$119 = _tmpl$47();
                                      _$insert(_el$119, _$createComponent(Dynamic, {
                                        component: fileComponent,
                                        mode: "diff",
                                        get fileDiff() {
                                          return file.view.fileDiff;
                                        }
                                      }));
                                      return _el$119;
                                    }
                                  });
                                }
                              })];
                            }
                          });
                        }
                      });
                    }
                  });
                }
              });
            }
          })));
          return _el$109;
        })();
      },
      get children() {
        var _el$107 = _tmpl$48();
        _$insert(_el$107, _$createComponent(BasicTool, _$mergeProps(props, {
          icon: "code-lines",
          defer: true,
          get trigger() {
            return (() => {
              var _el$120 = _tmpl$43(),
                _el$121 = _el$120.firstChild,
                _el$122 = _el$121.firstChild,
                _el$123 = _el$122.firstChild,
                _el$127 = _el$121.nextSibling;
              _$insert(_el$123, _$createComponent(TextShimmer, {
                get text() {
                  return i18n.t("ui.tool.patch");
                },
                get active() {
                  return pending();
                }
              }));
              _$insert(_el$122, _$createComponent(Show, {
                get when() {
                  return !pending();
                },
                get children() {
                  var _el$124 = _tmpl$41();
                  _$insert(_el$124, () => getFilename(single().relativePath));
                  return _el$124;
                }
              }), null);
              _$insert(_el$121, _$createComponent(Show, {
                get when() {
                  return _$memo(() => !!!pending())() && single().relativePath.includes("/");
                },
                get children() {
                  var _el$125 = _tmpl$42(),
                    _el$126 = _el$125.firstChild;
                  _$insert(_el$126, () => getDirectory(single().relativePath));
                  return _el$125;
                }
              }), null);
              _$insert(_el$127, _$createComponent(Show, {
                get when() {
                  return !pending();
                },
                get children() {
                  return _$createComponent(DiffChanges, {
                    get changes() {
                      return {
                        additions: single().additions,
                        deletions: single().deletions
                      };
                    }
                  });
                }
              }));
              return _el$120;
            })();
          },
          get children() {
            return _$createComponent(ToolFileAccordion, {
              get path() {
                return single().relativePath;
              },
              get actions() {
                return _$createComponent(Switch, {
                  get children() {
                    return [_$createComponent(Match, {
                      get when() {
                        return single().type === "add";
                      },
                      get children() {
                        var _el$128 = _tmpl$49();
                        _$insert(_el$128, () => i18n.t("ui.patch.action.created"));
                        return _el$128;
                      }
                    }), _$createComponent(Match, {
                      get when() {
                        return single().type === "delete";
                      },
                      get children() {
                        var _el$129 = _tmpl$50();
                        _$insert(_el$129, () => i18n.t("ui.patch.action.deleted"));
                        return _el$129;
                      }
                    }), _$createComponent(Match, {
                      get when() {
                        return single().type === "move";
                      },
                      get children() {
                        var _el$130 = _tmpl$51();
                        _$insert(_el$130, () => i18n.t("ui.patch.action.moved"));
                        return _el$130;
                      }
                    }), _$createComponent(Match, {
                      when: true,
                      get children() {
                        return _$createComponent(DiffChanges, {
                          get changes() {
                            return {
                              additions: single().additions,
                              deletions: single().deletions
                            };
                          }
                        });
                      }
                    })];
                  }
                });
              },
              get children() {
                var _el$108 = _tmpl$47();
                _$insert(_el$108, _$createComponent(Dynamic, {
                  component: fileComponent,
                  mode: "diff",
                  get fileDiff() {
                    return single().view.fileDiff;
                  }
                }));
                return _el$108;
              }
            });
          }
        })));
        return _el$107;
      }
    });
  }
});
ToolRegistry.register({
  name: "todowrite",
  render(props) {
    const i18n = useI18n();
    const todos = createMemo(() => {
      const meta = props.metadata?.todos;
      if (Array.isArray(meta)) return meta;
      const input = props.input.todos;
      if (Array.isArray(input)) return input;
      return [];
    });
    const subtitle = createMemo(() => {
      const list = todos();
      if (list.length === 0) return "";
      return `${list.filter(t => t.status === "completed").length}/${list.length}`;
    });
    return _$createComponent(BasicTool, _$mergeProps(props, {
      defaultOpen: true,
      icon: "checklist",
      get trigger() {
        return {
          title: i18n.t("ui.tool.todos"),
          subtitle: subtitle()
        };
      },
      get children() {
        return _$createComponent(Show, {
          get when() {
            return todos().length;
          },
          get children() {
            var _el$131 = _tmpl$52();
            _$insert(_el$131, _$createComponent(For, {
              get each() {
                return todos();
              },
              children: todo => _$createComponent(Checkbox, {
                readOnly: true,
                get checked() {
                  return todo.status === "completed";
                },
                get children() {
                  var _el$132 = _tmpl$53();
                  _$insert(_el$132, () => todo.content);
                  _$effect(() => _$setAttribute(_el$132, "data-completed", todo.status === "completed" ? "completed" : undefined));
                  return _el$132;
                }
              })
            }));
            return _el$131;
          }
        });
      }
    }));
  }
});
ToolRegistry.register({
  name: "question",
  render(props) {
    const i18n = useI18n();
    const questions = createMemo(() => props.input.questions ?? []);
    const answers = createMemo(() => props.metadata.answers ?? []);
    const completed = createMemo(() => answers().length > 0);
    const subtitle = createMemo(() => {
      const count = questions().length;
      if (count === 0) return "";
      if (completed()) return i18n.t("ui.question.subtitle.answered", {
        count
      });
      return `${count} ${i18n.t(count > 1 ? "ui.common.question.other" : "ui.common.question.one")}`;
    });
    return _$createComponent(BasicTool, _$mergeProps(props, {
      get defaultOpen() {
        return completed();
      },
      icon: "bubble-5",
      get trigger() {
        return {
          title: i18n.t("ui.tool.questions"),
          subtitle: subtitle()
        };
      },
      get children() {
        return _$createComponent(Show, {
          get when() {
            return completed();
          },
          get children() {
            var _el$133 = _tmpl$54();
            _$insert(_el$133, _$createComponent(For, {
              get each() {
                return questions();
              },
              children: (q, i) => {
                const answer = () => answers()[i()] ?? [];
                return (() => {
                  var _el$134 = _tmpl$55(),
                    _el$135 = _el$134.firstChild,
                    _el$136 = _el$135.nextSibling;
                  _$insert(_el$135, () => q.question);
                  _$insert(_el$136, () => answer().join(", ") || i18n.t("ui.question.answer.none"));
                  return _el$134;
                })();
              }
            }));
            return _el$133;
          }
        });
      }
    }));
  }
});
ToolRegistry.register({
  name: "skill",
  render(props) {
    const i18n = useI18n();
    const title = createMemo(() => props.input.name || i18n.t("ui.tool.skill"));
    const running = createMemo(() => props.status === "pending" || props.status === "running");
    const titleContent = () => _$createComponent(TextShimmer, {
      get text() {
        return title();
      },
      get active() {
        return running();
      }
    });
    const trigger = () => (() => {
      var _el$137 = _tmpl$56(),
        _el$138 = _el$137.firstChild,
        _el$139 = _el$138.firstChild;
      _$insert(_el$139, titleContent);
      return _el$137;
    })();
    return _$createComponent(BasicTool, {
      icon: "brain",
      get status() {
        return props.status;
      },
      get trigger() {
        return trigger();
      },
      hideDetails: true
    });
  }
});
_$delegateEvents(["click"]);
