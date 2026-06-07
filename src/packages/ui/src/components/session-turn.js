import { template as _$template } from "solid-js/web";
import { delegateEvents as _$delegateEvents } from "solid-js/web";
import { className as _$className } from "solid-js/web";
import { memo as _$memo } from "solid-js/web";
import { setAttribute as _$setAttribute } from "solid-js/web";
import { effect as _$effect } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
import { addEventListener as _$addEventListener } from "solid-js/web";
import { use as _$use } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<div data-slot=session-turn-compaction>`),
  _tmpl$2 = /*#__PURE__*/_$template(`<div data-slot=session-turn-assistant-content>`),
  _tmpl$3 = /*#__PURE__*/_$template(`<div data-slot=session-turn-thinking>`),
  _tmpl$4 = /*#__PURE__*/_$template(`<span data-slot=session-turn-diffs-toggle>`),
  _tmpl$5 = /*#__PURE__*/_$template(`<div data-slot=session-turn-diffs-more>`),
  _tmpl$6 = /*#__PURE__*/_$template(`<div data-slot=session-turn-diffs data-component=session-turn-diffs-group><div data-slot=session-turn-diffs-header><span data-slot=session-turn-diffs-label> <!> </span></div><div data-component=session-turn-diffs-content>`),
  _tmpl$7 = /*#__PURE__*/_$template(`<div data-slot=session-turn-message-container><div data-slot=session-turn-message-content aria-live=off>`),
  _tmpl$8 = /*#__PURE__*/_$template(`<div data-component=session-turn><div data-slot=session-turn-content><div>`),
  _tmpl$9 = /*#__PURE__*/_$template(`<span data-slot=session-turn-diff-directory>`),
  _tmpl$0 = /*#__PURE__*/_$template(`<div data-slot=session-turn-diff-trigger><span data-slot=session-turn-diff-path><span data-slot=session-turn-diff-filename></span></span><div data-slot=session-turn-diff-meta><span data-slot=session-turn-diff-changes></span><span data-slot=session-turn-diff-chevron>`),
  _tmpl$1 = /*#__PURE__*/_$template(`<div data-slot=session-turn-diff-view data-scrollable>`);
import { useData } from "../context/index.js";
import { useFileComponent } from "../context/file.js";
import { Binary } from "core/util/binary";
import { getDirectory, getFilename } from "core/util/path";
import { createEffect, createMemo, createSignal, For, on, Show } from "solid-js";
import { createStore } from "solid-js/store";
import { Dynamic } from "solid-js/web";
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
  return (() => {
    var _el$ = _tmpl$8(),
      _el$2 = _el$.firstChild,
      _el$3 = _el$2.firstChild;
    _$addEventListener(_el$2, "scroll", autoScroll.handleScroll);
    var _ref$ = autoScroll.scrollRef;
    typeof _ref$ === "function" ? _$use(_ref$, _el$2) : autoScroll.scrollRef = _el$2;
    _$addEventListener(_el$3, "click", autoScroll.handleInteraction, true);
    _$insert(_el$3, _$createComponent(Show, {
      get when() {
        return message();
      },
      get children() {
        var _el$4 = _tmpl$7(),
          _el$5 = _el$4.firstChild;
        var _ref$2 = autoScroll.contentRef;
        typeof _ref$2 === "function" ? _$use(_ref$2, _el$4) : autoScroll.contentRef = _el$4;
        _$insert(_el$5, _$createComponent(Message, {
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
        _$insert(_el$4, _$createComponent(Show, {
          get when() {
            return divider();
          },
          get children() {
            var _el$6 = _tmpl$();
            _$insert(_el$6, _$createComponent(MessageDivider, {
              get label() {
                return divider();
              }
            }));
            return _el$6;
          }
        }), null);
        _$insert(_el$4, _$createComponent(Show, {
          get when() {
            return assistantMessages().length > 0;
          },
          get children() {
            var _el$7 = _tmpl$2();
            _$insert(_el$7, _$createComponent(AssistantParts, {
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
            _$effect(() => _$setAttribute(_el$7, "aria-hidden", working()));
            return _el$7;
          }
        }), null);
        _$insert(_el$4, _$createComponent(Show, {
          get when() {
            return showThinking();
          },
          get children() {
            var _el$8 = _tmpl$3();
            _$insert(_el$8, _$createComponent(TextShimmer, {
              get text() {
                return i18n.t("ui.sessionTurn.status.thinking");
              }
            }), null);
            _$insert(_el$8, _$createComponent(Show, {
              get when() {
                return !showReasoningSummaries();
              },
              get children() {
                return _$createComponent(TextReveal, {
                  get text() {
                    return reasoningHeading();
                  },
                  "class": "session-turn-thinking-heading",
                  travel: 25,
                  duration: 700
                });
              }
            }), null);
            return _el$8;
          }
        }), null);
        _$insert(_el$4, _$createComponent(SessionRetry, {
          get status() {
            return status();
          },
          get show() {
            return active();
          }
        }), null);
        _$insert(_el$4, _$createComponent(Show, {
          get when() {
            return _$memo(() => edited() > 0)() && !working();
          },
          get children() {
            var _el$9 = _tmpl$6(),
              _el$0 = _el$9.firstChild,
              _el$1 = _el$0.firstChild,
              _el$10 = _el$1.firstChild,
              _el$12 = _el$10.nextSibling,
              _el$11 = _el$12.nextSibling,
              _el$14 = _el$0.nextSibling;
            _$insert(_el$1, edited, _el$10);
            _$insert(_el$1, () => i18n.t("ui.sessionTurn.diffs.changed"), _el$12);
            _$insert(_el$1, () => i18n.t(edited() === 1 ? "ui.common.file.one" : "ui.common.file.other"), null);
            _$insert(_el$0, _$createComponent(DiffChanges, {
              get changes() {
                return diffs();
              }
            }), null);
            _$insert(_el$0, _$createComponent(Show, {
              get when() {
                return overflow() > 0;
              },
              get children() {
                var _el$13 = _tmpl$4();
                _el$13.$$click = toggleAll;
                _$insert(_el$13, (() => {
                  var _c$ = _$memo(() => !!showAll());
                  return () => _c$() ? i18n.t("ui.sessionTurn.diffs.showLess") : i18n.t("ui.sessionTurn.diffs.showAll");
                })());
                return _el$13;
              }
            }), null);
            _$insert(_el$14, _$createComponent(Accordion, {
              multiple: true,
              style: {
                "--sticky-accordion-offset": "44px"
              },
              get value() {
                return expanded();
              },
              onChange: value => setState("expanded", Array.isArray(value) ? value : value ? [value] : []),
              get children() {
                return _$createComponent(For, {
                  get each() {
                    return visible();
                  },
                  children: diff => {
                    const view = normalize(diff);
                    const active = createMemo(() => expanded().includes(diff.file));
                    const [shown, setShown] = createSignal(false);
                    createEffect(on(active, value => {
                      if (!value) {
                        setShown(false);
                        return;
                      }
                      requestAnimationFrame(() => {
                        if (!active()) return;
                        setShown(true);
                      });
                    }, {
                      defer: true
                    }));
                    return _$createComponent(Accordion.Item, {
                      get value() {
                        return diff.file;
                      },
                      get children() {
                        return [_$createComponent(StickyAccordionHeader, {
                          get children() {
                            return _$createComponent(Accordion.Trigger, {
                              get children() {
                                var _el$16 = _tmpl$0(),
                                  _el$17 = _el$16.firstChild,
                                  _el$19 = _el$17.firstChild,
                                  _el$20 = _el$17.nextSibling,
                                  _el$21 = _el$20.firstChild,
                                  _el$22 = _el$21.nextSibling;
                                _$insert(_el$17, _$createComponent(Show, {
                                  get when() {
                                    return diff.file.includes("/");
                                  },
                                  get children() {
                                    var _el$18 = _tmpl$9();
                                    _$insert(_el$18, () => `\u202A${getDirectory(diff.file)}\u202C`);
                                    return _el$18;
                                  }
                                }), _el$19);
                                _$insert(_el$19, () => getFilename(diff.file));
                                _$insert(_el$21, _$createComponent(DiffChanges, {
                                  changes: diff
                                }));
                                _$insert(_el$22, _$createComponent(Icon, {
                                  name: "chevron-down",
                                  size: "small"
                                }));
                                return _el$16;
                              }
                            });
                          }
                        }), _$createComponent(Accordion.Content, {
                          get children() {
                            return _$createComponent(Show, {
                              get when() {
                                return shown();
                              },
                              get children() {
                                var _el$23 = _tmpl$1();
                                _$insert(_el$23, _$createComponent(Dynamic, {
                                  component: fileComponent,
                                  mode: "diff",
                                  get fileDiff() {
                                    return view.fileDiff;
                                  }
                                }));
                                return _el$23;
                              }
                            });
                          }
                        })];
                      }
                    });
                  }
                });
              }
            }), null);
            _$insert(_el$14, _$createComponent(Show, {
              get when() {
                return _$memo(() => !!!showAll())() && overflow() > 0;
              },
              get children() {
                var _el$15 = _tmpl$5();
                _el$15.$$click = toggleAll;
                _$insert(_el$15, () => i18n.t("ui.sessionTurn.diffs.more", {
                  count: String(overflow())
                }));
                return _el$15;
              }
            }), null);
            _$effect(() => _$setAttribute(_el$9, "data-show-all", showAll() || undefined));
            return _el$9;
          }
        }), null);
        _$insert(_el$4, _$createComponent(Show, {
          get when() {
            return error();
          },
          get children() {
            return _$createComponent(Card, {
              variant: "error",
              "class": "error-card",
              get children() {
                return errorText();
              }
            });
          }
        }), null);
        _$effect(_p$ => {
          var _v$ = message().id,
            _v$2 = props.classes?.container;
          _v$ !== _p$.e && _$setAttribute(_el$4, "data-message", _p$.e = _v$);
          _v$2 !== _p$.t && _$className(_el$4, _p$.t = _v$2);
          return _p$;
        }, {
          e: undefined,
          t: undefined
        });
        return _el$4;
      }
    }), null);
    _$insert(_el$3, () => props.children, null);
    _$effect(_p$ => {
      var _v$3 = props.classes?.root,
        _v$4 = props.classes?.content;
      _v$3 !== _p$.e && _$className(_el$, _p$.e = _v$3);
      _v$4 !== _p$.t && _$className(_el$2, _p$.t = _v$4);
      return _p$;
    }, {
      e: undefined,
      t: undefined
    });
    return _el$;
  })();
}
_$delegateEvents(["click"]);