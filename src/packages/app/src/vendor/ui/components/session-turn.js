// Dynamic is a runtime component, not a compiled template helper (it is only
// exported from solid-js/web). insert() is the established exception for
// reactive/component-valued children (Kobalte presence-gated Accordion
// content, memo-accessor returns) so Solid keeps reconciling accessors
// instead of freezing them.
import { Dynamic, insert as _solidInsert } from "solid-js/web";
import { useData } from "../context/index.js";
import { useFileComponent } from "../context/file.js";
import { Binary } from "core/util/binary";
import { getDirectory, getFilename } from "core/util/path";
import { createComponent, createEffect, createMemo, createRenderEffect, createSignal, For, on, Show } from "solid-js";
import { createStore } from "solid-js/store";
import { AssistantParts, Message, MessageDivider, PART_MAPPING } from "./message-part.js";
import { Card } from "./card.js";
import { Accordion } from "./accordion.js";
import { StickyAccordionHeader } from "./sticky-accordion-header.js";
import { DiffChanges } from "./diff-changes.js";
import { Icon } from "./icon.js";
import { TextShimmer } from "./text-shimmer.js";
import { SessionRetry } from "./session-retry.js";
import { TextReveal } from "./text-reveal.js";
import { createAutoScroll } from "../hooks/index.js";
import { useI18n } from "../context/i18n.js";
import { normalize } from "./session-diff.js";

