import { memo as _$memo } from "@opentui/solid";
import { createTextNode as _$createTextNode } from "@opentui/solid";
import { effect as _$effect } from "@opentui/solid";
import { insert as _$insert } from "@opentui/solid";
import { insertNode as _$insertNode } from "@opentui/solid";
import { createComponent as _$createComponent } from "@opentui/solid";
import { setProp as _$setProp } from "@opentui/solid";
import { createElement as _$createElement } from "@opentui/solid";
import { useSyncV2 } from "#tui/context/sync-v2.js";
import { SplitBorder } from "#tui/component/border.js";
import { Spinner } from "#tui/component/spinner.js";
import { useTheme } from "#tui/context/theme.js";
import { useLocal } from "#tui/context/local.js";
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/solid";
import { Locale } from "#util/locale.js";
import { LANGUAGE_EXTENSIONS } from "#lsp/language.js";
import path from "path";
import stripAnsi from "strip-ansi";
import { createEffect, createMemo, createSignal, For, Match, Show, Switch } from "solid-js";
const id = "internal:session-v2-debug";
const route = "session.v2.messages";
function currentSessionID(api) {
  const current = api.route.current;
  if (current.name !== "session") return;
  const sessionID = current.params?.sessionID;
  return typeof sessionID === "string" ? sessionID : undefined;
}
function View(props) {
  const sync = useSyncV2();
  const dimensions = useTerminalDimensions();
  const {
    theme,
    syntax,
    subtleSyntax
  } = useTheme();
  const messages = createMemo(() => sync.data.messages[props.sessionID] ?? []);
  const renderedMessages = createMemo(() => messages().toReversed());
  const lastAssistant = createMemo(() => renderedMessages().findLast(message => message.type === "assistant"));
  createEffect(() => {
    void sync.session.message.sync(props.sessionID);
  });
  useKeyboard(event => {
    if (event.name !== "escape") return;
    event.preventDefault();
    event.stopPropagation();
    props.api.route.navigate("session", {
      sessionID: props.sessionID
    });
  });
  return (() => {
    var _el$ = _$createElement("box"),
      _el$2 = _$createElement("box"),
      _el$3 = _$createElement("box"),
      _el$4 = _$createElement("scrollbox"),
      _el$5 = _$createElement("box");
    _$insertNode(_el$, _el$2);
    _$insertNode(_el$2, _el$3);
    _$setProp(_el$2, "flexDirection", "row");
    _$insertNode(_el$3, _el$4);
    _$setProp(_el$3, "flexGrow", 1);
    _$setProp(_el$3, "paddingBottom", 1);
    _$setProp(_el$3, "paddingLeft", 2);
    _$setProp(_el$3, "paddingRight", 2);
    _$setProp(_el$3, "gap", 1);
    _$insertNode(_el$4, _el$5);
    _$setProp(_el$4, "viewportOptions", {
      paddingRight: 0
    });
    _$setProp(_el$4, "verticalScrollbarOptions", {
      visible: false
    });
    _$setProp(_el$4, "stickyScroll", true);
    _$setProp(_el$4, "stickyStart", "bottom");
    _$setProp(_el$4, "flexGrow", 1);
    _$setProp(_el$5, "height", 1);
    _$insert(_el$4, _$createComponent(Show, {
      get when() {
        return messages().length === 0;
      },
      get children() {
        return _$createComponent(MissingData, {
          label: "Messages",
          detail: "No v2 messages loaded from useSyncV2 yet."
        });
      }
    }), null);
    _$insert(_el$4, _$createComponent(For, {
      get each() {
        return renderedMessages();
      },
      children: (message, index) => _$createComponent(Switch, {
        get children() {
          return [_$createComponent(Match, {
            get when() {
              return message.type === "user";
            },
            get children() {
              return _$createComponent(UserMessage, {
                message: message,
                get index() {
                  return index();
                }
              });
            }
          }), _$createComponent(Match, {
            get when() {
              return message.type === "assistant";
            },
            get children() {
              return _$createComponent(AssistantMessage, {
                message: message,
                get last() {
                  return lastAssistant()?.id === message.id;
                },
                get syntax() {
                  return syntax();
                },
                get subtleSyntax() {
                  return subtleSyntax();
                }
              });
            }
          }), _$createComponent(Match, {
            get when() {
              return message.type === "synthetic";
            },
            get children() {
              return _$createComponent(SyntheticMessage, {
                message: message,
                get index() {
                  return index();
                }
              });
            }
          }), _$createComponent(Match, {
            get when() {
              return message.type === "shell";
            },
            get children() {
              return _$createComponent(ShellMessage, {
                message: message
              });
            }
          }), _$createComponent(Match, {
            get when() {
              return message.type === "compaction";
            },
            get children() {
              return _$createComponent(CompactionMessage, {
                message: message
              });
            }
          }), _$createComponent(Match, {
            get when() {
              return message.type === "agent-switched";
            },
            get children() {
              return _$createComponent(AgentSwitchedMessage, {
                message: message
              });
            }
          }), _$createComponent(Match, {
            get when() {
              return message.type === "model-switched";
            },
            get children() {
              return _$createComponent(ModelSwitchedMessage, {
                message: message
              });
            }
          }), _$createComponent(Match, {
            when: true,
            get children() {
              return _$createComponent(UnknownMessage, {
                message: message
              });
            }
          })];
        }
      })
    }), null);
    _$insert(_el$3, _$createComponent(MissingData, {
      label: "Session prompt, permission prompt, question prompt, sidebar",
      detail: "The v2 message endpoint only exposes messages, so these session UI regions cannot be rendered here. Press Esc to return to the live session."
    }), null);
    _$effect(_p$ => {
      var _v$ = dimensions().width,
        _v$2 = dimensions().height,
        _v$3 = theme.background;
      _v$ !== _p$.e && (_p$.e = _$setProp(_el$, "width", _v$, _p$.e));
      _v$2 !== _p$.t && (_p$.t = _$setProp(_el$, "height", _v$2, _p$.t));
      _v$3 !== _p$.a && (_p$.a = _$setProp(_el$, "backgroundColor", _v$3, _p$.a));
      return _p$;
    }, {
      e: undefined,
      t: undefined,
      a: undefined
    });
    return _el$;
  })();
}
function MissingData(props) {
  const {
    theme
  } = useTheme();
  return (() => {
    var _el$6 = _$createElement("box"),
      _el$7 = _$createElement("text"),
      _el$8 = _$createElement("span"),
      _el$0 = _$createTextNode(` `),
      _el$1 = _$createElement("text");
    _$insertNode(_el$6, _el$7);
    _$insertNode(_el$6, _el$1);
    _$setProp(_el$6, "border", ["left"]);
    _$setProp(_el$6, "paddingLeft", 2);
    _$setProp(_el$6, "paddingTop", 1);
    _$setProp(_el$6, "paddingBottom", 1);
    _$setProp(_el$6, "marginTop", 1);
    _$setProp(_el$6, "flexShrink", 0);
    _$insertNode(_el$7, _el$8);
    _$insertNode(_el$7, _el$0);
    _$insertNode(_el$8, _$createTextNode(` MISSING DATA `));
    _$insert(_el$7, () => props.label, null);
    _$insert(_el$1, () => props.detail);
    _$effect(_p$ => {
      var _v$4 = SplitBorder.customBorderChars,
        _v$5 = theme.warning,
        _v$6 = theme.backgroundPanel,
        _v$7 = theme.text,
        _v$8 = {
          bg: theme.warning,
          fg: theme.background,
          bold: true
        },
        _v$9 = theme.textMuted;
      _v$4 !== _p$.e && (_p$.e = _$setProp(_el$6, "customBorderChars", _v$4, _p$.e));
      _v$5 !== _p$.t && (_p$.t = _$setProp(_el$6, "borderColor", _v$5, _p$.t));
      _v$6 !== _p$.a && (_p$.a = _$setProp(_el$6, "backgroundColor", _v$6, _p$.a));
      _v$7 !== _p$.o && (_p$.o = _$setProp(_el$7, "fg", _v$7, _p$.o));
      _v$8 !== _p$.i && (_p$.i = _$setProp(_el$8, "style", _v$8, _p$.i));
      _v$9 !== _p$.n && (_p$.n = _$setProp(_el$1, "fg", _v$9, _p$.n));
      return _p$;
    }, {
      e: undefined,
      t: undefined,
      a: undefined,
      o: undefined,
      i: undefined,
      n: undefined
    });
    return _el$6;
  })();
}
function UserMessage(props) {
  const {
    theme
  } = useTheme();
  const attachments = createMemo(() => [...(props.message.files ?? []), ...(props.message.agents ?? [])]);
  return (() => {
    var _el$10 = _$createElement("box"),
      _el$11 = _$createElement("box"),
      _el$14 = _$createElement("text");
    _$insertNode(_el$10, _el$11);
    _$setProp(_el$10, "border", ["left"]);
    _$setProp(_el$10, "flexShrink", 0);
    _$insertNode(_el$11, _el$14);
    _$setProp(_el$11, "paddingTop", 1);
    _$setProp(_el$11, "paddingBottom", 1);
    _$setProp(_el$11, "paddingLeft", 2);
    _$insert(_el$11, _$createComponent(Show, {
      get when() {
        return props.message.text.trim();
      },
      get fallback() {
        return _$createComponent(MissingData, {
          label: "User message text",
          get detail() {
            return `Message ${props.message.id} has no text field content.`;
          }
        });
      },
      get children() {
        var _el$12 = _$createElement("text");
        _$insert(_el$12, () => props.message.text);
        _$effect(_$p => _$setProp(_el$12, "fg", theme.text, _$p));
        return _el$12;
      }
    }), _el$14);
    _$insert(_el$11, _$createComponent(Show, {
      get when() {
        return attachments().length;
      },
      get children() {
        var _el$13 = _$createElement("box");
        _$setProp(_el$13, "flexDirection", "row");
        _$setProp(_el$13, "paddingTop", 1);
        _$setProp(_el$13, "gap", 1);
        _$setProp(_el$13, "flexWrap", "wrap");
        _$insert(_el$13, _$createComponent(For, {
          get each() {
            return props.message.files ?? [];
          },
          children: file => (() => {
            var _el$15 = _$createElement("text"),
              _el$16 = _$createElement("span"),
              _el$17 = _$createTextNode(` `),
              _el$18 = _$createTextNode(` `),
              _el$19 = _$createElement("span"),
              _el$20 = _$createTextNode(` `),
              _el$21 = _$createTextNode(` `);
            _$insertNode(_el$15, _el$16);
            _$insertNode(_el$15, _el$19);
            _$insertNode(_el$16, _el$17);
            _$insertNode(_el$16, _el$18);
            _$insert(_el$16, () => file.mime, _el$18);
            _$insertNode(_el$19, _el$20);
            _$insertNode(_el$19, _el$21);
            _$insert(_el$19, () => file.name ?? file.uri, _el$21);
            _$effect(_p$ => {
              var _v$14 = theme.text,
                _v$15 = {
                  bg: theme.secondary,
                  fg: theme.background
                },
                _v$16 = {
                  bg: theme.backgroundElement,
                  fg: theme.textMuted
                };
              _v$14 !== _p$.e && (_p$.e = _$setProp(_el$15, "fg", _v$14, _p$.e));
              _v$15 !== _p$.t && (_p$.t = _$setProp(_el$16, "style", _v$15, _p$.t));
              _v$16 !== _p$.a && (_p$.a = _$setProp(_el$19, "style", _v$16, _p$.a));
              return _p$;
            }, {
              e: undefined,
              t: undefined,
              a: undefined
            });
            return _el$15;
          })()
        }), null);
        _$insert(_el$13, _$createComponent(For, {
          get each() {
            return props.message.agents ?? [];
          },
          children: agent => (() => {
            var _el$22 = _$createElement("text"),
              _el$23 = _$createElement("span"),
              _el$25 = _$createElement("span"),
              _el$26 = _$createTextNode(` `),
              _el$27 = _$createTextNode(` `);
            _$insertNode(_el$22, _el$23);
            _$insertNode(_el$22, _el$25);
            _$insertNode(_el$23, _$createTextNode(` agent `));
            _$insertNode(_el$25, _el$26);
            _$insertNode(_el$25, _el$27);
            _$insert(_el$25, () => agent.name, _el$27);
            _$effect(_p$ => {
              var _v$17 = theme.text,
                _v$18 = {
                  bg: theme.accent,
                  fg: theme.background
                },
                _v$19 = {
                  bg: theme.backgroundElement,
                  fg: theme.textMuted
                };
              _v$17 !== _p$.e && (_p$.e = _$setProp(_el$22, "fg", _v$17, _p$.e));
              _v$18 !== _p$.t && (_p$.t = _$setProp(_el$23, "style", _v$18, _p$.t));
              _v$19 !== _p$.a && (_p$.a = _$setProp(_el$25, "style", _v$19, _p$.a));
              return _p$;
            }, {
              e: undefined,
              t: undefined,
              a: undefined
            });
            return _el$22;
          })()
        }), null);
        return _el$13;
      }
    }), _el$14);
    _$insert(_el$14, () => Locale.todayTimeOrDateTime(props.message.time.created));
    _$effect(_p$ => {
      var _v$0 = props.message.id,
        _v$1 = theme.primary,
        _v$10 = SplitBorder.customBorderChars,
        _v$11 = props.index === 0 ? 0 : 1,
        _v$12 = theme.backgroundPanel,
        _v$13 = theme.textMuted;
      _v$0 !== _p$.e && (_p$.e = _$setProp(_el$10, "id", _v$0, _p$.e));
      _v$1 !== _p$.t && (_p$.t = _$setProp(_el$10, "borderColor", _v$1, _p$.t));
      _v$10 !== _p$.a && (_p$.a = _$setProp(_el$10, "customBorderChars", _v$10, _p$.a));
      _v$11 !== _p$.o && (_p$.o = _$setProp(_el$10, "marginTop", _v$11, _p$.o));
      _v$12 !== _p$.i && (_p$.i = _$setProp(_el$11, "backgroundColor", _v$12, _p$.i));
      _v$13 !== _p$.n && (_p$.n = _$setProp(_el$14, "fg", _v$13, _p$.n));
      return _p$;
    }, {
      e: undefined,
      t: undefined,
      a: undefined,
      o: undefined,
      i: undefined,
      n: undefined
    });
    return _el$10;
  })();
}
function SyntheticMessage(props) {
  const {
    theme
  } = useTheme();
  return (() => {
    var _el$28 = _$createElement("box"),
      _el$29 = _$createElement("text"),
      _el$31 = _$createElement("text");
    _$insertNode(_el$28, _el$29);
    _$insertNode(_el$28, _el$31);
    _$setProp(_el$28, "border", ["left"]);
    _$setProp(_el$28, "paddingLeft", 2);
    _$setProp(_el$28, "paddingTop", 1);
    _$setProp(_el$28, "paddingBottom", 1);
    _$setProp(_el$28, "flexShrink", 0);
    _$insertNode(_el$29, _$createTextNode(`Synthetic`));
    _$insert(_el$31, () => props.message.text);
    _$effect(_p$ => {
      var _v$20 = props.message.id,
        _v$21 = theme.backgroundElement,
        _v$22 = SplitBorder.customBorderChars,
        _v$23 = props.index === 0 ? 0 : 1,
        _v$24 = theme.backgroundPanel,
        _v$25 = theme.textMuted,
        _v$26 = theme.text;
      _v$20 !== _p$.e && (_p$.e = _$setProp(_el$28, "id", _v$20, _p$.e));
      _v$21 !== _p$.t && (_p$.t = _$setProp(_el$28, "borderColor", _v$21, _p$.t));
      _v$22 !== _p$.a && (_p$.a = _$setProp(_el$28, "customBorderChars", _v$22, _p$.a));
      _v$23 !== _p$.o && (_p$.o = _$setProp(_el$28, "marginTop", _v$23, _p$.o));
      _v$24 !== _p$.i && (_p$.i = _$setProp(_el$28, "backgroundColor", _v$24, _p$.i));
      _v$25 !== _p$.n && (_p$.n = _$setProp(_el$29, "fg", _v$25, _p$.n));
      _v$26 !== _p$.s && (_p$.s = _$setProp(_el$31, "fg", _v$26, _p$.s));
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
    return _el$28;
  })();
}
function ShellMessage(props) {
  const {
    theme
  } = useTheme();
  const output = createMemo(() => stripAnsi(props.message.output.trim()));
  const [expanded, setExpanded] = createSignal(false);
  const lines = createMemo(() => output().split("\n"));
  const overflow = createMemo(() => lines().length > 10);
  const limited = createMemo(() => {
    if (expanded() || !overflow()) return output();
    return [...lines().slice(0, 10), "…"].join("\n");
  });
  return _$createComponent(BlockTool, {
    title: "# Shell",
    get spinner() {
      return !props.message.time.completed;
    },
    get onClick() {
      return overflow() ? () => setExpanded(prev => !prev) : undefined;
    },
    get children() {
      var _el$32 = _$createElement("box"),
        _el$33 = _$createElement("text"),
        _el$34 = _$createTextNode(`$ `);
      _$insertNode(_el$32, _el$33);
      _$setProp(_el$32, "gap", 1);
      _$insertNode(_el$33, _el$34);
      _$insert(_el$33, () => props.message.command, null);
      _$insert(_el$32, _$createComponent(Show, {
        get when() {
          return output();
        },
        get children() {
          var _el$35 = _$createElement("text");
          _$insert(_el$35, limited);
          _$effect(_$p => _$setProp(_el$35, "fg", theme.text, _$p));
          return _el$35;
        }
      }), null);
      _$insert(_el$32, _$createComponent(Show, {
        get when() {
          return overflow();
        },
        get children() {
          var _el$36 = _$createElement("text");
          _$insert(_el$36, () => expanded() ? "Click to collapse" : "Click to expand");
          _$effect(_$p => _$setProp(_el$36, "fg", theme.textMuted, _$p));
          return _el$36;
        }
      }), null);
      _$effect(_$p => _$setProp(_el$33, "fg", theme.text, _$p));
      return _el$32;
    }
  });
}
function CompactionMessage(props) {
  const {
    theme
  } = useTheme();
  return (() => {
    var _el$37 = _$createElement("box");
    _$setProp(_el$37, "marginTop", 1);
    _$setProp(_el$37, "border", ["top"]);
    _$setProp(_el$37, "titleAlignment", "center");
    _$setProp(_el$37, "flexShrink", 0);
    _$insert(_el$37, _$createComponent(Show, {
      get when() {
        return props.message.summary;
      },
      get children() {
        var _el$38 = _$createElement("text");
        _$insert(_el$38, () => props.message.summary);
        _$effect(_$p => _$setProp(_el$38, "fg", theme.textMuted, _$p));
        return _el$38;
      }
    }));
    _$effect(_p$ => {
      var _v$27 = props.message.reason === "auto" ? " Auto Compaction " : " Compaction ",
        _v$28 = theme.borderActive;
      _v$27 !== _p$.e && (_p$.e = _$setProp(_el$37, "title", _v$27, _p$.e));
      _v$28 !== _p$.t && (_p$.t = _$setProp(_el$37, "borderColor", _v$28, _p$.t));
      return _p$;
    }, {
      e: undefined,
      t: undefined
    });
    return _el$37;
  })();
}
function AgentSwitchedMessage(props) {
  const {
    theme
  } = useTheme();
  const local = useLocal();
  return (() => {
    var _el$39 = _$createElement("box"),
      _el$40 = _$createElement("text"),
      _el$41 = _$createElement("span"),
      _el$43 = _$createElement("span"),
      _el$45 = _$createElement("span");
    _$insertNode(_el$39, _el$40);
    _$setProp(_el$39, "paddingLeft", 3);
    _$setProp(_el$39, "marginTop", 1);
    _$setProp(_el$39, "flexShrink", 0);
    _$insertNode(_el$40, _el$41);
    _$insertNode(_el$40, _el$43);
    _$insertNode(_el$40, _el$45);
    _$insertNode(_el$41, _$createTextNode(`▣ `));
    _$insertNode(_el$43, _$createTextNode(`Switched agent to `));
    _$insert(_el$45, () => Locale.titlecase(props.message.agent));
    _$effect(_p$ => {
      var _v$29 = {
          fg: local.agent.color(props.message.agent)
        },
        _v$30 = {
          fg: theme.textMuted
        },
        _v$31 = {
          fg: theme.text
        };
      _v$29 !== _p$.e && (_p$.e = _$setProp(_el$41, "style", _v$29, _p$.e));
      _v$30 !== _p$.t && (_p$.t = _$setProp(_el$43, "style", _v$30, _p$.t));
      _v$31 !== _p$.a && (_p$.a = _$setProp(_el$45, "style", _v$31, _p$.a));
      return _p$;
    }, {
      e: undefined,
      t: undefined,
      a: undefined
    });
    return _el$39;
  })();
}
function ModelSwitchedMessage(props) {
  const {
    theme
  } = useTheme();
  const model = createMemo(() => {
    const variant = props.message.model.variant ? `/${props.message.model.variant}` : "";
    return `${props.message.model.providerID}/${props.message.model.id}${variant}`;
  });
  return (() => {
    var _el$46 = _$createElement("box"),
      _el$47 = _$createElement("text"),
      _el$48 = _$createElement("span"),
      _el$50 = _$createElement("span"),
      _el$52 = _$createElement("span");
    _$insertNode(_el$46, _el$47);
    _$setProp(_el$46, "paddingLeft", 3);
    _$setProp(_el$46, "marginTop", 1);
    _$setProp(_el$46, "flexShrink", 0);
    _$insertNode(_el$47, _el$48);
    _$insertNode(_el$47, _el$50);
    _$insertNode(_el$47, _el$52);
    _$insertNode(_el$48, _$createTextNode(`◇ `));
    _$insertNode(_el$50, _$createTextNode(`Switched model to `));
    _$insert(_el$52, model);
    _$effect(_p$ => {
      var _v$32 = {
          fg: theme.secondary
        },
        _v$33 = {
          fg: theme.textMuted
        },
        _v$34 = {
          fg: theme.text
        };
      _v$32 !== _p$.e && (_p$.e = _$setProp(_el$48, "style", _v$32, _p$.e));
      _v$33 !== _p$.t && (_p$.t = _$setProp(_el$50, "style", _v$33, _p$.t));
      _v$34 !== _p$.a && (_p$.a = _$setProp(_el$52, "style", _v$34, _p$.a));
      return _p$;
    }, {
      e: undefined,
      t: undefined,
      a: undefined
    });
    return _el$46;
  })();
}
function UnknownMessage(props) {
  return _$createComponent(MissingData, {
    label: "Unknown message type",
    get detail() {
      return JSON.stringify(props.message);
    }
  });
}
function AssistantMessage(props) {
  const {
    theme
  } = useTheme();
  const local = useLocal();
  const duration = createMemo(() => {
    if (!props.message.time.completed) return 0;
    return props.message.time.completed - props.message.time.created;
  });
  const model = createMemo(() => {
    const variant = props.message.model.variant ? `/${props.message.model.variant}` : "";
    return `${props.message.model.providerID}/${props.message.model.id}${variant}`;
  });
  const final = createMemo(() => props.message.finish && !["tool-calls", "unknown"].includes(props.message.finish));
  return [_$createComponent(For, {
    get each() {
      return props.message.content;
    },
    children: part => _$createComponent(Switch, {
      get children() {
        return [_$createComponent(Match, {
          get when() {
            return part.type === "text";
          },
          get children() {
            return _$createComponent(AssistantText, {
              part: part,
              get syntax() {
                return props.syntax;
              }
            });
          }
        }), _$createComponent(Match, {
          get when() {
            return part.type === "reasoning";
          },
          get children() {
            return _$createComponent(AssistantReasoning, {
              part: part,
              get subtleSyntax() {
                return props.subtleSyntax;
              }
            });
          }
        }), _$createComponent(Match, {
          get when() {
            return part.type === "tool";
          },
          get children() {
            return _$createComponent(AssistantTool, {
              part: part
            });
          }
        })];
      }
    })
  }), _$createComponent(Show, {
    get when() {
      return props.message.content.length === 0;
    },
    get children() {
      return _$createComponent(MissingData, {
        label: "Assistant content",
        get detail() {
          return `Assistant message ${props.message.id} has no content items.`;
        }
      });
    }
  }), _$createComponent(Show, {
    get when() {
      return props.message.error;
    },
    get children() {
      var _el$53 = _$createElement("box"),
        _el$54 = _$createElement("text");
      _$insertNode(_el$53, _el$54);
      _$setProp(_el$53, "border", ["left"]);
      _$setProp(_el$53, "paddingTop", 1);
      _$setProp(_el$53, "paddingBottom", 1);
      _$setProp(_el$53, "paddingLeft", 2);
      _$setProp(_el$53, "marginTop", 1);
      _$setProp(_el$53, "flexShrink", 0);
      _$insert(_el$54, () => props.message.error);
      _$effect(_p$ => {
        var _v$35 = theme.backgroundPanel,
          _v$36 = SplitBorder.customBorderChars,
          _v$37 = theme.error,
          _v$38 = theme.textMuted;
        _v$35 !== _p$.e && (_p$.e = _$setProp(_el$53, "backgroundColor", _v$35, _p$.e));
        _v$36 !== _p$.t && (_p$.t = _$setProp(_el$53, "customBorderChars", _v$36, _p$.t));
        _v$37 !== _p$.a && (_p$.a = _$setProp(_el$53, "borderColor", _v$37, _p$.a));
        _v$38 !== _p$.o && (_p$.o = _$setProp(_el$54, "fg", _v$38, _p$.o));
        return _p$;
      }, {
        e: undefined,
        t: undefined,
        a: undefined,
        o: undefined
      });
      return _el$53;
    }
  }), _$createComponent(Show, {
    get when() {
      return props.last || final() || props.message.error;
    },
    get children() {
      var _el$55 = _$createElement("box"),
        _el$56 = _$createElement("text"),
        _el$57 = _$createElement("span"),
        _el$59 = _$createElement("span"),
        _el$60 = _$createElement("span"),
        _el$61 = _$createTextNode(` · `);
      _$insertNode(_el$55, _el$56);
      _$setProp(_el$55, "paddingLeft", 3);
      _$setProp(_el$55, "flexShrink", 0);
      _$insertNode(_el$56, _el$57);
      _$insertNode(_el$56, _el$59);
      _$insertNode(_el$56, _el$60);
      _$setProp(_el$56, "marginTop", 1);
      _$insertNode(_el$57, _$createTextNode(`▣ `));
      _$insert(_el$59, () => Locale.titlecase(props.message.agent));
      _$insertNode(_el$60, _el$61);
      _$insert(_el$60, model, null);
      _$insert(_el$56, _$createComponent(Show, {
        get when() {
          return duration();
        },
        get children() {
          var _el$62 = _$createElement("span"),
            _el$63 = _$createTextNode(` · `);
          _$insertNode(_el$62, _el$63);
          _$insert(_el$62, () => Locale.duration(duration()), null);
          _$effect(_$p => _$setProp(_el$62, "style", {
            fg: theme.textMuted
          }, _$p));
          return _el$62;
        }
      }), null);
      _$effect(_p$ => {
        var _v$39 = {
            fg: local.agent.color(props.message.agent)
          },
          _v$40 = {
            fg: theme.text
          },
          _v$41 = {
            fg: theme.textMuted
          };
        _v$39 !== _p$.e && (_p$.e = _$setProp(_el$57, "style", _v$39, _p$.e));
        _v$40 !== _p$.t && (_p$.t = _$setProp(_el$59, "style", _v$40, _p$.t));
        _v$41 !== _p$.a && (_p$.a = _$setProp(_el$60, "style", _v$41, _p$.a));
        return _p$;
      }, {
        e: undefined,
        t: undefined,
        a: undefined
      });
      return _el$55;
    }
  })];
}
function AssistantText(props) {
  const {
    theme
  } = useTheme();
  return _$createComponent(Show, {
    get when() {
      return props.part.text.trim();
    },
    get children() {
      var _el$64 = _$createElement("box"),
        _el$65 = _$createElement("code");
      _$insertNode(_el$64, _el$65);
      _$setProp(_el$64, "paddingLeft", 3);
      _$setProp(_el$64, "marginTop", 1);
      _$setProp(_el$64, "flexShrink", 0);
      _$setProp(_el$65, "filetype", "markdown");
      _$setProp(_el$65, "drawUnstyledText", false);
      _$setProp(_el$65, "streaming", true);
      _$setProp(_el$65, "conceal", true);
      _$effect(_p$ => {
        var _v$42 = props.syntax,
          _v$43 = props.part.text.trim(),
          _v$44 = theme.text;
        _v$42 !== _p$.e && (_p$.e = _$setProp(_el$65, "syntaxStyle", _v$42, _p$.e));
        _v$43 !== _p$.t && (_p$.t = _$setProp(_el$65, "content", _v$43, _p$.t));
        _v$44 !== _p$.a && (_p$.a = _$setProp(_el$65, "fg", _v$44, _p$.a));
        return _p$;
      }, {
        e: undefined,
        t: undefined,
        a: undefined
      });
      return _el$64;
    }
  });
}
function AssistantReasoning(props) {
  const {
    theme
  } = useTheme();
  const content = createMemo(() => props.part.text.replace("[REDACTED]", "").trim());
  return _$createComponent(Show, {
    get when() {
      return content();
    },
    get children() {
      var _el$66 = _$createElement("box"),
        _el$67 = _$createElement("code");
      _$insertNode(_el$66, _el$67);
      _$setProp(_el$66, "paddingLeft", 2);
      _$setProp(_el$66, "marginTop", 1);
      _$setProp(_el$66, "flexDirection", "column");
      _$setProp(_el$66, "border", ["left"]);
      _$setProp(_el$66, "flexShrink", 0);
      _$setProp(_el$67, "filetype", "markdown");
      _$setProp(_el$67, "drawUnstyledText", false);
      _$setProp(_el$67, "streaming", true);
      _$setProp(_el$67, "conceal", true);
      _$effect(_p$ => {
        var _v$45 = SplitBorder.customBorderChars,
          _v$46 = theme.backgroundElement,
          _v$47 = props.subtleSyntax,
          _v$48 = "_Thinking:_ " + content(),
          _v$49 = theme.textMuted;
        _v$45 !== _p$.e && (_p$.e = _$setProp(_el$66, "customBorderChars", _v$45, _p$.e));
        _v$46 !== _p$.t && (_p$.t = _$setProp(_el$66, "borderColor", _v$46, _p$.t));
        _v$47 !== _p$.a && (_p$.a = _$setProp(_el$67, "syntaxStyle", _v$47, _p$.a));
        _v$48 !== _p$.o && (_p$.o = _$setProp(_el$67, "content", _v$48, _p$.o));
        _v$49 !== _p$.i && (_p$.i = _$setProp(_el$67, "fg", _v$49, _p$.i));
        return _p$;
      }, {
        e: undefined,
        t: undefined,
        a: undefined,
        o: undefined,
        i: undefined
      });
      return _el$66;
    }
  });
}
function AssistantTool(props) {
  const input = createMemo(() => toolInputRecord(props.part.state.input));
  const toolprops = {
    get input() {
      return input();
    },
    get metadata() {
      return props.part.provider?.metadata ?? {};
    },
    get output() {
      return props.part.state.status === "pending" ? undefined : toolOutput(props.part.state.content);
    },
    part: props.part
  };
  return _$createComponent(Switch, {
    get children() {
      return [_$createComponent(Match, {
        get when() {
          return props.part.name === "bash";
        },
        get children() {
          return _$createComponent(Bash, toolprops);
        }
      }), _$createComponent(Match, {
        get when() {
          return props.part.name === "glob";
        },
        get children() {
          return _$createComponent(Glob, toolprops);
        }
      }), _$createComponent(Match, {
        get when() {
          return props.part.name === "read";
        },
        get children() {
          return _$createComponent(Read, toolprops);
        }
      }), _$createComponent(Match, {
        get when() {
          return props.part.name === "grep";
        },
        get children() {
          return _$createComponent(Grep, toolprops);
        }
      }), _$createComponent(Match, {
        get when() {
          return props.part.name === "webfetch";
        },
        get children() {
          return _$createComponent(WebFetch, toolprops);
        }
      }), _$createComponent(Match, {
        get when() {
          return props.part.name === "codesearch";
        },
        get children() {
          return _$createComponent(CodeSearch, toolprops);
        }
      }), _$createComponent(Match, {
        get when() {
          return props.part.name === "websearch";
        },
        get children() {
          return _$createComponent(WebSearch, toolprops);
        }
      }), _$createComponent(Match, {
        get when() {
          return props.part.name === "write";
        },
        get children() {
          return _$createComponent(Write, toolprops);
        }
      }), _$createComponent(Match, {
        get when() {
          return props.part.name === "edit";
        },
        get children() {
          return _$createComponent(Edit, toolprops);
        }
      }), _$createComponent(Match, {
        get when() {
          return props.part.name === "apply_patch";
        },
        get children() {
          return _$createComponent(ApplyPatch, toolprops);
        }
      }), _$createComponent(Match, {
        get when() {
          return props.part.name === "todowrite";
        },
        get children() {
          return _$createComponent(TodoWrite, toolprops);
        }
      }), _$createComponent(Match, {
        get when() {
          return props.part.name === "question";
        },
        get children() {
          return _$createComponent(Question, toolprops);
        }
      }), _$createComponent(Match, {
        get when() {
          return props.part.name === "skill";
        },
        get children() {
          return _$createComponent(Skill, toolprops);
        }
      }), _$createComponent(Match, {
        get when() {
          return props.part.name === "task";
        },
        get children() {
          return _$createComponent(Task, toolprops);
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
function GenericTool(props) {
  const {
    theme
  } = useTheme();
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
      return output();
    },
    get fallback() {
      return _$createComponent(InlineTool, {
        icon: "\u2699",
        pending: "Writing command...",
        get complete() {
          return toolComplete(props.part);
        },
        get part() {
          return props.part;
        },
        get children() {
          return [_$memo(() => props.part.name), " ", _$memo(() => input(props.input))];
        }
      });
    },
    get children() {
      return _$createComponent(BlockTool, {
        get title() {
          return `# ${props.part.name} ${input(props.input)}`;
        },
        get part() {
          return props.part;
        },
        get onClick() {
          return overflow() ? () => setExpanded(prev => !prev) : undefined;
        },
        get children() {
          var _el$68 = _$createElement("box"),
            _el$69 = _$createElement("text");
          _$insertNode(_el$68, _el$69);
          _$setProp(_el$68, "gap", 1);
          _$insert(_el$69, limited);
          _$insert(_el$68, _$createComponent(Show, {
            get when() {
              return overflow();
            },
            get children() {
              var _el$70 = _$createElement("text");
              _$insert(_el$70, () => expanded() ? "Click to collapse" : "Click to expand");
              _$effect(_$p => _$setProp(_el$70, "fg", theme.textMuted, _$p));
              return _el$70;
            }
          }), null);
          _$effect(_$p => _$setProp(_el$69, "fg", theme.text, _$p));
          return _el$68;
        }
      });
    }
  });
}
function InlineTool(props) {
  const {
    theme
  } = useTheme();
  const error = createMemo(() => props.part.state.status === "error" ? props.part.state.error.message : undefined);
  const denied = createMemo(() => {
    const message = error();
    if (!message) return false;
    return message.includes("QuestionRejectedError") || message.includes("rejected permission") || message.includes("user dismissed");
  });
  return (() => {
    var _el$71 = _$createElement("box");
    _$setProp(_el$71, "marginTop", 1);
    _$setProp(_el$71, "paddingLeft", 3);
    _$setProp(_el$71, "flexShrink", 0);
    _$insert(_el$71, _$createComponent(Switch, {
      get children() {
        return [_$createComponent(Match, {
          get when() {
            return props.spinner;
          },
          get children() {
            return _$createComponent(Spinner, {
              get color() {
                return theme.text;
              },
              get children() {
                return props.children;
              }
            });
          }
        }), _$createComponent(Match, {
          when: true,
          get children() {
            var _el$72 = _$createElement("text");
            _$setProp(_el$72, "paddingLeft", 3);
            _$insert(_el$72, _$createComponent(Show, {
              get fallback() {
                return ["~ ", _$memo(() => props.pending)];
              },
              get when() {
                return props.complete;
              },
              get children() {
                return [_$memo(() => props.icon), " ", _$memo(() => props.children)];
              }
            }));
            _$effect(_$p => _$setProp(_el$72, "fg", props.complete ? theme.textMuted : theme.text, _$p));
            return _el$72;
          }
        })];
      }
    }), null);
    _$insert(_el$71, _$createComponent(Show, {
      get when() {
        return _$memo(() => !!error())() && !denied();
      },
      get children() {
        var _el$73 = _$createElement("text");
        _$insert(_el$73, error);
        _$effect(_$p => _$setProp(_el$73, "fg", theme.error, _$p));
        return _el$73;
      }
    }), null);
    return _el$71;
  })();
}
function BlockTool(props) {
  const {
    theme
  } = useTheme();
  const renderer = useRenderer();
  const [hover, setHover] = createSignal(false);
  const error = createMemo(() => props.part?.state.status === "error" ? props.part.state.error.message : undefined);
  return (() => {
    var _el$74 = _$createElement("box");
    _$setProp(_el$74, "border", ["left"]);
    _$setProp(_el$74, "paddingTop", 1);
    _$setProp(_el$74, "paddingBottom", 1);
    _$setProp(_el$74, "paddingLeft", 2);
    _$setProp(_el$74, "marginTop", 1);
    _$setProp(_el$74, "gap", 1);
    _$setProp(_el$74, "onMouseOver", () => props.onClick && setHover(true));
    _$setProp(_el$74, "onMouseOut", () => setHover(false));
    _$setProp(_el$74, "onMouseUp", () => {
      if (renderer.getSelection()?.getSelectedText()) return;
      props.onClick?.();
    });
    _$setProp(_el$74, "flexShrink", 0);
    _$insert(_el$74, _$createComponent(Show, {
      get when() {
        return props.spinner;
      },
      get fallback() {
        return (() => {
          var _el$76 = _$createElement("text");
          _$setProp(_el$76, "paddingLeft", 3);
          _$insert(_el$76, () => props.title);
          _$effect(_$p => _$setProp(_el$76, "fg", theme.textMuted, _$p));
          return _el$76;
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
    _$insert(_el$74, () => props.children, null);
    _$insert(_el$74, _$createComponent(Show, {
      get when() {
        return error();
      },
      get children() {
        var _el$75 = _$createElement("text");
        _$insert(_el$75, error);
        _$effect(_$p => _$setProp(_el$75, "fg", theme.error, _$p));
        return _el$75;
      }
    }), null);
    _$effect(_p$ => {
      var _v$50 = hover() ? theme.backgroundMenu : theme.backgroundPanel,
        _v$51 = SplitBorder.customBorderChars,
        _v$52 = theme.background;
      _v$50 !== _p$.e && (_p$.e = _$setProp(_el$74, "backgroundColor", _v$50, _p$.e));
      _v$51 !== _p$.t && (_p$.t = _$setProp(_el$74, "customBorderChars", _v$51, _p$.t));
      _v$52 !== _p$.a && (_p$.a = _$setProp(_el$74, "borderColor", _v$52, _p$.a));
      return _p$;
    }, {
      e: undefined,
      t: undefined,
      a: undefined
    });
    return _el$74;
  })();
}
function Bash(props) {
  const {
    theme
  } = useTheme();
  const output = createMemo(() => stripAnsi((stringValue(props.metadata.output) ?? props.output ?? "").trim()));
  const command = createMemo(() => stringValue(props.input.command) ?? pendingInput(props.part));
  const title = createMemo(() => `# ${stringValue(props.input.description) ?? "Shell"}`);
  const [expanded, setExpanded] = createSignal(false);
  const lines = createMemo(() => output().split("\n"));
  const overflow = createMemo(() => lines().length > 10);
  const limited = createMemo(() => {
    if (expanded() || !overflow()) return output();
    return [...lines().slice(0, 10), "…"].join("\n");
  });
  return _$createComponent(Switch, {
    get children() {
      return [_$createComponent(Match, {
        get when() {
          return output();
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
              return props.part.state.status === "running";
            },
            get onClick() {
              return overflow() ? () => setExpanded(prev => !prev) : undefined;
            },
            get children() {
              var _el$77 = _$createElement("box"),
                _el$78 = _$createElement("text"),
                _el$79 = _$createTextNode(`$ `),
                _el$80 = _$createElement("text");
              _$insertNode(_el$77, _el$78);
              _$insertNode(_el$77, _el$80);
              _$setProp(_el$77, "gap", 1);
              _$insertNode(_el$78, _el$79);
              _$insert(_el$78, command, null);
              _$insert(_el$80, limited);
              _$insert(_el$77, _$createComponent(Show, {
                get when() {
                  return overflow();
                },
                get children() {
                  var _el$81 = _$createElement("text");
                  _$insert(_el$81, () => expanded() ? "Click to collapse" : "Click to expand");
                  _$effect(_$p => _$setProp(_el$81, "fg", theme.textMuted, _$p));
                  return _el$81;
                }
              }), null);
              _$effect(_p$ => {
                var _v$53 = theme.text,
                  _v$54 = theme.text;
                _v$53 !== _p$.e && (_p$.e = _$setProp(_el$78, "fg", _v$53, _p$.e));
                _v$54 !== _p$.t && (_p$.t = _$setProp(_el$80, "fg", _v$54, _p$.t));
                return _p$;
              }, {
                e: undefined,
                t: undefined
              });
              return _el$77;
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
              return command();
            },
            get part() {
              return props.part;
            },
            get children() {
              return command();
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
      return toolComplete(props.part);
    },
    get part() {
      return props.part;
    },
    get children() {
      return ["Glob \"", _$memo(() => stringValue(props.input.pattern) ?? pendingInput(props.part)), "\"", " ", _$createComponent(Show, {
        get when() {
          return stringValue(props.input.path);
        },
        get children() {
          return ["in ", _$memo(() => normalizePath(stringValue(props.input.path))), " "];
        }
      }), _$createComponent(Show, {
        get when() {
          return numberValue(props.metadata.count);
        },
        children: count => ["(", _$memo(count), " ", _$memo(() => count() === 1 ? "match" : "matches"), ")"]
      })];
    }
  });
}
function Read(props) {
  const {
    theme
  } = useTheme();
  const loaded = createMemo(() => arrayValue(props.metadata.loaded).filter(item => typeof item === "string"));
  return [_$createComponent(InlineTool, {
    icon: "\u2192",
    pending: "Reading file...",
    get complete() {
      return stringValue(props.input.filePath) ?? pendingInput(props.part);
    },
    get spinner() {
      return props.part.state.status === "running";
    },
    get part() {
      return props.part;
    },
    get children() {
      return ["Read ", _$memo(() => normalizePath(stringValue(props.input.filePath) ?? pendingInput(props.part))), " ", _$memo(() => input(props.input, ["filePath"]))];
    }
  }), _$createComponent(For, {
    get each() {
      return loaded();
    },
    children: filepath => (() => {
      var _el$82 = _$createElement("box"),
        _el$83 = _$createElement("text"),
        _el$84 = _$createTextNode(`↳ Loaded `);
      _$insertNode(_el$82, _el$83);
      _$setProp(_el$82, "paddingLeft", 3);
      _$setProp(_el$82, "flexShrink", 0);
      _$insertNode(_el$83, _el$84);
      _$setProp(_el$83, "paddingLeft", 3);
      _$insert(_el$83, () => normalizePath(filepath), null);
      _$effect(_$p => _$setProp(_el$83, "fg", theme.textMuted, _$p));
      return _el$82;
    })()
  })];
}
function Grep(props) {
  return _$createComponent(InlineTool, {
    icon: "\u2731",
    pending: "Searching content...",
    get complete() {
      return toolComplete(props.part);
    },
    get part() {
      return props.part;
    },
    get children() {
      return ["Grep \"", _$memo(() => stringValue(props.input.pattern) ?? pendingInput(props.part)), "\"", " ", _$createComponent(Show, {
        get when() {
          return stringValue(props.input.path);
        },
        get children() {
          return ["in ", _$memo(() => normalizePath(stringValue(props.input.path))), " "];
        }
      }), _$createComponent(Show, {
        get when() {
          return numberValue(props.metadata.matches);
        },
        children: matches => ["(", _$memo(matches), " ", _$memo(() => matches() === 1 ? "match" : "matches"), ")"]
      })];
    }
  });
}
function WebFetch(props) {
  return _$createComponent(InlineTool, {
    icon: "%",
    pending: "Fetching from the web...",
    get complete() {
      return toolComplete(props.part);
    },
    get part() {
      return props.part;
    },
    get children() {
      return ["WebFetch ", _$memo(() => stringValue(props.input.url) ?? pendingInput(props.part))];
    }
  });
}
function CodeSearch(props) {
  return _$createComponent(InlineTool, {
    icon: "\u25C7",
    pending: "Searching code...",
    get complete() {
      return toolComplete(props.part);
    },
    get part() {
      return props.part;
    },
    get children() {
      return ["Exa Code Search \"", _$memo(() => stringValue(props.input.query) ?? pendingInput(props.part)), "\"", " ", _$createComponent(Show, {
        get when() {
          return numberValue(props.metadata.results);
        },
        children: results => ["(", _$memo(results), " results)"]
      })];
    }
  });
}
function WebSearch(props) {
  return _$createComponent(InlineTool, {
    icon: "\u25C8",
    pending: "Searching web...",
    get complete() {
      return toolComplete(props.part);
    },
    get part() {
      return props.part;
    },
    get children() {
      return ["Exa Web Search \"", _$memo(() => stringValue(props.input.query) ?? pendingInput(props.part)), "\"", " ", _$createComponent(Show, {
        get when() {
          return numberValue(props.metadata.numResults);
        },
        children: results => ["(", _$memo(results), " results)"]
      })];
    }
  });
}
function Write(props) {
  const {
    theme,
    syntax
  } = useTheme();
  const filePath = createMemo(() => stringValue(props.input.filePath) ?? "");
  const content = createMemo(() => stringValue(props.input.content) ?? "");
  return _$createComponent(Switch, {
    get children() {
      return [_$createComponent(Match, {
        get when() {
          return _$memo(() => !!content())() && props.part.state.status === "completed";
        },
        get children() {
          return _$createComponent(BlockTool, {
            get title() {
              return "# Wrote " + normalizePath(filePath());
            },
            get part() {
              return props.part;
            },
            get children() {
              return [(() => {
                var _el$85 = _$createElement("line_number"),
                  _el$86 = _$createElement("code");
                _$insertNode(_el$85, _el$86);
                _$setProp(_el$85, "minWidth", 3);
                _$setProp(_el$85, "paddingRight", 1);
                _$setProp(_el$86, "conceal", false);
                _$effect(_p$ => {
                  var _v$55 = theme.textMuted,
                    _v$56 = theme.text,
                    _v$57 = filetype(filePath()),
                    _v$58 = syntax(),
                    _v$59 = content();
                  _v$55 !== _p$.e && (_p$.e = _$setProp(_el$85, "fg", _v$55, _p$.e));
                  _v$56 !== _p$.t && (_p$.t = _$setProp(_el$86, "fg", _v$56, _p$.t));
                  _v$57 !== _p$.a && (_p$.a = _$setProp(_el$86, "filetype", _v$57, _p$.a));
                  _v$58 !== _p$.o && (_p$.o = _$setProp(_el$86, "syntaxStyle", _v$58, _p$.o));
                  _v$59 !== _p$.i && (_p$.i = _$setProp(_el$86, "content", _v$59, _p$.i));
                  return _p$;
                }, {
                  e: undefined,
                  t: undefined,
                  a: undefined,
                  o: undefined,
                  i: undefined
                });
                return _el$85;
              })(), _$createComponent(Diagnostics, {
                get diagnostics() {
                  return props.metadata.diagnostics;
                },
                get filePath() {
                  return filePath();
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
              return filePath();
            },
            get part() {
              return props.part;
            },
            get children() {
              return ["Write ", _$memo(() => normalizePath(filePath()))];
            }
          });
        }
      })];
    }
  });
}
function Edit(props) {
  const {
    theme,
    syntax
  } = useTheme();
  const dimensions = useTerminalDimensions();
  const filePath = createMemo(() => stringValue(props.input.filePath) ?? "");
  const diff = createMemo(() => stringValue(props.metadata.diff));
  return _$createComponent(Switch, {
    get children() {
      return [_$createComponent(Match, {
        get when() {
          return diff();
        },
        children: diff => _$createComponent(BlockTool, {
          get title() {
            return "← Edit " + normalizePath(filePath());
          },
          get part() {
            return props.part;
          },
          get children() {
            return [(() => {
              var _el$87 = _$createElement("box"),
                _el$88 = _$createElement("diff");
              _$insertNode(_el$87, _el$88);
              _$setProp(_el$87, "paddingLeft", 1);
              _$setProp(_el$88, "showLineNumbers", true);
              _$setProp(_el$88, "width", "100%");
              _$setProp(_el$88, "wrapMode", "word");
              _$effect(_p$ => {
                var _v$60 = diff(),
                  _v$61 = dimensions().width > 120 ? "split" : "unified",
                  _v$62 = filetype(filePath()),
                  _v$63 = syntax(),
                  _v$64 = theme.text,
                  _v$65 = theme.diffAddedBg,
                  _v$66 = theme.diffRemovedBg,
                  _v$67 = theme.diffContextBg,
                  _v$68 = theme.diffHighlightAdded,
                  _v$69 = theme.diffHighlightRemoved,
                  _v$70 = theme.diffLineNumber,
                  _v$71 = theme.diffContextBg,
                  _v$72 = theme.diffAddedLineNumberBg,
                  _v$73 = theme.diffRemovedLineNumberBg;
                _v$60 !== _p$.e && (_p$.e = _$setProp(_el$88, "diff", _v$60, _p$.e));
                _v$61 !== _p$.t && (_p$.t = _$setProp(_el$88, "view", _v$61, _p$.t));
                _v$62 !== _p$.a && (_p$.a = _$setProp(_el$88, "filetype", _v$62, _p$.a));
                _v$63 !== _p$.o && (_p$.o = _$setProp(_el$88, "syntaxStyle", _v$63, _p$.o));
                _v$64 !== _p$.i && (_p$.i = _$setProp(_el$88, "fg", _v$64, _p$.i));
                _v$65 !== _p$.n && (_p$.n = _$setProp(_el$88, "addedBg", _v$65, _p$.n));
                _v$66 !== _p$.s && (_p$.s = _$setProp(_el$88, "removedBg", _v$66, _p$.s));
                _v$67 !== _p$.h && (_p$.h = _$setProp(_el$88, "contextBg", _v$67, _p$.h));
                _v$68 !== _p$.r && (_p$.r = _$setProp(_el$88, "addedSignColor", _v$68, _p$.r));
                _v$69 !== _p$.d && (_p$.d = _$setProp(_el$88, "removedSignColor", _v$69, _p$.d));
                _v$70 !== _p$.l && (_p$.l = _$setProp(_el$88, "lineNumberFg", _v$70, _p$.l));
                _v$71 !== _p$.u && (_p$.u = _$setProp(_el$88, "lineNumberBg", _v$71, _p$.u));
                _v$72 !== _p$.c && (_p$.c = _$setProp(_el$88, "addedLineNumberBg", _v$72, _p$.c));
                _v$73 !== _p$.w && (_p$.w = _$setProp(_el$88, "removedLineNumberBg", _v$73, _p$.w));
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
                w: undefined
              });
              return _el$87;
            })(), _$createComponent(Diagnostics, {
              get diagnostics() {
                return props.metadata.diagnostics;
              },
              get filePath() {
                return filePath();
              }
            })];
          }
        })
      }), _$createComponent(Match, {
        when: true,
        get children() {
          return _$createComponent(InlineTool, {
            icon: "\u2190",
            pending: "Preparing edit...",
            get complete() {
              return filePath();
            },
            get part() {
              return props.part;
            },
            get children() {
              return ["Edit ", _$memo(() => normalizePath(filePath())), " ", _$memo(() => input({
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
  const {
    theme,
    syntax
  } = useTheme();
  const dimensions = useTerminalDimensions();
  const files = createMemo(() => arrayValue(props.metadata.files).flatMap(item => isRecord(item) ? [item] : []));
  const fileTitle = file => {
    const type = stringValue(file.type);
    const relativePath = stringValue(file.relativePath) ?? stringValue(file.filePath) ?? "patch";
    if (type === "delete") return "# Deleted " + relativePath;
    if (type === "add") return "# Created " + relativePath;
    if (type === "move") return "# Moved " + normalizePath(stringValue(file.filePath)) + " → " + relativePath;
    return "← Patched " + relativePath;
  };
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
                return fileTitle(file);
              },
              get part() {
                return props.part;
              },
              get children() {
                return _$createComponent(Show, {
                  get when() {
                    return stringValue(file.patch);
                  },
                  get fallback() {
                    return (() => {
                      var _el$89 = _$createElement("text"),
                        _el$90 = _$createTextNode(`-`),
                        _el$91 = _$createTextNode(` line`);
                      _$insertNode(_el$89, _el$90);
                      _$insertNode(_el$89, _el$91);
                      _$insert(_el$89, () => numberValue(file.deletions) ?? 0, _el$91);
                      _$insert(_el$89, () => numberValue(file.deletions) === 1 ? "" : "s", null);
                      _$effect(_$p => _$setProp(_el$89, "fg", theme.diffRemoved, _$p));
                      return _el$89;
                    })();
                  },
                  children: patch => (() => {
                    var _el$92 = _$createElement("box"),
                      _el$93 = _$createElement("diff");
                    _$insertNode(_el$92, _el$93);
                    _$setProp(_el$92, "paddingLeft", 1);
                    _$setProp(_el$93, "showLineNumbers", true);
                    _$setProp(_el$93, "width", "100%");
                    _$setProp(_el$93, "wrapMode", "word");
                    _$effect(_p$ => {
                      var _v$74 = patch(),
                        _v$75 = dimensions().width > 120 ? "split" : "unified",
                        _v$76 = filetype(stringValue(file.filePath) ?? stringValue(file.relativePath)),
                        _v$77 = syntax(),
                        _v$78 = theme.text,
                        _v$79 = theme.diffAddedBg,
                        _v$80 = theme.diffRemovedBg,
                        _v$81 = theme.diffContextBg,
                        _v$82 = theme.diffHighlightAdded,
                        _v$83 = theme.diffHighlightRemoved,
                        _v$84 = theme.diffLineNumber,
                        _v$85 = theme.diffContextBg,
                        _v$86 = theme.diffAddedLineNumberBg,
                        _v$87 = theme.diffRemovedLineNumberBg;
                      _v$74 !== _p$.e && (_p$.e = _$setProp(_el$93, "diff", _v$74, _p$.e));
                      _v$75 !== _p$.t && (_p$.t = _$setProp(_el$93, "view", _v$75, _p$.t));
                      _v$76 !== _p$.a && (_p$.a = _$setProp(_el$93, "filetype", _v$76, _p$.a));
                      _v$77 !== _p$.o && (_p$.o = _$setProp(_el$93, "syntaxStyle", _v$77, _p$.o));
                      _v$78 !== _p$.i && (_p$.i = _$setProp(_el$93, "fg", _v$78, _p$.i));
                      _v$79 !== _p$.n && (_p$.n = _$setProp(_el$93, "addedBg", _v$79, _p$.n));
                      _v$80 !== _p$.s && (_p$.s = _$setProp(_el$93, "removedBg", _v$80, _p$.s));
                      _v$81 !== _p$.h && (_p$.h = _$setProp(_el$93, "contextBg", _v$81, _p$.h));
                      _v$82 !== _p$.r && (_p$.r = _$setProp(_el$93, "addedSignColor", _v$82, _p$.r));
                      _v$83 !== _p$.d && (_p$.d = _$setProp(_el$93, "removedSignColor", _v$83, _p$.d));
                      _v$84 !== _p$.l && (_p$.l = _$setProp(_el$93, "lineNumberFg", _v$84, _p$.l));
                      _v$85 !== _p$.u && (_p$.u = _$setProp(_el$93, "lineNumberBg", _v$85, _p$.u));
                      _v$86 !== _p$.c && (_p$.c = _$setProp(_el$93, "addedLineNumberBg", _v$86, _p$.c));
                      _v$87 !== _p$.w && (_p$.w = _$setProp(_el$93, "removedLineNumberBg", _v$87, _p$.w));
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
                      w: undefined
                    });
                    return _el$92;
                  })()
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
  const {
    theme
  } = useTheme();
  const todos = createMemo(() => arrayValue(props.input.todos).flatMap(item => isRecord(item) ? [item] : []));
  return _$createComponent(Switch, {
    get children() {
      return [_$createComponent(Match, {
        get when() {
          return _$memo(() => todos().length > 0)() && props.part.state.status === "completed";
        },
        get children() {
          return _$createComponent(BlockTool, {
            title: "# Todos",
            get part() {
              return props.part;
            },
            get children() {
              var _el$94 = _$createElement("box");
              _$insert(_el$94, _$createComponent(For, {
                get each() {
                  return todos();
                },
                children: todo => (() => {
                  var _el$95 = _$createElement("text"),
                    _el$96 = _$createTextNode(` `);
                  _$insertNode(_el$95, _el$96);
                  _$insert(_el$95, () => todoIcon(stringValue(todo.status)), _el$96);
                  _$insert(_el$95, () => stringValue(todo.content), null);
                  _$effect(_$p => _$setProp(_el$95, "fg", theme.text, _$p));
                  return _el$95;
                })()
              }));
              return _el$94;
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
  const questions = createMemo(() => arrayValue(props.input.questions).flatMap(item => isRecord(item) ? [item] : []));
  const answers = createMemo(() => arrayValue(props.metadata.answers));
  return _$createComponent(Switch, {
    get children() {
      return [_$createComponent(Match, {
        get when() {
          return answers().length > 0;
        },
        get children() {
          return _$createComponent(BlockTool, {
            title: "# Questions",
            get part() {
              return props.part;
            },
            get children() {
              var _el$97 = _$createElement("box");
              _$setProp(_el$97, "gap", 1);
              _$insert(_el$97, _$createComponent(For, {
                get each() {
                  return questions();
                },
                children: (question, index) => (() => {
                  var _el$98 = _$createElement("box"),
                    _el$99 = _$createElement("text"),
                    _el$100 = _$createElement("text");
                  _$insertNode(_el$98, _el$99);
                  _$insertNode(_el$98, _el$100);
                  _$insert(_el$99, () => stringValue(question.question));
                  _$insert(_el$100, () => formatAnswer(answers()[index()]));
                  _$effect(_p$ => {
                    var _v$88 = theme.textMuted,
                      _v$89 = theme.text;
                    _v$88 !== _p$.e && (_p$.e = _$setProp(_el$99, "fg", _v$88, _p$.e));
                    _v$89 !== _p$.t && (_p$.t = _$setProp(_el$100, "fg", _v$89, _p$.t));
                    return _p$;
                  }, {
                    e: undefined,
                    t: undefined
                  });
                  return _el$98;
                })()
              }));
              return _el$97;
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
              return questions().length;
            },
            get part() {
              return props.part;
            },
            get children() {
              return ["Asked ", _$memo(() => questions().length), " question", _$memo(() => questions().length === 1 ? "" : "s")];
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
      return toolComplete(props.part);
    },
    get part() {
      return props.part;
    },
    get children() {
      return ["Skill \"", _$memo(() => stringValue(props.input.name) ?? pendingInput(props.part)), "\""];
    }
  });
}
function Task(props) {
  const content = createMemo(() => {
    const description = stringValue(props.input.description);
    if (!description) return pendingInput(props.part);
    return `${Locale.titlecase(stringValue(props.input.subagent_type) ?? "General")} Task — ${description}`;
  });
  return _$createComponent(InlineTool, {
    icon: "\u2502",
    get spinner() {
      return props.part.state.status === "running";
    },
    get complete() {
      return toolComplete(props.part);
    },
    pending: "Delegating...",
    get part() {
      return props.part;
    },
    get children() {
      return content();
    }
  });
}
function Diagnostics(props) {
  const {
    theme
  } = useTheme();
  const errors = createMemo(() => {
    if (!isRecord(props.diagnostics)) return [];
    const value = props.diagnostics[normalizePath(props.filePath)] ?? props.diagnostics[props.filePath];
    return arrayValue(value).flatMap(item => isRecord(item) ? [item] : []).filter(diagnostic => diagnostic.severity === 1).slice(0, 3);
  });
  return _$createComponent(Show, {
    get when() {
      return errors().length;
    },
    get children() {
      var _el$101 = _$createElement("box");
      _$insert(_el$101, _$createComponent(For, {
        get each() {
          return errors();
        },
        children: diagnostic => (() => {
          var _el$102 = _$createElement("text"),
            _el$103 = _$createTextNode(`Error `);
          _$insertNode(_el$102, _el$103);
          _$insert(_el$102, () => stringValue(diagnostic.message), null);
          _$effect(_$p => _$setProp(_el$102, "fg", theme.error, _$p));
          return _el$102;
        })()
      }));
      return _el$101;
    }
  });
}
function toolOutput(content) {
  return (content ?? []).map(item => {
    if (item.type === "text") return item.text.trim();
    return `[file ${item.name ?? item.uri}]`;
  }).filter(Boolean).join("\n");
}
function toolInputRecord(input) {
  if (typeof input === "string") return {};
  return input;
}
function pendingInput(part) {
  if (part.state.status !== "pending") return "";
  return part.state.input.trim();
}
function toolComplete(part) {
  if (part.state.status === "pending") return pendingInput(part);
  return part.state.status === "completed" || part.state.status === "error" || part.state.status === "running";
}
function stringValue(value) {
  return typeof value === "string" ? value : undefined;
}
function numberValue(value) {
  return typeof value === "number" ? value : undefined;
}
function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}
function isRecord(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function input(input, omit) {
  const primitives = Object.entries(input).filter(([key, value]) => {
    if (omit?.includes(key)) return false;
    return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
  });
  if (primitives.length === 0) return "";
  return `[${primitives.map(([key, value]) => `${key}=${value}`).join(", ")}]`;
}
function normalizePath(input) {
  if (!input) return "";
  const absolute = path.isAbsolute(input) ? input : path.resolve(process.cwd(), input);
  const relative = path.relative(process.cwd(), absolute);
  if (!relative) return ".";
  if (!relative.startsWith("..")) return relative;
  return absolute;
}
function filetype(input) {
  if (!input) return "none";
  const language = LANGUAGE_EXTENSIONS[path.extname(input)];
  if (["typescriptreact", "javascriptreact", "javascript"].includes(language)) return "typescript";
  return language;
}
function todoIcon(status) {
  if (status === "completed") return "✓";
  if (status === "in_progress") return "~";
  if (status === "cancelled") return "✕";
  return "☐";
}
function formatAnswer(answer) {
  if (!Array.isArray(answer)) return "(no answer)";
  if (answer.length === 0) return "(no answer)";
  return answer.filter(item => typeof item === "string").join(", ");
}
const tui = async api => {
  api.route.register([{
    name: route,
    render(input) {
      const sessionID = input.params?.sessionID;
      if (typeof sessionID !== "string") {
        return (() => {
          var _el$104 = _$createElement("text");
          _$insertNode(_el$104, _$createTextNode(`Missing sessionID`));
          _$effect(_$p => _$setProp(_el$104, "fg", api.theme.current.error, _$p));
          return _el$104;
        })();
      }
      return _$createComponent(View, {
        api: api,
        sessionID: sessionID
      });
    }
  }]);
  api.command.register(() => [{
    title: "View v2 session messages",
    value: route,
    category: "Debug",
    suggested: api.route.current.name === "session",
    enabled: api.route.current.name === "session",
    onSelect() {
      const sessionID = currentSessionID(api);
      if (!sessionID) return;
      api.route.navigate(route, {
        sessionID
      });
      api.ui.dialog.clear();
    }
  }]);
};
const plugin = {
  id,
  tui
};
export default plugin;