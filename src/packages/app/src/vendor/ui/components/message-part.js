// Dynamic is a runtime component, not a compiled template helper (it is only
// exported from solid-js/web). insert() is the established exception for
// reactive/component-valued children (Kobalte presence-gated Collapsible and
// Accordion content, Dynamic and memo-accessor returns) so Solid keeps
// reconciling accessors instead of freezing them.
import { Dynamic, insert as _solidInsert } from "solid-js/web";
import { createComponent, createEffect, createMemo, createRenderEffect, createSignal, For, Match, mergeProps, onMount, Show, Switch, onCleanup, Index } from "solid-js";
import { createStore } from "solid-js/store";
import stripAnsi from "strip-ansi";
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
import { useLocation } from "@/lib/router/index.js";
import { attached, inline, kind } from "./message-file.js";

// Build a detached element from compact HTML (no inter-element whitespace,
// matching the compiled Solid templates). Static markup only — translated or
// user-provided strings are always assigned via textContent/text nodes.
function template(html) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;
  return wrapper.firstElementChild;
}

// Mirror solid-js/web setAttribute semantics: nullish removes the attribute.
function setAttr(el, name, value) {
  if (value == null) el.removeAttribute(name);
  else el.setAttribute(name, value);
}

// Mirror solid-js/web style(): diff an object/string style value against the
// previous one, removing dropped keys and applying changed ones.
function applyStyle(el, value, prev) {
  if (!value) {
    if (prev) el.removeAttribute("style");
    return value;
  }
  const nodeStyle = el.style;
  if (typeof value === "string") {
    nodeStyle.cssText = value;
    return value;
  }
  if (typeof prev === "string") {
    nodeStyle.cssText = "";
    prev = undefined;
  }
  prev = prev || {};
  for (const key in prev) {
    if (value[key] == null) nodeStyle.removeProperty(key);
    delete prev[key];
  }
  for (const key in value) {
    const next = value[key];
    if (next !== prev[key]) {
      nodeStyle.setProperty(key, next);
      prev[key] = next;
    }
  }
  return prev;
}
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
  const root = template(`<span data-component="shell-submessage"><span data-slot="shell-submessage-width"><span data-slot="basic-tool-tool-subtitle"><span data-slot="shell-submessage-value"></span></span></span></span>`);
  const widthEl = root.firstChild;
  const subtitleEl = widthEl.firstChild;
  const valueEl = subtitleEl.firstChild;
  // Ref bindings, mirroring the compiled use() branches (the locals are only
  // ever undefined or an element here).
  const refWidth = widthRef;
  if (typeof refWidth === "function") refWidth(widthEl);
  else widthRef = widthEl;
  const refValue = valueRef;
  if (typeof refValue === "function") refValue(valueEl);
  else valueRef = valueEl;
  createRenderEffect(() => {
    valueEl.textContent = props.text ?? "";
  });
  // Change-guarded width + diffed style object, mirroring the compiled effect
  // block. The motion animations above overwrite these inline styles later,
  // and this effect only re-runs if props.animate actually changes.
  let prevWidth;
  let prevValueStyle;
  createRenderEffect(() => {
    const width = props.animate ? "0px" : undefined;
    const valueStyle = props.animate ? {
      opacity: 0,
      filter: "blur(2px)"
    } : undefined;
    if (width !== prevWidth) {
      prevWidth = width;
      if (width == null) widthEl.style.removeProperty("width");
      else widthEl.style.setProperty("width", width);
    }
    prevValueStyle = applyStyle(valueEl, valueStyle, prevValueStyle);
  });
  return root;
}
function getDiagnostics(diagnosticsByFile, filePath) {
  if (!diagnosticsByFile || !filePath) return [];
  const diagnostics = diagnosticsByFile[filePath] ?? [];
  return diagnostics.filter(d => d.severity === 1).slice(0, 3);
}
function DiagnosticsDisplay(props) {
  const i18n = useI18n();
  return createComponent(Show, {
    get when() {
      return props.diagnostics.length > 0;
    },
    get children() {
      const root = template(`<div data-component="diagnostics"></div>`);
      _solidInsert(root, createComponent(For, {
        get each() {
          return props.diagnostics;
        },
        children: diagnostic => {
          const row = template(`<div data-slot="diagnostic"><span data-slot="diagnostic-label"></span><span data-slot="diagnostic-location"></span><span data-slot="diagnostic-message"></span></div>`);
          const label = row.firstChild;
          const location = label.nextSibling;
          const message = location.nextSibling;
          // "[line:character]" as live text nodes around the static brackets,
          // matching the compiled inserts between the comment markers.
          const lineText = document.createTextNode("");
          const charText = document.createTextNode("");
          location.replaceChildren("[", lineText, ":", charText, "]");
          createRenderEffect(() => {
            label.textContent = i18n.t("ui.messagePart.diagnostic.error");
          });
          createRenderEffect(() => {
            lineText.data = String(diagnostic.range.start.line + 1);
          });
          createRenderEffect(() => {
            charText.data = String(diagnostic.range.start.character + 1);
          });
          createRenderEffect(() => {
            message.textContent = diagnostic.message ?? "";
          });
          return row;
        }
      }));
      return root;
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
  return createComponent(Show, {
    get when() {
      return value();
    },
    get children() {
      return createComponent(Markdown, {
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
  return createComponent(Index, {
    get each() {
      return grouped();
    },
    children: entryAccessor => {
      const entryType = createMemo(() => entryAccessor().type);
      return [createComponent(Show, {
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
            return createComponent(Show, {
              get when() {
                return parts().length > 0;
              },
              get children() {
                return createComponent(ContextToolGroup, {
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
      }), createComponent(Show, {
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
            return createComponent(Show, {
              get when() {
                return message();
              },
              get children() {
                return createComponent(Show, {
                  get when() {
                    return item();
                  },
                  get children() {
                    return createComponent(Part, {
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
  return createComponent(Show, {
    get when() {
      return links().length > 0;
    },
    get children() {
      const root = template(`<div data-component="exa-tool-output"><div data-slot="exa-tool-links"></div></div>`);
      const linksEl = root.firstChild;
      _solidInsert(linksEl, createComponent(For, {
        get each() {
          return links();
        },
        children: url => {
          // url is a plain string row value (For is reference-keyed), so the
          // href/text writes are one-shot like the compiled thunks.
          const link = template(`<a data-slot="exa-tool-link" target="_blank" rel="noopener noreferrer"></a>`);
          link.addEventListener("click", event => event.stopPropagation());
          link.setAttribute("href", url);
          link.textContent = url;
          return link;
        }
      }));
      return root;
    }
  });
}
export function registerPartComponent(type, component) {
  PART_MAPPING[type] = component;
}
export function Message(props) {
  return [createComponent(Show, {
    get when() {
      return props.message?.role === "user";
    },
    get children() {
      return createComponent(UserMessageDisplay, {
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
  }), createComponent(Show, {
    get when() {
      return props.message?.role === "assistant";
    },
    get children() {
      return createComponent(AssistantMessageDisplay, {
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
  return createComponent(Index, {
    get each() {
      return grouped();
    },
    children: entryAccessor => {
      const entryType = createMemo(() => entryAccessor().type);
      return createComponent(Switch, {
        get children() {
          return [createComponent(Match, {
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
                return createComponent(Show, {
                  get when() {
                    return parts().length > 0;
                  },
                  get children() {
                    return createComponent(ContextToolGroup, {
                      get parts() {
                        return parts();
                      }
                    });
                  }
                });
              })();
            }
          }), createComponent(Match, {
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
                return createComponent(Show, {
                  get when() {
                    return item();
                  },
                  get children() {
                    return createComponent(Part, {
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
  return createComponent(Collapsible, {
    get open() {
      return open();
    },
    onOpenChange: setOpen,
    variant: "ghost",
    "class": "tool-collapsible",
    get children() {
      return [createComponent(Collapsible.Trigger, {
        get children() {
          const root = template(`<div data-component="context-tool-group-trigger"><span data-slot="context-tool-group-title" class="min-w-0 d-flex align-items-center gap-2 fw-medium text-body-emphasis"><span data-slot="context-tool-group-label" class="shrink-0"></span><span data-slot="context-tool-group-summary" class="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-normal text-body"></span></span></div>`);
          const title = root.firstChild;
          const label = title.firstChild;
          const summaryEl = label.nextSibling;
          _solidInsert(label, createComponent(ToolStatusTitle, {
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
          _solidInsert(summaryEl, createComponent(AnimatedCountList, {
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
          _solidInsert(root, createComponent(Collapsible.Arrow, {}), null);
          return root;
        }
      }), createComponent(Collapsible.Content, {
        get children() {
          const listEl = template(`<div data-component="context-tool-group-list"></div>`);
          _solidInsert(listEl, createComponent(Index, {
            get each() {
              return props.parts;
            },
            children: partAccessor => {
              const trigger = createMemo(() => contextToolTrigger(partAccessor(), i18n));
              const running = createMemo(() => partAccessor().state.status === "pending" || partAccessor().state.status === "running");
              const item = template(`<div data-slot="context-tool-group-item"><div data-component="tool-trigger"><div data-slot="basic-tool-tool-trigger-content"><div data-slot="basic-tool-tool-info"><div data-slot="basic-tool-tool-info-structured"><div data-slot="basic-tool-tool-info-main"><span data-slot="basic-tool-tool-title"></span></div></div></div></div></div></div>`);
              const main = item.firstChild.firstChild.firstChild.firstChild.firstChild;
              const titleEl = main.firstChild;
              _solidInsert(titleEl, createComponent(TextShimmer, {
                get text() {
                  return trigger().title;
                },
                get active() {
                  return running();
                }
              }));
              _solidInsert(main, createComponent(Show, {
                get when() {
                  return !running() && trigger().subtitle;
                },
                get children() {
                  const subtitle = template(`<span data-slot="basic-tool-tool-subtitle"></span>`);
                  createRenderEffect(() => {
                    subtitle.textContent = trigger().subtitle ?? "";
                  });
                  return subtitle;
                }
              }), null);
              _solidInsert(main, createComponent(Show, {
                get when() {
                  return !running() && trigger().args?.length;
                },
                get children() {
                  return createComponent(For, {
                    get each() {
                      return trigger().args;
                    },
                    children: arg => {
                      // arg is a plain string row value (For is
                      // reference-keyed): one-shot write.
                      const argEl = template(`<span data-slot="basic-tool-tool-arg"></span>`);
                      argEl.textContent = arg;
                      return argEl;
                    }
                  });
                }
              }), null);
              return item;
            }
          }));
          return listEl;
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
    dialog.show(() => createComponent(ImagePreview, {
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
  const root = template(`<div data-component="user-message"></div>`);
  _solidInsert(root, createComponent(Show, {
    get when() {
      return attachments().length > 0;
    },
    get children() {
      const wrap = template(`<div data-slot="user-message-attachments"></div>`);
      _solidInsert(wrap, createComponent(For, {
        get each() {
          return attachments();
        },
        children: file => {
          // type/name are static per row (For is reference-keyed), so the
          // attribute writes are one-shot like the compiled thunks.
          const type = kind(file);
          const name = file.filename ?? i18n.t("ui.message.attachment.alt");
          const item = template(`<div data-slot="user-message-attachment"></div>`);
          item.addEventListener("click", () => {
            if (type === "image") openImagePreview(file.url, name);
          });
          setAttr(item, "data-type", type);
          setAttr(item, "data-clickable", type === "image" ? "true" : undefined);
          setAttr(item, "title", type === "file" ? name : undefined);
          _solidInsert(item, createComponent(Show, {
            when: type === "image",
            get fallback() {
              const fileEl = template(`<div data-slot="user-message-attachment-file"><span data-slot="user-message-attachment-name"></span></div>`);
              const nameEl = fileEl.firstChild;
              _solidInsert(fileEl, createComponent(FileIcon, {
                node: {
                  path: name,
                  type: "file"
                }
              }), nameEl);
              nameEl.textContent = name;
              return fileEl;
            },
            get children() {
              const img = template(`<img data-slot="user-message-attachment-image">`);
              img.setAttribute("alt", name);
              createRenderEffect(() => setAttr(img, "src", file.url));
              return img;
            }
          }));
          return item;
        }
      }));
      return wrap;
    }
  }), null);
  _solidInsert(root, createComponent(Show, {
    get when() {
      return text();
    },
    get children() {
      const body = template(`<div data-slot="user-message-body"><div data-slot="user-message-text"></div></div>`);
      const textEl = body.firstChild;
      _solidInsert(textEl, createComponent(HighlightedText, {
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
      const copyWrap = template(`<div data-slot="user-message-copy-wrapper"></div>`);
      _solidInsert(copyWrap, createComponent(Show, {
        get when() {
          return metaHead() || metaTail();
        },
        get children() {
          const metaWrap = template(`<span data-slot="user-message-meta-wrap"></span>`);
          _solidInsert(metaWrap, createComponent(Show, {
            get when() {
              return metaHead();
            },
            get children() {
              const head = template(`<span data-slot="user-message-meta" class="small fw-normal text-secondary cursor-default"></span>`);
              createRenderEffect(() => {
                head.textContent = metaHead();
              });
              return head;
            }
          }), null);
          _solidInsert(metaWrap, createComponent(Show, {
            get when() {
              return !!metaHead() && metaTail();
            },
            get children() {
              return template(`<span data-slot="user-message-meta-sep" class="small fw-normal text-secondary cursor-default"> · </span>`);
            }
          }), null);
          _solidInsert(metaWrap, createComponent(Show, {
            get when() {
              return metaTail();
            },
            get children() {
              const tail = template(`<span data-slot="user-message-meta-tail" class="small fw-normal text-secondary cursor-default"></span>`);
              createRenderEffect(() => {
                tail.textContent = metaTail();
              });
              return tail;
            }
          }), null);
          return metaWrap;
        }
      }), null);
      _solidInsert(copyWrap, createComponent(Show, {
        get when() {
          return props.actions?.revert;
        },
        get children() {
          return createComponent(Tooltip, {
            get value() {
              return i18n.t("ui.message.revertMessage");
            },
            placement: "top",
            gutter: 4,
            get children() {
              return createComponent(IconButton, {
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
      _solidInsert(copyWrap, createComponent(Tooltip, {
        get value() {
          return copied() ? i18n.t("ui.message.copied") : i18n.t("ui.message.copyMessage");
        },
        placement: "top",
        gutter: 4,
        get children() {
          return createComponent(IconButton, {
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
              return copied() ? i18n.t("ui.message.copied") : i18n.t("ui.message.copyMessage");
            }
          });
        }
      }), null);
      return [body, copyWrap];
    }
  }), null);
  return root;
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
  return createComponent(For, {
    get each() {
      return segments();
    },
    children: segment => {
      // segment is a fresh plain object per memo evaluation (For is
      // reference-keyed), so its fields are static for the row's lifetime.
      const span = template(`<span></span>`);
      span.textContent = segment.text;
      setAttr(span, "data-highlight", segment.type);
      return span;
    }
  });
}
export function Part(props) {
  const component = createMemo(() => PART_MAPPING[props.part.type]);
  return createComponent(Show, {
    get when() {
      return component();
    },
    get children() {
      return createComponent(Dynamic, {
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
  return createComponent(Accordion, {
    multiple: true,
    "data-scope": "apply-patch",
    style: {
      "--sticky-accordion-offset": "calc(32px + var(--tool-content-gap))"
    },
    get defaultValue() {
      return [value()];
    },
    get children() {
      return createComponent(Accordion.Item, {
        get value() {
          return value();
        },
        get children() {
          return [createComponent(StickyAccordionHeader, {
            get children() {
              return createComponent(Accordion.Trigger, {
                get children() {
                  const trigger = template(`<div data-slot="apply-patch-trigger-content"><div data-slot="apply-patch-file-info"><div data-slot="apply-patch-file-name-container"><span data-slot="apply-patch-filename"></span></div></div><div data-slot="apply-patch-trigger-actions"></div></div>`);
                  const info = trigger.firstChild;
                  const nameContainer = info.firstChild;
                  const filename = nameContainer.firstChild;
                  const actions = info.nextSibling;
                  _solidInsert(info, createComponent(FileIcon, {
                    get node() {
                      return {
                        path: props.path,
                        type: "file"
                      };
                    }
                  }), nameContainer);
                  _solidInsert(nameContainer, createComponent(Show, {
                    get when() {
                      return props.path.includes("/");
                    },
                    get children() {
                      const directory = template(`<span data-slot="apply-patch-directory"></span>`);
                      createRenderEffect(() => {
                        directory.textContent = `\u202A${getDirectory(props.path)}\u202C`;
                      });
                      return directory;
                    }
                  }), filename);
                  createRenderEffect(() => {
                    filename.textContent = getFilename(props.path);
                  });
                  _solidInsert(actions, () => props.actions, null);
                  _solidInsert(actions, createComponent(Icon, {
                    name: "chevron-grabber-vertical",
                    size: "small"
                  }), null);
                  return trigger;
                }
              });
            }
          }), createComponent(Accordion.Content, {
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
  return createComponent(Show, {
    get when() {
      return !hideQuestion();
    },
    get children() {
      const wrapper = template(`<div data-component="tool-part-wrapper"></div>`);
      _solidInsert(wrapper, createComponent(Switch, {
        get children() {
          return [createComponent(Match, {
            get when() {
              return part().state.status === "error" && part().state.error;
            },
            children: error => {
              const cleaned = error().replace("Error: ", "");
              if (part().tool === "question" && cleaned.includes("dismissed this question")) {
                const dismissed = template(`<div style="width:100%;display:flex;justify-content:flex-end"><span class="fw-normal text-secondary cursor-default"></span></div>`);
                const dismissedLabel = dismissed.firstChild;
                createRenderEffect(() => {
                  dismissedLabel.textContent = i18n.t("ui.messagePart.questions.dismissed");
                });
                return dismissed;
              }
              return createComponent(ToolErrorCard, {
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
          }), createComponent(Match, {
            when: true,
            get children() {
              return createComponent(Dynamic, {
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
      return wrapper;
    }
  });
};
export function MessageDivider(props) {
  const root = template(`<div data-component="compaction-part"><div data-slot="compaction-part-divider"><span data-slot="compaction-part-line"></span><span data-slot="compaction-part-label" class="small fw-normal text-secondary"></span><span data-slot="compaction-part-line"></span></div></div>`);
  const divider = root.firstChild;
  const label = divider.firstChild.nextSibling;
  createRenderEffect(() => {
    label.textContent = props.label ?? "";
  });
  return root;
}
PART_MAPPING["compaction"] = function CompactionPartDisplay() {
  const i18n = useI18n();
  return createComponent(MessageDivider, {
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
  return createComponent(Show, {
    get when() {
      return text();
    },
    get children() {
      const root = template(`<div data-component="text-part"><div data-slot="text-part-body"></div></div>`);
      const body = root.firstChild;
      _solidInsert(body, createComponent(Show, {
        get when() {
          return streaming();
        },
        get fallback() {
          return createComponent(Markdown, {
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
          return createComponent(PacedMarkdown, {
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
      _solidInsert(root, createComponent(Show, {
        get when() {
          return showCopy();
        },
        get children() {
          const copyWrap = template(`<div data-slot="text-part-copy-wrapper"></div>`);
          _solidInsert(copyWrap, createComponent(Tooltip, {
            get value() {
              return copied() ? i18n.t("ui.message.copied") : i18n.t("ui.message.copyResponse");
            },
            placement: "top",
            gutter: 4,
            get children() {
              return createComponent(IconButton, {
                get icon() {
                  return copied() ? "check" : "copy";
                },
                size: "normal",
                variant: "ghost",
                onMouseDown: e => e.preventDefault(),
                onClick: handleCopy,
                get ["aria-label"]() {
                  return copied() ? i18n.t("ui.message.copied") : i18n.t("ui.message.copyResponse");
                }
              });
            }
          }), null);
          _solidInsert(copyWrap, createComponent(Show, {
            get when() {
              return meta();
            },
            get children() {
              const metaEl = template(`<span data-slot="text-part-meta" class="small fw-normal text-secondary cursor-default"></span>`);
              createRenderEffect(() => {
                metaEl.textContent = meta();
              });
              return metaEl;
            }
          }), null);
          createRenderEffect(() => setAttr(copyWrap, "data-interrupted", interrupted() ? "" : undefined));
          return copyWrap;
        }
      }), null);
      return root;
    }
  });
};
PART_MAPPING["reasoning"] = function ReasoningPartDisplay(props) {
  const part = () => props.part;
  const streaming = createMemo(() => props.message?.role === "assistant" && typeof props.message?.time.completed !== "number");
  const text = () => part().text.trim();
  return createComponent(Show, {
    get when() {
      return text();
    },
    get children() {
      const root = template(`<div data-component="reasoning-part"></div>`);
      _solidInsert(root, createComponent(Show, {
        get when() {
          return streaming();
        },
        get fallback() {
          return createComponent(Markdown, {
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
          return createComponent(PacedMarkdown, {
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
      return root;
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
    return [createComponent(BasicTool, mergeProps(props, {
      icon: "glasses",
      get trigger() {
        return {
          title: i18n.t("ui.tool.read"),
          subtitle: props.input.filePath ? getFilename(props.input.filePath) : "",
          args
        };
      }
    })), createComponent(For, {
      get each() {
        return loaded();
      },
      children: filepath => {
        const row = template(`<div data-component="tool-loaded-file"><span> </span></div>`);
        const span = row.firstChild;
        const space = span.firstChild;
        _solidInsert(row, createComponent(Icon, {
          name: "enter",
          size: "small"
        }), span);
        // "<loaded> <path>" as live text nodes around the static space,
        // matching the compiled inserts.
        const labelText = document.createTextNode("");
        span.insertBefore(labelText, space);
        const pathText = document.createTextNode("");
        span.appendChild(pathText);
        createRenderEffect(() => {
          labelText.data = i18n.t("ui.tool.loaded");
        });
        createRenderEffect(() => {
          pathText.data = relativizeProjectPath(filepath, data.directory);
        });
        return row;
      }
    })];
  }
});
ToolRegistry.register({
  name: "list",
  render(props) {
    const i18n = useI18n();
    return createComponent(BasicTool, mergeProps(props, {
      icon: "bullet-list",
      get trigger() {
        return {
          title: i18n.t("ui.tool.list"),
          subtitle: getDirectory(props.input.path || "/")
        };
      },
      get children() {
        return createComponent(Show, {
          get when() {
            return props.output;
          },
          get children() {
            const output = template(`<div data-component="tool-output" data-scrollable></div>`);
            _solidInsert(output, createComponent(Markdown, {
              get text() {
                return props.output;
              }
            }));
            return output;
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
    return createComponent(BasicTool, mergeProps(props, {
      icon: "magnifying-glass-menu",
      get trigger() {
        return {
          title: i18n.t("ui.tool.glob"),
          subtitle: getDirectory(props.input.path || "/"),
          args: props.input.pattern ? ["pattern=" + props.input.pattern] : []
        };
      },
      get children() {
        return createComponent(Show, {
          get when() {
            return props.output;
          },
          get children() {
            const output = template(`<div data-component="tool-output" data-scrollable></div>`);
            _solidInsert(output, createComponent(Markdown, {
              get text() {
                return props.output;
              }
            }));
            return output;
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
    return createComponent(BasicTool, mergeProps(props, {
      icon: "magnifying-glass-menu",
      get trigger() {
        return {
          title: i18n.t("ui.tool.grep"),
          subtitle: getDirectory(props.input.path || "/"),
          args
        };
      },
      get children() {
        return createComponent(Show, {
          get when() {
            return props.output;
          },
          get children() {
            const output = template(`<div data-component="tool-output" data-scrollable></div>`);
            _solidInsert(output, createComponent(Markdown, {
              get text() {
                return props.output;
              }
            }));
            return output;
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
    return createComponent(BasicTool, mergeProps(props, {
      hideDetails: true,
      icon: "window-cursor",
      get trigger() {
        const box = template(`<div data-slot="basic-tool-tool-info-structured"><div data-slot="basic-tool-tool-info-main"><span data-slot="basic-tool-tool-title"></span></div></div>`);
        const main = box.firstChild;
        const titleEl = main.firstChild;
        _solidInsert(titleEl, createComponent(TextShimmer, {
          get text() {
            return i18n.t("ui.tool.webfetch");
          },
          get active() {
            return pending();
          }
        }));
        _solidInsert(main, createComponent(Show, {
          get when() {
            return !pending() && url();
          },
          get children() {
            const link = template(`<a data-slot="basic-tool-tool-subtitle" class="clickable subagent-link" target="_blank" rel="noopener noreferrer"></a>`);
            link.addEventListener("click", event => event.stopPropagation());
            createRenderEffect(() => {
              link.textContent = url();
            });
            createRenderEffect(() => setAttr(link, "href", url()));
            return link;
          }
        }), null);
        _solidInsert(box, createComponent(Show, {
          get when() {
            return !pending() && url();
          },
          get children() {
            const action = template(`<div data-component="tool-action"></div>`);
            _solidInsert(action, createComponent(Icon, {
              name: "square-arrow-top-right",
              size: "small"
            }));
            return action;
          }
        }), null);
        return box;
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
    return createComponent(BasicTool, mergeProps(props, {
      icon: "window-cursor",
      get trigger() {
        return {
          title: i18n.t("ui.tool.websearch"),
          subtitle: query(),
          subtitleClass: "exa-tool-query"
        };
      },
      get children() {
        return createComponent(ExaOutput, {
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
    const trigger = () => {
      const card = template(`<div data-component="task-tool-card"><div data-slot="basic-tool-tool-info-structured"><div data-slot="basic-tool-tool-info-main"><span data-component="task-tool-title"></span></div></div></div>`);
      const structured = card.firstChild;
      const main = structured.firstChild;
      const titleEl = main.firstChild;
      _solidInsert(main, createComponent(Show, {
        get when() {
          return running();
        },
        get children() {
          const spinner = template(`<span data-component="task-tool-spinner"></span>`);
          _solidInsert(spinner, createComponent(Spinner, {}));
          createRenderEffect(() => {
            spinner.style.setProperty("color", tone() ?? "var(--icon-interactive-base)");
          });
          return spinner;
        }
      }), titleEl);
      createRenderEffect(() => {
        titleEl.textContent = title();
      });
      _solidInsert(main, createComponent(Show, {
        get when() {
          return subtitle();
        },
        get children() {
          const sub = template(`<span data-slot="basic-tool-tool-subtitle"></span>`);
          createRenderEffect(() => {
            sub.textContent = subtitle() ?? "";
          });
          return sub;
        }
      }), null);
      _solidInsert(card, createComponent(Show, {
        get when() {
          return clickable();
        },
        get children() {
          const action = template(`<div data-component="task-tool-action"></div>`);
          _solidInsert(action, createComponent(Icon, {
            name: "square-arrow-top-right",
            size: "small"
          }));
          return action;
        }
      }), null);
      createRenderEffect(() => {
        titleEl.style.setProperty("color", tone() ?? "var(--text-strong)");
      });
      return card;
    };
    return createComponent(BasicTool, {
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
    return createComponent(BasicTool, mergeProps(props, {
      icon: "console",
      get trigger() {
        const box = template(`<div data-slot="basic-tool-tool-info-structured"><div data-slot="basic-tool-tool-info-main"><span data-slot="basic-tool-tool-title"></span></div></div>`);
        const main = box.firstChild;
        const titleEl = main.firstChild;
        _solidInsert(titleEl, createComponent(TextShimmer, {
          get text() {
            return i18n.t("ui.tool.shell");
          },
          get active() {
            return pending();
          }
        }));
        _solidInsert(main, createComponent(Show, {
          get when() {
            return !pending() && props.input.description;
          },
          get children() {
            return createComponent(ShellSubmessage, {
              get text() {
                return props.input.description;
              },
              animate: sawPending
            });
          }
        }), null);
        return box;
      },
      get children() {
        const output = template(`<div data-component="bash-output"><div data-slot="bash-copy"></div><div data-slot="bash-scroll" data-scrollable><pre data-slot="bash-pre"><code></code></pre></div></div>`);
        const copyEl = output.firstChild;
        const scrollEl = copyEl.nextSibling;
        const preEl = scrollEl.firstChild;
        const codeEl = preEl.firstChild;
        _solidInsert(copyEl, createComponent(Tooltip, {
          get value() {
            return copied() ? i18n.t("ui.message.copied") : i18n.t("ui.message.copy");
          },
          placement: "top",
          gutter: 4,
          get children() {
            return createComponent(IconButton, {
              get icon() {
                return copied() ? "check" : "copy";
              },
              size: "small",
              variant: "secondary",
              onMouseDown: e => e.preventDefault(),
              onClick: handleCopy,
              get ["aria-label"]() {
                return copied() ? i18n.t("ui.message.copied") : i18n.t("ui.message.copy");
              }
            });
          }
        }));
        createRenderEffect(() => {
          codeEl.textContent = text();
        });
        return output;
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
    const root = template(`<div data-component="edit-tool"></div>`);
    _solidInsert(root, createComponent(BasicTool, mergeProps(props, {
      icon: "code-lines",
      defer: true,
      get trigger() {
        const trigger = template(`<div data-component="edit-trigger"><div data-slot="message-part-title-area"><div data-slot="message-part-title"><span data-slot="message-part-title-text"></span></div></div><div data-slot="message-part-actions"></div></div>`);
        const titleArea = trigger.firstChild;
        const titleRow = titleArea.firstChild;
        const titleText = titleRow.firstChild;
        const actionsEl = titleArea.nextSibling;
        _solidInsert(titleText, createComponent(TextShimmer, {
          get text() {
            return i18n.t("ui.messagePart.title.edit");
          },
          get active() {
            return pending();
          }
        }));
        _solidInsert(titleRow, createComponent(Show, {
          get when() {
            return !pending();
          },
          get children() {
            const name = template(`<span data-slot="message-part-title-filename"></span>`);
            createRenderEffect(() => {
              name.textContent = filename();
            });
            return name;
          }
        }), null);
        _solidInsert(titleArea, createComponent(Show, {
          get when() {
            return !pending() && props.input.filePath?.includes("/");
          },
          get children() {
            const pathEl = template(`<div data-slot="message-part-path"><span data-slot="message-part-directory"></span></div>`);
            const directory = pathEl.firstChild;
            createRenderEffect(() => {
              directory.textContent = getDirectory(props.input.filePath);
            });
            return pathEl;
          }
        }), null);
        _solidInsert(actionsEl, createComponent(Show, {
          get when() {
            return !pending() && props.metadata.filediff;
          },
          get children() {
            return createComponent(DiffChanges, {
              get changes() {
                return props.metadata.filediff;
              }
            });
          }
        }));
        return trigger;
      },
      get children() {
        return [createComponent(Show, {
          get when() {
            return path();
          },
          get children() {
            return createComponent(ToolFileAccordion, {
              get path() {
                return path();
              },
              get actions() {
                return createComponent(Show, {
                  get when() {
                    return !pending() && props.metadata.filediff;
                  },
                  get children() {
                    return createComponent(DiffChanges, {
                      get changes() {
                        return props.metadata.filediff;
                      }
                    });
                  }
                });
              },
              get children() {
                const content = template(`<div data-component="edit-content"></div>`);
                _solidInsert(content, createComponent(Dynamic, {
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
                return content;
              }
            });
          }
        }), createComponent(DiagnosticsDisplay, {
          get diagnostics() {
            return diagnostics();
          }
        })];
      }
    })));
    return root;
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
    const root = template(`<div data-component="write-tool"></div>`);
    _solidInsert(root, createComponent(BasicTool, mergeProps(props, {
      icon: "code-lines",
      defer: true,
      get trigger() {
        const trigger = template(`<div data-component="write-trigger"><div data-slot="message-part-title-area"><div data-slot="message-part-title"><span data-slot="message-part-title-text"></span></div></div><div data-slot="message-part-actions"></div></div>`);
        const titleArea = trigger.firstChild;
        const titleRow = titleArea.firstChild;
        const titleText = titleRow.firstChild;
        _solidInsert(titleText, createComponent(TextShimmer, {
          get text() {
            return i18n.t("ui.messagePart.title.write");
          },
          get active() {
            return pending();
          }
        }));
        _solidInsert(titleRow, createComponent(Show, {
          get when() {
            return !pending();
          },
          get children() {
            const name = template(`<span data-slot="message-part-title-filename"></span>`);
            createRenderEffect(() => {
              name.textContent = filename();
            });
            return name;
          }
        }), null);
        _solidInsert(titleArea, createComponent(Show, {
          get when() {
            return !pending() && props.input.filePath?.includes("/");
          },
          get children() {
            const pathEl = template(`<div data-slot="message-part-path"><span data-slot="message-part-directory"></span></div>`);
            const directory = pathEl.firstChild;
            createRenderEffect(() => {
              directory.textContent = getDirectory(props.input.filePath);
            });
            return pathEl;
          }
        }), null);
        return trigger;
      },
      get children() {
        return [createComponent(Show, {
          get when() {
            return !!props.input.content && path();
          },
          get children() {
            return createComponent(ToolFileAccordion, {
              get path() {
                return path();
              },
              get children() {
                const content = template(`<div data-component="write-content"></div>`);
                _solidInsert(content, createComponent(Dynamic, {
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
                return content;
              }
            });
          }
        }), createComponent(DiagnosticsDisplay, {
          get diagnostics() {
            return diagnostics();
          }
        })];
      }
    })));
    return root;
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
    return createComponent(Show, {
      get when() {
        return single();
      },
      get fallback() {
        const root = template(`<div data-component="apply-patch-tool"></div>`);
        _solidInsert(root, createComponent(BasicTool, mergeProps(props, {
            icon: "code-lines",
            defer: true,
            get trigger() {
              return {
                title: i18n.t("ui.tool.patch"),
                subtitle: subtitle()
              };
            },
            get children() {
              return createComponent(Show, {
                get when() {
                  return files().length > 0;
                },
                get children() {
                  return createComponent(Accordion, {
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
                      return createComponent(For, {
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
                          return createComponent(Accordion.Item, {
                            get value() {
                              return file.filePath;
                            },
                            get ["data-type"]() {
                              return file.type;
                            },
                            get children() {
                              return [createComponent(StickyAccordionHeader, {
                                get children() {
                                  return createComponent(Accordion.Trigger, {
                                    get children() {
                                      // file is static per row (For is
                                      // reference-keyed), so path writes and
                                      // the type switch are one-shot; only
                                      // the i18n labels stay live.
                                      const trigger = template(`<div data-slot="apply-patch-trigger-content"><div data-slot="apply-patch-file-info"><div data-slot="apply-patch-file-name-container"><span data-slot="apply-patch-filename"></span></div></div><div data-slot="apply-patch-trigger-actions"></div></div>`);
                                      const info = trigger.firstChild;
                                      const nameContainer = info.firstChild;
                                      const filename = nameContainer.firstChild;
                                      const actions = info.nextSibling;
                                      _solidInsert(info, createComponent(FileIcon, {
                                        get node() {
                                          return {
                                            path: file.relativePath,
                                            type: "file"
                                          };
                                        }
                                      }), nameContainer);
                                      // Show(static condition) -> plain if.
                                      // The text stays live: getDirectory
                                      // reads the reactive data.directory.
                                      if (file.relativePath.includes("/")) {
                                        const directory = template(`<span data-slot="apply-patch-directory"></span>`);
                                        createRenderEffect(() => {
                                          directory.textContent = `\u202A${getDirectory(file.relativePath)}\u202C`;
                                        });
                                        nameContainer.insertBefore(directory, filename);
                                      }
                                      filename.textContent = getFilename(file.relativePath);
                                      // Switch over the static file.type ->
                                      // plain if/else chain.
                                      if (file.type === "add") {
                                        const change = template(`<span data-slot="apply-patch-change" data-type="added"></span>`);
                                        createRenderEffect(() => {
                                          change.textContent = i18n.t("ui.patch.action.created");
                                        });
                                        actions.appendChild(change);
                                      } else if (file.type === "delete") {
                                        const change = template(`<span data-slot="apply-patch-change" data-type="removed"></span>`);
                                        createRenderEffect(() => {
                                          change.textContent = i18n.t("ui.patch.action.deleted");
                                        });
                                        actions.appendChild(change);
                                      } else if (file.type === "move") {
                                        const change = template(`<span data-slot="apply-patch-change" data-type="modified"></span>`);
                                        createRenderEffect(() => {
                                          change.textContent = i18n.t("ui.patch.action.moved");
                                        });
                                        actions.appendChild(change);
                                      } else {
                                        // DiffChanges returns a memo
                                        // accessor; insert() resolves it.
                                        _solidInsert(actions, createComponent(DiffChanges, {
                                          get changes() {
                                            return {
                                              additions: file.additions,
                                              deletions: file.deletions
                                            };
                                          }
                                        }), null);
                                      }
                                      _solidInsert(actions, createComponent(Icon, {
                                        name: "chevron-grabber-vertical",
                                        size: "small"
                                      }), null);
                                      return trigger;
                                    }
                                  });
                                }
                              }), createComponent(Accordion.Content, {
                                get children() {
                                  // Kobalte presence-gated content: keep the
                                  // Show + insert() path.
                                  return createComponent(Show, {
                                    get when() {
                                      return visible();
                                    },
                                    get children() {
                                      const view = template(`<div data-component="apply-patch-file-diff"></div>`);
                                      _solidInsert(view, createComponent(Dynamic, {
                                        component: fileComponent,
                                        mode: "diff",
                                        get fileDiff() {
                                          return file.view.fileDiff;
                                        }
                                      }));
                                      return view;
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
        return root;
      },
      get children() {
        const root = template(`<div data-component="apply-patch-tool"></div>`);
        _solidInsert(root, createComponent(BasicTool, mergeProps(props, {
          icon: "code-lines",
          defer: true,
          get trigger() {
            const trigger = template(`<div data-component="edit-trigger"><div data-slot="message-part-title-area"><div data-slot="message-part-title"><span data-slot="message-part-title-text"></span></div></div><div data-slot="message-part-actions"></div></div>`);
            const titleArea = trigger.firstChild;
            const titleRow = titleArea.firstChild;
            const titleText = titleRow.firstChild;
            const actionsEl = titleArea.nextSibling;
            _solidInsert(titleText, createComponent(TextShimmer, {
              get text() {
                return i18n.t("ui.tool.patch");
              },
              get active() {
                return pending();
              }
            }));
            _solidInsert(titleRow, createComponent(Show, {
              get when() {
                return !pending();
              },
              get children() {
                const name = template(`<span data-slot="message-part-title-filename"></span>`);
                createRenderEffect(() => {
                  name.textContent = getFilename(single().relativePath);
                });
                return name;
              }
            }), null);
            _solidInsert(titleArea, createComponent(Show, {
              get when() {
                return !pending() && single().relativePath.includes("/");
              },
              get children() {
                const pathEl = template(`<div data-slot="message-part-path"><span data-slot="message-part-directory"></span></div>`);
                const directory = pathEl.firstChild;
                createRenderEffect(() => {
                  directory.textContent = getDirectory(single().relativePath);
                });
                return pathEl;
              }
            }), null);
            _solidInsert(actionsEl, createComponent(Show, {
              get when() {
                return !pending();
              },
              get children() {
                return createComponent(DiffChanges, {
                  get changes() {
                    return {
                      additions: single().additions,
                      deletions: single().deletions
                    };
                  }
                });
              }
            }));
            return trigger;
          },
          get children() {
            return createComponent(ToolFileAccordion, {
              get path() {
                return single().relativePath;
              },
              get actions() {
                // single() is reactive here, so keep the runtime Switch.
                return createComponent(Switch, {
                  get children() {
                    return [createComponent(Match, {
                      get when() {
                        return single().type === "add";
                      },
                      get children() {
                        const change = template(`<span data-slot="apply-patch-change" data-type="added"></span>`);
                        createRenderEffect(() => {
                          change.textContent = i18n.t("ui.patch.action.created");
                        });
                        return change;
                      }
                    }), createComponent(Match, {
                      get when() {
                        return single().type === "delete";
                      },
                      get children() {
                        const change = template(`<span data-slot="apply-patch-change" data-type="removed"></span>`);
                        createRenderEffect(() => {
                          change.textContent = i18n.t("ui.patch.action.deleted");
                        });
                        return change;
                      }
                    }), createComponent(Match, {
                      get when() {
                        return single().type === "move";
                      },
                      get children() {
                        const change = template(`<span data-slot="apply-patch-change" data-type="modified"></span>`);
                        createRenderEffect(() => {
                          change.textContent = i18n.t("ui.patch.action.moved");
                        });
                        return change;
                      }
                    }), createComponent(Match, {
                      when: true,
                      get children() {
                        return createComponent(DiffChanges, {
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
                const view = template(`<div data-component="apply-patch-file-diff"></div>`);
                _solidInsert(view, createComponent(Dynamic, {
                  component: fileComponent,
                  mode: "diff",
                  get fileDiff() {
                    return single().view.fileDiff;
                  }
                }));
                return view;
              }
            });
          }
        })));
        return root;
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
    return createComponent(BasicTool, mergeProps(props, {
      defaultOpen: true,
      icon: "checklist",
      get trigger() {
        return {
          title: i18n.t("ui.tool.todos"),
          subtitle: subtitle()
        };
      },
      get children() {
        return createComponent(Show, {
          get when() {
            return todos().length;
          },
          get children() {
            const listEl = template(`<div data-component="todos"></div>`);
            _solidInsert(listEl, createComponent(For, {
              get each() {
                return todos();
              },
              children: todo => createComponent(Checkbox, {
                readOnly: true,
                get checked() {
                  return todo.status === "completed";
                },
                get children() {
                  const content = template(`<span data-slot="message-part-todo-content"></span>`);
                  createRenderEffect(() => {
                    content.textContent = todo.content ?? "";
                  });
                  createRenderEffect(() => setAttr(content, "data-completed", todo.status === "completed" ? "completed" : undefined));
                  return content;
                }
              })
            }));
            return listEl;
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
    return createComponent(BasicTool, mergeProps(props, {
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
        return createComponent(Show, {
          get when() {
            return completed();
          },
          get children() {
            const listEl = template(`<div data-component="question-answers"></div>`);
            _solidInsert(listEl, createComponent(For, {
              get each() {
                return questions();
              },
              children: (q, i) => {
                const answer = () => answers()[i()] ?? [];
                const item = template(`<div data-slot="question-answer-item"><div data-slot="question-text"></div><div data-slot="answer-text"></div></div>`);
                const questionEl = item.firstChild;
                const answerEl = questionEl.nextSibling;
                createRenderEffect(() => {
                  questionEl.textContent = q.question ?? "";
                });
                createRenderEffect(() => {
                  answerEl.textContent = answer().join(", ") || i18n.t("ui.question.answer.none");
                });
                return item;
              }
            }));
            return listEl;
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
    const titleContent = () => createComponent(TextShimmer, {
      get text() {
        return title();
      },
      get active() {
        return running();
      }
    });
    const trigger = () => {
      const box = template(`<div data-slot="basic-tool-tool-info-structured"><div data-slot="basic-tool-tool-info-main"><span data-slot="basic-tool-tool-title" class="capitalize agent-title"></span></div></div>`);
      const titleEl = box.firstChild.firstChild;
      _solidInsert(titleEl, titleContent);
      return box;
    };
    return createComponent(BasicTool, {
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