// Build a detached element from compact HTML (no inter-element whitespace,
// matching the compiled Solid templates). Static markup only — translated or
// user-provided strings are always assigned via textContent/text nodes.
function template(html) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;
  return wrapper.firstElementChild;
}
function record(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function unwrap(message) {
  const text = message.replace(/^Error:\s*/, "").trim();
  const parse = value => {
    try {
      return JSON.parse(value);
    } catch {
      return undefined;
    }
  };
  const read = value => {
    const first = parse(value);
    if (typeof first !== "string") return first;
    return parse(first.trim());
  };
  let json = read(text);
  if (json === undefined) {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end > start) {
      json = read(text.slice(start, end + 1));
    }
  }
  if (!record(json)) return message;
  const err = record(json.error) ? json.error : undefined;
  if (err) {
    const type = typeof err.type === "string" ? err.type : undefined;
    const msg = typeof err.message === "string" ? err.message : undefined;
    if (type && msg) return `${type}: ${msg}`;
    if (msg) return msg;
    if (type) return type;
    const code = typeof err.code === "string" ? err.code : undefined;
    if (code) return code;
  }
  const msg = typeof json.message === "string" ? json.message : undefined;
  if (msg) return msg;
  const reason = typeof json.error === "string" ? json.error : undefined;
  if (reason) return reason;
  return message;
}
function same(a, b) {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  return a.every((x, i) => x === b[i]);
}
function list(value, fallback) {
  if (Array.isArray(value)) return value;
  return fallback;
}
const hidden = new Set(["todowrite"]);
function partState(part, showReasoningSummaries) {
  if (part.type === "tool") {
    if (hidden.has(part.tool)) return;
    if (part.tool === "question" && (part.state.status === "pending" || part.state.status === "running")) return;
    return "visible";
  }
  if (part.type === "text") return part.text?.trim() ? "visible" : undefined;
  if (part.type === "reasoning") {
    if (showReasoningSummaries && part.text?.trim()) return "visible";
    return;
  }
  if (PART_MAPPING[part.type]) return "visible";
  return;
}
function clean(value) {
  return value.replace(/`([^`]+)`/g, "$1").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/[*_~]+/g, "").trim();
}
function heading(text) {
  const markdown = text.replace(/\r\n?/g, "\n");
  const html = markdown.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i);
  if (html?.[1]) {
    const value = clean(html[1].replace(/<[^>]+>/g, " "));
    if (value) return value;
  }
  const atx = markdown.match(/^\s{0,3}#{1,6}[ \t]+(.+?)(?:[ \t]+#+[ \t]*)?$/m);
  if (atx?.[1]) {
    const value = clean(atx[1]);
    if (value) return value;
  }
  const setext = markdown.match(/^([^\n]+)\n(?:=+|-+)\s*$/m);
  if (setext?.[1]) {
    const value = clean(setext[1]);
    if (value) return value;
  }
  const strong = markdown.match(/^\s*(?:\*\*|__)(.+?)(?:\*\*|__)\s*$/m);
  if (strong?.[1]) {
    const value = clean(strong[1]);
    if (value) return value;
  }
}
export function SessionTurn(props) {
  const data = useData();
  const i18n = useI18n();
  const fileComponent = useFileComponent();
  const emptyMessages = [];
  const emptyParts = [];
  const emptyAssistant = [];
  const emptyDiffs = [];
  const idle = {
    type: "idle"
  };
  const allMessages = createMemo(() => props.messages ?? list(data.store.message?.[props.sessionID], emptyMessages));
  const messageIndex = createMemo(() => {
    const messages = allMessages() ?? emptyMessages;
    const result = Binary.search(messages, props.messageID, m => m.id);
    const index = result.found ? result.index : messages.findIndex(m => m.id === props.messageID);
    if (index < 0) return -1;
    const msg = messages[index];
    if (!msg || msg.role !== "user") return -1;
    return index;
  });
  const message = createMemo(() => {
    const index = messageIndex();
    if (index < 0) return undefined;
    const messages = allMessages() ?? emptyMessages;
    const msg = messages[index];
    if (!msg || msg.role !== "user") return undefined;
    return msg;
  });
  const pending = createMemo(() => {
    if (typeof props.active === "boolean") return;
    const messages = allMessages() ?? emptyMessages;
    return messages.findLast(item => item.role === "assistant" && typeof item.time.completed !== "number");
  });
  const pendingUser = createMemo(() => {
    const item = pending();
    if (!item?.parentID) return;
    const messages = allMessages() ?? emptyMessages;
    const result = Binary.search(messages, item.parentID, m => m.id);
    const msg = result.found ? messages[result.index] : messages.find(m => m.id === item.parentID);
    if (!msg || msg.role !== "user") return;
    return msg;
  });
  const active = createMemo(() => {
    if (typeof props.active === "boolean") return props.active;
    const msg = message();
    const parent = pendingUser();
    if (!msg || !parent) return false;
    return parent.id === msg.id;
  });
  const parts = createMemo(() => {
    const msg = message();
    if (!msg) return emptyParts;
    return list(data.store.part?.[msg.id], emptyParts);
  });
  const compaction = createMemo(() => parts().find(part => part.type === "compaction"));
  const diffs = createMemo(() => {
    const files = message()?.summary?.diffs;
    if (!files?.length) return emptyDiffs;
    const seen = new Set();
    return files.reduceRight((result, diff) => {
      if (seen.has(diff.file)) return result;
      seen.add(diff.file);
      result.push(diff);
      return result;
    }, []).reverse();
  });
  const MAX_FILES = 10;
  const edited = createMemo(() => diffs().length);
  const [state, setState] = createStore({
    showAll: false,
    expanded: []
  });
  const showAll = () => state.showAll;
  const expanded = () => state.expanded;
  const overflow = createMemo(() => Math.max(0, edited() - MAX_FILES));
  const visible = createMemo(() => showAll() ? diffs() : diffs().slice(0, MAX_FILES));
  const toggleAll = () => {
    autoScroll.pause();
    setState("showAll", !showAll());
  };
  const assistantMessages = createMemo(() => {
    const msg = message();
    if (!msg) return emptyAssistant;
    const messages = allMessages() ?? emptyMessages;
    if (messageIndex() < 0) return emptyAssistant;
    const result = [];
    for (let i = 0; i < messages.length; i++) {
      const item = messages[i];
      if (!item) continue;
      if (item.role === "assistant" && item.parentID === msg.id) result.push(item);
    }
    return result;
  }, emptyAssistant, {
    equals: same
  });
  const interrupted = createMemo(() => assistantMessages().some(m => m.error?.name === "MessageAbortedError"));
  const divider = createMemo(() => {
    if (compaction()) return i18n.t("ui.messagePart.compaction");
    if (interrupted()) return i18n.t("ui.message.interrupted");
    return "";
  });
  const error = createMemo(() => assistantMessages().find(m => m.error && m.error.name !== "MessageAbortedError")?.error);
  const showAssistantCopyPartID = createMemo(() => {
    const messages = assistantMessages();
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      if (!message) continue;
      const parts = list(data.store.part?.[message.id], emptyParts);
      for (let j = parts.length - 1; j >= 0; j--) {
        const part = parts[j];
        if (!part || part.type !== "text" || !part.text?.trim()) continue;
        return part.id;
      }
    }
    return undefined;
  });
  const errorText = createMemo(() => {
    const msg = error()?.data?.message;
    if (typeof msg === "string") return unwrap(msg);
    if (msg === undefined || msg === null) return "";
    // oxlint-disable-next-line no-base-to-string -- msg is unknown from error data, coercion is intentional
    return unwrap(String(msg));
  });
  const status = createMemo(() => {
    if (props.status !== undefined) return props.status;
    if (typeof props.active === "boolean" && !props.active) return idle;
    return data.store.session_status[props.sessionID] ?? idle;
  });
  const working = createMemo(() => status().type !== "idle" && active());
  const showReasoningSummaries = createMemo(() => props.showReasoningSummaries ?? true);
  const assistantCopyPartID = createMemo(() => {
    if (working()) return null;
    return showAssistantCopyPartID() ?? null;
  });
  const turnDurationMs = createMemo(() => {
    const start = message()?.time.created;
    if (typeof start !== "number") return undefined;
    const end = assistantMessages().reduce((max, item) => {
      const completed = item.time.completed;
      if (typeof completed !== "number") return max;
      if (max === undefined) return completed;
      return Math.max(max, completed);
    }, undefined);
    if (typeof end !== "number") return undefined;
    if (end < start) return undefined;
    return end - start;
  });
  const assistantDerived = createMemo(() => {
    let visible = 0;
    let reason;
    const show = showReasoningSummaries();
    for (const message of assistantMessages()) {
      for (const part of list(data.store.part?.[message.id], emptyParts)) {
        if (partState(part, show) === "visible") {
          visible++;
        }
        if (part.type === "reasoning" && part.text) {
          const h = heading(part.text);
          if (h) reason = h;
        }
      }
    }
    return {
      visible,
      reason
    };
  });
  const assistantVisible = createMemo(() => assistantDerived().visible);
  const reasoningHeading = createMemo(() => assistantDerived().reason);
  const showThinking = createMemo(() => {
    if (!working() || !!error()) return false;
    if (status().type === "retry") return false;
    if (showReasoningSummaries()) return assistantVisible() === 0;
    return true;
  });
  const autoScroll = createAutoScroll({
    working,
    onUserInteracted: props.onUserInteracted,
    overflowAnchor: "dynamic"
  });
  // One accordion row per file diff (For children, _tmpl$0/_tmpl$9/_tmpl$1).
  const buildDiffRow = diff => {
    const view = normalize(diff);
    const rowActive = createMemo(() => expanded().includes(diff.file));
    const [shown, setShown] = createSignal(false);
    createEffect(on(rowActive, value => {
      if (!value) {
        setShown(false);
        return;
      }
      requestAnimationFrame(() => {
        if (!rowActive()) return;
        setShown(true);
      });
    }, {
      defer: true
    }));
    return createComponent(Accordion.Item, {
      get value() {
        return diff.file;
      },
      get children() {
        return [createComponent(StickyAccordionHeader, {
          get children() {
            return createComponent(Accordion.Trigger, {
              get children() {
                // diff is static per row (For is reference-keyed), so the
                // path/filename writes are one-shot like the compiled thunks.
                const trigger = template(`<div data-slot="session-turn-diff-trigger"><span data-slot="session-turn-diff-path"><span data-slot="session-turn-diff-filename"></span></span><div data-slot="session-turn-diff-meta"><span data-slot="session-turn-diff-changes"></span><span data-slot="session-turn-diff-chevron"></span></div></div>`);
                const path = trigger.firstChild;
                const filename = path.firstChild;
                const meta = path.nextSibling;
                const changes = meta.firstChild;
                const chevron = changes.nextSibling;
                // Show(diff.file.includes("/")): static condition -> plain if.
                if (diff.file.includes("/")) {
                  const directory = template(`<span data-slot="session-turn-diff-directory"></span>`);
                  directory.textContent = `\u202A${getDirectory(diff.file)}\u202C`;
                  path.insertBefore(directory, filename);
                }
                filename.textContent = getFilename(diff.file);
                // DiffChanges returns a memo accessor; insert() resolves it.
                _solidInsert(changes, createComponent(DiffChanges, {
                  changes: diff
                }));
                chevron.appendChild(createComponent(Icon, {
                  name: "chevron-down",
                  size: "small"
                }));
                return trigger;
              }
            });
          }
        }), createComponent(Accordion.Content, {
          get children() {
            // Kobalte presence-gated content: keep the Show + insert() path.
            return createComponent(Show, {
              get when() {
                return shown();
              },
              get children() {
                const viewEl = template(`<div data-slot="session-turn-diff-view" data-scrollable></div>`);
                _solidInsert(viewEl, createComponent(Dynamic, {
                  component: fileComponent,
                  mode: "diff",
                  get fileDiff() {
                    return view.fileDiff;
                  }
                }));
                return viewEl;
              }
            });
          }
        })];
      }
    });
  };

  // Diffs summary group (_tmpl$6).
  const buildDiffs = () => {
    const group = template(`<div data-slot="session-turn-diffs" data-component="session-turn-diffs-group"><div data-slot="session-turn-diffs-header"><span data-slot="session-turn-diffs-label"></span></div><div data-component="session-turn-diffs-content"></div></div>`);
    const header = group.firstChild;
    const label = header.firstChild;
    const content = header.nextSibling;
    // Label: "<count> <changed> <file(s)>" as three live text nodes around the
    // static spaces, matching the compiled inserts into the label span.
    const countText = document.createTextNode("");
    const changedText = document.createTextNode("");
    const fileText = document.createTextNode("");
    label.replaceChildren(countText, document.createTextNode(" "), changedText, document.createTextNode(" "), fileText);
    createRenderEffect(() => {
      countText.data = String(edited());
    });
    createRenderEffect(() => {
      changedText.data = i18n.t("ui.sessionTurn.diffs.changed");
    });
    createRenderEffect(() => {
      fileText.data = i18n.t(edited() === 1 ? "ui.common.file.one" : "ui.common.file.other");
    });
    // Aggregate +/- counts (memo accessor; insert() resolves it).
    _solidInsert(header, createComponent(DiffChanges, {
      get changes() {
        return diffs();
      }
    }), null);
    // Show all / show less toggle.
    _solidInsert(header, createComponent(Show, {
      get when() {
        return overflow() > 0;
      },
      get children() {
        const toggle = template(`<span data-slot="session-turn-diffs-toggle"></span>`);
        toggle.addEventListener("click", toggleAll);
        createRenderEffect(() => {
          toggle.textContent = showAll() ? i18n.t("ui.sessionTurn.diffs.showLess") : i18n.t("ui.sessionTurn.diffs.showAll");
        });
        return toggle;
      }
    }), null);
    // Per-file accordion.
    _solidInsert(content, createComponent(Accordion, {
      multiple: true,
      style: {
        "--sticky-accordion-offset": "44px"
      },
      get value() {
        return expanded();
      },
      onChange: value => setState("expanded", Array.isArray(value) ? value : value ? [value] : []),
      get children() {
        return createComponent(For, {
          get each() {
            return visible();
          },
          children: diff => buildDiffRow(diff)
        });
      }
    }), null);
    // "+N more" hint while collapsed.
    _solidInsert(content, createComponent(Show, {
      get when() {
        return !showAll() && overflow() > 0;
      },
      get children() {
        const more = template(`<div data-slot="session-turn-diffs-more"></div>`);
        more.addEventListener("click", toggleAll);
        createRenderEffect(() => {
          more.textContent = i18n.t("ui.sessionTurn.diffs.more", {
            count: String(overflow())
          });
        });
        return more;
      }
    }), null);
    // Mirrors compiled setAttribute(showAll() || undefined): the attribute is
    // removed while false and set to "true" while expanded.
    createRenderEffect(() => {
      const value = showAll() || undefined;
      if (value == null) group.removeAttribute("data-show-all");
      else group.setAttribute("data-show-all", value);
    });
    return group;
  };

  // ----- Turn body (children of Show(message()), _tmpl$7) -----
  const buildTurn = () => {
    const container = template(`<div data-slot="session-turn-message-container"><div data-slot="session-turn-message-content" aria-live="off"></div></div>`);
    const messageHost = container.firstChild;
    // Ref binding, mirroring the compiled use(): contentRef is a function in
    // the current createAutoScroll, but keep the compiled dual branch.
    const contentRef = autoScroll.contentRef;
    if (typeof contentRef === "function") contentRef(container);
    else autoScroll.contentRef = container;
    // User message. Message (compiled) returns Show accessors, so it must be
    // reconciled through solid's insert().
    _solidInsert(messageHost, createComponent(Message, {
      get message() {
        return message();
      },
      get parts() {
        return parts();
      },
      get actions() {
        return props.actions;
      }
    }));
    // Compaction/interruption divider.
    _solidInsert(container, createComponent(Show, {
      get when() {
        return divider();
      },
      get children() {
        const el = template(`<div data-slot="session-turn-compaction"></div>`);
        _solidInsert(el, createComponent(MessageDivider, {
          get label() {
            return divider();
          }
        }));
        return el;
      }
    }), null);
    // Assistant parts.
    _solidInsert(container, createComponent(Show, {
      get when() {
        return assistantMessages().length > 0;
      },
      get children() {
        const el = template(`<div data-slot="session-turn-assistant-content"></div>`);
        _solidInsert(el, createComponent(AssistantParts, {
          get messages() {
            return assistantMessages();
          },
          get showAssistantCopyPartID() {
            return assistantCopyPartID();
          },
          get turnDurationMs() {
            return turnDurationMs();
          },
          get working() {
            return working();
          },
          get showReasoningSummaries() {
            return showReasoningSummaries();
          },
          get shellToolDefaultOpen() {
            return props.shellToolDefaultOpen;
          },
          get editToolDefaultOpen() {
            return props.editToolDefaultOpen;
          }
        }));
        // Mirrors the compiled setAttribute(): the boolean stringifies to
        // "true"/"false" and the attribute is never removed.
        createRenderEffect(() => {
          el.setAttribute("aria-hidden", working());
        });
        return el;
      }
    }), null);
    // Thinking shimmer (+ reasoning heading reveal when summaries are hidden).
    _solidInsert(container, createComponent(Show, {
      get when() {
        return showThinking();
      },
      get children() {
        const el = template(`<div data-slot="session-turn-thinking"></div>`);
        el.appendChild(createComponent(TextShimmer, {
          get text() {
            return i18n.t("ui.sessionTurn.status.thinking");
          }
        }));
        _solidInsert(el, createComponent(Show, {
          get when() {
            return !showReasoningSummaries();
          },
          get children() {
            return createComponent(TextReveal, {
              get text() {
                return reasoningHeading();
              },
              "class": "session-turn-thinking-heading",
              travel: 25,
              duration: 700
            });
          }
        }), null);
        return el;
      }
    }), null);
    // Retry banner. SessionRetry returns a memo accessor; insert() resolves it.
    _solidInsert(container, createComponent(SessionRetry, {
      get status() {
        return status();
      },
      get show() {
        return active();
      }
    }), null);
    // Diffs summary group: only after the turn settled.
    _solidInsert(container, createComponent(Show, {
      get when() {
        return edited() > 0 && !working();
      },
      get children() {
        return buildDiffs();
      }
    }), null);
    // Assistant error card. The children getter is read once per mount by the
    // vanilla Card (mount-time snapshot), matching current behavior.
    _solidInsert(container, createComponent(Show, {
      get when() {
        return error();
      },
      get children() {
        return createComponent(Card, {
          variant: "error",
          "class": "error-card",
          get children() {
            return errorText();
          }
        });
      }
    }), null);
    // Change-guarded data-message / container class, mirroring the compiled
    // effect block (className: nullish removes the attribute, the initial
    // undefined is skipped by the guard).
    let prevMessage;
    let prevContainerClass;
    createRenderEffect(() => {
      const nextMessage = message().id;
      const nextClass = props.classes?.container;
      if (nextMessage !== prevMessage) container.setAttribute("data-message", prevMessage = nextMessage);
      if (nextClass !== prevContainerClass) {
        prevContainerClass = nextClass;
        if (nextClass == null) container.removeAttribute("class");
        else container.className = nextClass;
      }
    });
    return container;
  };

  // ----- Static skeleton (_tmpl$8): root > scroll container > click area ----
  const rootEl = template(`<div data-component="session-turn"><div data-slot="session-turn-content"><div></div></div></div>`);
  const scrollEl = rootEl.firstChild;
  const innerEl = scrollEl.firstChild;
  scrollEl.addEventListener("scroll", autoScroll.handleScroll);
  // Ref binding, mirroring the compiled use() branch.
  const scrollRef = autoScroll.scrollRef;
  if (typeof scrollRef === "function") scrollRef(scrollEl);
  else autoScroll.scrollRef = scrollEl;
  // Compiled delegated $$click -> direct listener; descendants' own click
  // handlers still run first, as under Solid's simulated bubbling.
  innerEl.addEventListener("click", autoScroll.handleInteraction);
  // Show(message()), non-keyed: the turn body remounts only when the message
  // appears/disappears, exactly like the compiled Show.
  _solidInsert(innerEl, createComponent(Show, {
    get when() {
      return message();
    },
    get children() {
      return buildTurn();
    }
  }), null);
  // Forwarded children stay reactive through insert(), as compiled.
  _solidInsert(innerEl, () => props.children, null);
  // Change-guarded root/content classes (compiled className() semantics).
  let prevRootClass;
  let prevContentClass;
  createRenderEffect(() => {
    const nextRoot = props.classes?.root;
    const nextContent = props.classes?.content;
    if (nextRoot !== prevRootClass) {
      prevRootClass = nextRoot;
      if (nextRoot == null) rootEl.removeAttribute("class");
      else rootEl.className = nextRoot;
    }
    if (nextContent !== prevContentClass) {
      prevContentClass = nextContent;
      if (nextContent == null) scrollEl.removeAttribute("class");
      else scrollEl.className = nextContent;
    }
  });
  return rootEl;
}