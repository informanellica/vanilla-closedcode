import { spread as _$spread } from "@opentui/solid";
import { mergeProps as _$mergeProps } from "@opentui/solid";
import { use as _$use } from "@opentui/solid";
import { memo as _$memo } from "@opentui/solid";
import { insert as _$insert } from "@opentui/solid";
import { createTextNode as _$createTextNode } from "@opentui/solid";
import { createComponent as _$createComponent } from "@opentui/solid";
import { effect as _$effect } from "@opentui/solid";
import { insertNode as _$insertNode } from "@opentui/solid";
import { setProp as _$setProp } from "@opentui/solid";
import { createElement as _$createElement } from "@opentui/solid";
import { createStore } from "solid-js/store";
import { createMemo, For, Match, Show, Switch } from "solid-js";
import { Portal, useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/solid";
import { useKeybind } from "../../context/keybind.js";
import { useTheme, selectedForeground } from "../../context/theme.js";
import { useSDK } from "../../context/sdk.js";
import { SplitBorder } from "../../component/border.js";
import { useSync } from "../../context/sync.js";
import { useTextareaKeybindings } from "../../component/textarea-keybindings.js";
import { useProject } from "../../context/project.js";
import path from "path";
import { LANGUAGE_EXTENSIONS } from "#lsp/language.js";
import { Keybind } from "#util/keybind.js";
import { Locale } from "#util/locale.js";
import { Global } from "core/global";
import { ShellID } from "#tool/shell/id.js";
import { useDialog } from "../../ui/dialog.js";
import { getScrollAcceleration } from "../../util/scroll.js";
import { useTuiConfig } from "../../context/tui-config.js";
function normalizePath(input) {
  if (!input) return "";
  const cwd = process.cwd();
  const home = Global.Path.home;
  const absolute = path.isAbsolute(input) ? input : path.resolve(cwd, input);
  const relative = path.relative(cwd, absolute);
  if (!relative) return ".";
  if (!relative.startsWith("..")) return relative;

  // outside cwd - use ~ or absolute
  if (home && (absolute === home || absolute.startsWith(home + path.sep))) {
    return absolute.replace(home, "~");
  }
  return absolute;
}
function filetype(input) {
  if (!input) return "none";
  const ext = path.extname(input);
  const language = LANGUAGE_EXTENSIONS[ext];
  if (["typescriptreact", "javascriptreact", "javascript"].includes(language)) return "typescript";
  return language;
}
function EditBody(props) {
  const themeState = useTheme();
  const theme = themeState.theme;
  const syntax = themeState.syntax;
  const config = useTuiConfig();
  const dimensions = useTerminalDimensions();
  const filepath = createMemo(() => props.request.metadata?.filepath ?? "");
  const diff = createMemo(() => props.request.metadata?.diff ?? "");
  const view = createMemo(() => {
    const diffStyle = config.diff_style;
    if (diffStyle === "stacked") return "unified";
    return dimensions().width > 120 ? "split" : "unified";
  });
  const ft = createMemo(() => filetype(filepath()));
  const scrollAcceleration = createMemo(() => getScrollAcceleration(config));
  return (() => {
    var _el$ = _$createElement("box");
    _$setProp(_el$, "flexDirection", "column");
    _$setProp(_el$, "gap", 1);
    _$insert(_el$, _$createComponent(Show, {
      get when() {
        return diff();
      },
      get children() {
        var _el$2 = _$createElement("scrollbox"),
          _el$3 = _$createElement("diff");
        _$insertNode(_el$2, _el$3);
        _$setProp(_el$2, "height", "100%");
        _$setProp(_el$3, "showLineNumbers", true);
        _$setProp(_el$3, "width", "100%");
        _$setProp(_el$3, "wrapMode", "word");
        _$effect(_p$ => {
          var _v$ = scrollAcceleration(),
            _v$2 = {
              trackOptions: {
                backgroundColor: theme.background,
                foregroundColor: theme.borderActive
              }
            },
            _v$3 = diff(),
            _v$4 = view(),
            _v$5 = ft(),
            _v$6 = syntax(),
            _v$7 = theme.text,
            _v$8 = theme.diffAddedBg,
            _v$9 = theme.diffRemovedBg,
            _v$0 = theme.diffContextBg,
            _v$1 = theme.diffHighlightAdded,
            _v$10 = theme.diffHighlightRemoved,
            _v$11 = theme.diffLineNumber,
            _v$12 = theme.diffContextBg,
            _v$13 = theme.diffAddedLineNumberBg,
            _v$14 = theme.diffRemovedLineNumberBg;
          _v$ !== _p$.e && (_p$.e = _$setProp(_el$2, "scrollAcceleration", _v$, _p$.e));
          _v$2 !== _p$.t && (_p$.t = _$setProp(_el$2, "verticalScrollbarOptions", _v$2, _p$.t));
          _v$3 !== _p$.a && (_p$.a = _$setProp(_el$3, "diff", _v$3, _p$.a));
          _v$4 !== _p$.o && (_p$.o = _$setProp(_el$3, "view", _v$4, _p$.o));
          _v$5 !== _p$.i && (_p$.i = _$setProp(_el$3, "filetype", _v$5, _p$.i));
          _v$6 !== _p$.n && (_p$.n = _$setProp(_el$3, "syntaxStyle", _v$6, _p$.n));
          _v$7 !== _p$.s && (_p$.s = _$setProp(_el$3, "fg", _v$7, _p$.s));
          _v$8 !== _p$.h && (_p$.h = _$setProp(_el$3, "addedBg", _v$8, _p$.h));
          _v$9 !== _p$.r && (_p$.r = _$setProp(_el$3, "removedBg", _v$9, _p$.r));
          _v$0 !== _p$.d && (_p$.d = _$setProp(_el$3, "contextBg", _v$0, _p$.d));
          _v$1 !== _p$.l && (_p$.l = _$setProp(_el$3, "addedSignColor", _v$1, _p$.l));
          _v$10 !== _p$.u && (_p$.u = _$setProp(_el$3, "removedSignColor", _v$10, _p$.u));
          _v$11 !== _p$.c && (_p$.c = _$setProp(_el$3, "lineNumberFg", _v$11, _p$.c));
          _v$12 !== _p$.w && (_p$.w = _$setProp(_el$3, "lineNumberBg", _v$12, _p$.w));
          _v$13 !== _p$.m && (_p$.m = _$setProp(_el$3, "addedLineNumberBg", _v$13, _p$.m));
          _v$14 !== _p$.f && (_p$.f = _$setProp(_el$3, "removedLineNumberBg", _v$14, _p$.f));
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
        return _el$2;
      }
    }), null);
    _$insert(_el$, _$createComponent(Show, {
      get when() {
        return !diff();
      },
      get children() {
        var _el$4 = _$createElement("box"),
          _el$5 = _$createElement("text");
        _$insertNode(_el$4, _el$5);
        _$setProp(_el$4, "paddingLeft", 1);
        _$insertNode(_el$5, _$createTextNode(`No diff provided`));
        _$effect(_$p => _$setProp(_el$5, "fg", theme.textMuted, _$p));
        return _el$4;
      }
    }), null);
    return _el$;
  })();
}
function TextBody(props) {
  const {
    theme
  } = useTheme();
  return [(() => {
    var _el$7 = _$createElement("box"),
      _el$9 = _$createElement("text");
    _$insertNode(_el$7, _el$9);
    _$setProp(_el$7, "flexDirection", "row");
    _$setProp(_el$7, "gap", 1);
    _$setProp(_el$7, "paddingLeft", 1);
    _$insert(_el$7, _$createComponent(Show, {
      get when() {
        return props.icon;
      },
      get children() {
        var _el$8 = _$createElement("text");
        _$setProp(_el$8, "flexShrink", 0);
        _$insert(_el$8, () => props.icon);
        _$effect(_$p => _$setProp(_el$8, "fg", theme.textMuted, _$p));
        return _el$8;
      }
    }), _el$9);
    _$insert(_el$9, () => props.title);
    _$effect(_$p => _$setProp(_el$9, "fg", theme.textMuted, _$p));
    return _el$7;
  })(), _$createComponent(Show, {
    get when() {
      return props.description;
    },
    get children() {
      var _el$0 = _$createElement("box"),
        _el$1 = _$createElement("text");
      _$insertNode(_el$0, _el$1);
      _$setProp(_el$0, "paddingLeft", 1);
      _$insert(_el$1, () => props.description);
      _$effect(_$p => _$setProp(_el$1, "fg", theme.text, _$p));
      return _el$0;
    }
  })];
}
export function PermissionPrompt(props) {
  const sdk = useSDK();
  const project = useProject();
  const sync = useSync();
  const [store, setStore] = createStore({
    stage: "permission"
  });
  const session = createMemo(() => sync.data.session.find(s => s.id === props.request.sessionID));
  const input = createMemo(() => {
    const tool = props.request.tool;
    if (!tool) return {};
    const parts = sync.data.part[tool.messageID] ?? [];
    for (const part of parts) {
      if (part.type === "tool" && part.callID === tool.callID && part.state.status !== "pending") {
        return part.state.input ?? {};
      }
    }
    return {};
  });
  const {
    theme
  } = useTheme();
  return _$createComponent(Switch, {
    get children() {
      return [_$createComponent(Match, {
        get when() {
          return store.stage === "always";
        },
        get children() {
          return _$createComponent(Prompt, {
            title: "Always allow",
            get body() {
              return _$createComponent(Switch, {
                get children() {
                  return [_$createComponent(Match, {
                    get when() {
                      return _$memo(() => props.request.always.length === 1)() && props.request.always[0] === "*";
                    },
                    get children() {
                      return _$createComponent(TextBody, {
                        get title() {
                          return "This will allow " + props.request.permission + " until ClosedCode is restarted.";
                        }
                      });
                    }
                  }), _$createComponent(Match, {
                    when: true,
                    get children() {
                      var _el$10 = _$createElement("box"),
                        _el$11 = _$createElement("text"),
                        _el$13 = _$createElement("box");
                      _$insertNode(_el$10, _el$11);
                      _$insertNode(_el$10, _el$13);
                      _$setProp(_el$10, "paddingLeft", 1);
                      _$setProp(_el$10, "gap", 1);
                      _$insertNode(_el$11, _$createTextNode(`This will allow the following patterns until ClosedCode is restarted`));
                      _$insert(_el$13, _$createComponent(For, {
                        get each() {
                          return props.request.always;
                        },
                        children: pattern => (() => {
                          var _el$14 = _$createElement("text"),
                            _el$15 = _$createTextNode(`- `);
                          _$insertNode(_el$14, _el$15);
                          _$insert(_el$14, pattern, null);
                          _$effect(_$p => _$setProp(_el$14, "fg", theme.text, _$p));
                          return _el$14;
                        })()
                      }));
                      _$effect(_$p => _$setProp(_el$11, "fg", theme.textMuted, _$p));
                      return _el$10;
                    }
                  })];
                }
              });
            },
            options: {
              confirm: "Confirm",
              cancel: "Cancel"
            },
            escapeKey: "cancel",
            onSelect: option => {
              setStore("stage", "permission");
              if (option === "cancel") return;
              void sdk.client.permission.reply({
                reply: "always",
                requestID: props.request.id,
                workspace: project.workspace.current()
              });
            }
          });
        }
      }), _$createComponent(Match, {
        get when() {
          return store.stage === "reject";
        },
        get children() {
          return _$createComponent(RejectPrompt, {
            onConfirm: message => {
              void sdk.client.permission.reply({
                reply: "reject",
                requestID: props.request.id,
                message: message || undefined,
                workspace: project.workspace.current()
              });
            },
            onCancel: () => {
              setStore("stage", "permission");
            }
          });
        }
      }), _$createComponent(Match, {
        get when() {
          return store.stage === "permission";
        },
        get children() {
          return (() => {
            const info = () => {
              const permission = props.request.permission;
              const data = input();
              if (permission === "edit") {
                const raw = props.request.metadata?.filepath;
                const filepath = typeof raw === "string" ? raw : "";
                return {
                  icon: "→",
                  title: `Edit ${normalizePath(filepath)}`,
                  body: _$createComponent(EditBody, {
                    get request() {
                      return props.request;
                    }
                  })
                };
              }
              if (permission === "read") {
                const raw = data.filePath;
                const filePath = typeof raw === "string" ? raw : "";
                return {
                  icon: "→",
                  title: `Read ${normalizePath(filePath)}`,
                  body: _$createComponent(Show, {
                    when: filePath,
                    get children() {
                      var _el$16 = _$createElement("box"),
                        _el$17 = _$createElement("text");
                      _$insertNode(_el$16, _el$17);
                      _$setProp(_el$16, "paddingLeft", 1);
                      _$insert(_el$17, () => "Path: " + normalizePath(filePath));
                      _$effect(_$p => _$setProp(_el$17, "fg", theme.textMuted, _$p));
                      return _el$16;
                    }
                  })
                };
              }
              if (permission === "glob") {
                const pattern = typeof data.pattern === "string" ? data.pattern : "";
                return {
                  icon: "✱",
                  title: `Glob "${pattern}"`,
                  body: _$createComponent(Show, {
                    when: pattern,
                    get children() {
                      var _el$18 = _$createElement("box"),
                        _el$19 = _$createElement("text");
                      _$insertNode(_el$18, _el$19);
                      _$setProp(_el$18, "paddingLeft", 1);
                      _$insert(_el$19, "Pattern: " + pattern);
                      _$effect(_$p => _$setProp(_el$19, "fg", theme.textMuted, _$p));
                      return _el$18;
                    }
                  })
                };
              }
              if (permission === "grep") {
                const pattern = typeof data.pattern === "string" ? data.pattern : "";
                return {
                  icon: "✱",
                  title: `Grep "${pattern}"`,
                  body: _$createComponent(Show, {
                    when: pattern,
                    get children() {
                      var _el$20 = _$createElement("box"),
                        _el$21 = _$createElement("text");
                      _$insertNode(_el$20, _el$21);
                      _$setProp(_el$20, "paddingLeft", 1);
                      _$insert(_el$21, "Pattern: " + pattern);
                      _$effect(_$p => _$setProp(_el$21, "fg", theme.textMuted, _$p));
                      return _el$20;
                    }
                  })
                };
              }
              if (permission === "list") {
                const raw = data.path;
                const dir = typeof raw === "string" ? raw : "";
                return {
                  icon: "→",
                  title: `List ${normalizePath(dir)}`,
                  body: _$createComponent(Show, {
                    when: dir,
                    get children() {
                      var _el$22 = _$createElement("box"),
                        _el$23 = _$createElement("text");
                      _$insertNode(_el$22, _el$23);
                      _$setProp(_el$22, "paddingLeft", 1);
                      _$insert(_el$23, () => "Path: " + normalizePath(dir));
                      _$effect(_$p => _$setProp(_el$23, "fg", theme.textMuted, _$p));
                      return _el$22;
                    }
                  })
                };
              }
              if (permission === ShellID.ToolID) {
                const title = typeof data.description === "string" && data.description ? data.description : "Shell command";
                const command = typeof data.command === "string" ? data.command : "";
                return {
                  icon: "#",
                  title,
                  body: _$createComponent(Show, {
                    when: command,
                    get children() {
                      var _el$24 = _$createElement("box"),
                        _el$25 = _$createElement("text");
                      _$insertNode(_el$24, _el$25);
                      _$setProp(_el$24, "paddingLeft", 1);
                      _$insert(_el$25, "$ " + command);
                      _$effect(_$p => _$setProp(_el$25, "fg", theme.text, _$p));
                      return _el$24;
                    }
                  })
                };
              }
              if (permission === "task") {
                const type = typeof data.subagent_type === "string" ? data.subagent_type : "Unknown";
                const desc = typeof data.description === "string" ? data.description : "";
                return {
                  icon: "#",
                  title: `${Locale.titlecase(type)} Task`,
                  body: _$createComponent(Show, {
                    when: desc,
                    get children() {
                      var _el$26 = _$createElement("box"),
                        _el$27 = _$createElement("text");
                      _$insertNode(_el$26, _el$27);
                      _$setProp(_el$26, "paddingLeft", 1);
                      _$insert(_el$27, "◉ " + desc);
                      _$effect(_$p => _$setProp(_el$27, "fg", theme.text, _$p));
                      return _el$26;
                    }
                  })
                };
              }
              if (permission === "webfetch") {
                const url = typeof data.url === "string" ? data.url : "";
                return {
                  icon: "%",
                  title: `WebFetch ${url}`,
                  body: _$createComponent(Show, {
                    when: url,
                    get children() {
                      var _el$28 = _$createElement("box"),
                        _el$29 = _$createElement("text");
                      _$insertNode(_el$28, _el$29);
                      _$setProp(_el$28, "paddingLeft", 1);
                      _$insert(_el$29, "URL: " + url);
                      _$effect(_$p => _$setProp(_el$29, "fg", theme.textMuted, _$p));
                      return _el$28;
                    }
                  })
                };
              }
              if (permission === "websearch") {
                const query = typeof data.query === "string" ? data.query : "";
                return {
                  icon: "◈",
                  title: `Exa Web Search "${query}"`,
                  body: _$createComponent(Show, {
                    when: query,
                    get children() {
                      var _el$30 = _$createElement("box"),
                        _el$31 = _$createElement("text");
                      _$insertNode(_el$30, _el$31);
                      _$setProp(_el$30, "paddingLeft", 1);
                      _$insert(_el$31, "Query: " + query);
                      _$effect(_$p => _$setProp(_el$31, "fg", theme.textMuted, _$p));
                      return _el$30;
                    }
                  })
                };
              }
              if (permission === "external_directory") {
                const meta = props.request.metadata ?? {};
                const parent = typeof meta["parentDir"] === "string" ? meta["parentDir"] : undefined;
                const filepath = typeof meta["filepath"] === "string" ? meta["filepath"] : undefined;
                const pattern = props.request.patterns?.[0];
                const derived = typeof pattern === "string" ? pattern.includes("*") ? path.dirname(pattern) : pattern : undefined;
                const raw = parent ?? filepath ?? derived;
                const dir = normalizePath(raw);
                const patterns = (props.request.patterns ?? []).filter(p => typeof p === "string");
                return {
                  icon: "←",
                  title: `Access external directory ${dir}`,
                  body: _$createComponent(Show, {
                    get when() {
                      return patterns.length > 0;
                    },
                    get children() {
                      var _el$32 = _$createElement("box"),
                        _el$33 = _$createElement("text"),
                        _el$35 = _$createElement("box");
                      _$insertNode(_el$32, _el$33);
                      _$insertNode(_el$32, _el$35);
                      _$setProp(_el$32, "paddingLeft", 1);
                      _$setProp(_el$32, "gap", 1);
                      _$insertNode(_el$33, _$createTextNode(`Patterns`));
                      _$insert(_el$35, _$createComponent(For, {
                        each: patterns,
                        children: p => (() => {
                          var _el$36 = _$createElement("text");
                          _$insert(_el$36, "- " + p);
                          _$effect(_$p => _$setProp(_el$36, "fg", theme.text, _$p));
                          return _el$36;
                        })()
                      }));
                      _$effect(_$p => _$setProp(_el$33, "fg", theme.textMuted, _$p));
                      return _el$32;
                    }
                  })
                };
              }
              if (permission === "doom_loop") {
                return {
                  icon: "⟳",
                  title: "Continue after repeated failures",
                  body: (() => {
                    var _el$37 = _$createElement("box"),
                      _el$38 = _$createElement("text");
                    _$insertNode(_el$37, _el$38);
                    _$setProp(_el$37, "paddingLeft", 1);
                    _$insertNode(_el$38, _$createTextNode(`This keeps the session running despite repeated failures.`));
                    _$effect(_$p => _$setProp(_el$38, "fg", theme.textMuted, _$p));
                    return _el$37;
                  })()
                };
              }
              return {
                icon: "⚙",
                title: `Call tool ${permission}`,
                body: (() => {
                  var _el$40 = _$createElement("box"),
                    _el$41 = _$createElement("text");
                  _$insertNode(_el$40, _el$41);
                  _$setProp(_el$40, "paddingLeft", 1);
                  _$insert(_el$41, "Tool: " + permission);
                  _$effect(_$p => _$setProp(_el$41, "fg", theme.textMuted, _$p));
                  return _el$40;
                })()
              };
            };
            const current = info();
            const header = () => (() => {
              var _el$42 = _$createElement("box"),
                _el$43 = _$createElement("box"),
                _el$44 = _$createElement("text"),
                _el$46 = _$createElement("text"),
                _el$48 = _$createElement("box"),
                _el$49 = _$createElement("text"),
                _el$50 = _$createElement("text");
              _$insertNode(_el$42, _el$43);
              _$insertNode(_el$42, _el$48);
              _$setProp(_el$42, "flexDirection", "column");
              _$setProp(_el$42, "gap", 0);
              _$insertNode(_el$43, _el$44);
              _$insertNode(_el$43, _el$46);
              _$setProp(_el$43, "flexDirection", "row");
              _$setProp(_el$43, "gap", 1);
              _$setProp(_el$43, "flexShrink", 0);
              _$insertNode(_el$44, _$createTextNode(`△`));
              _$insertNode(_el$46, _$createTextNode(`Permission required`));
              _$insertNode(_el$48, _el$49);
              _$insertNode(_el$48, _el$50);
              _$setProp(_el$48, "flexDirection", "row");
              _$setProp(_el$48, "gap", 1);
              _$setProp(_el$48, "paddingLeft", 2);
              _$setProp(_el$48, "flexShrink", 0);
              _$setProp(_el$49, "flexShrink", 0);
              _$insert(_el$49, () => current.icon);
              _$insert(_el$50, () => current.title);
              _$effect(_p$ => {
                var _v$15 = theme.warning,
                  _v$16 = theme.text,
                  _v$17 = theme.textMuted,
                  _v$18 = theme.text;
                _v$15 !== _p$.e && (_p$.e = _$setProp(_el$44, "fg", _v$15, _p$.e));
                _v$16 !== _p$.t && (_p$.t = _$setProp(_el$46, "fg", _v$16, _p$.t));
                _v$17 !== _p$.a && (_p$.a = _$setProp(_el$49, "fg", _v$17, _p$.a));
                _v$18 !== _p$.o && (_p$.o = _$setProp(_el$50, "fg", _v$18, _p$.o));
                return _p$;
              }, {
                e: undefined,
                t: undefined,
                a: undefined,
                o: undefined
              });
              return _el$42;
            })();
            const body = _$createComponent(Prompt, {
              title: "Permission required",
              get header() {
                return header();
              },
              get body() {
                return current.body;
              },
              options: {
                once: "Allow once",
                always: "Allow always",
                reject: "Reject"
              },
              escapeKey: "reject",
              fullscreen: true,
              onSelect: option => {
                if (option === "always") {
                  setStore("stage", "always");
                  return;
                }
                if (option === "reject") {
                  if (session()?.parentID) {
                    setStore("stage", "reject");
                    return;
                  }
                  void sdk.client.permission.reply({
                    reply: "reject",
                    requestID: props.request.id,
                    workspace: project.workspace.current()
                  });
                  return;
                }
                void sdk.client.permission.reply({
                  reply: "once",
                  requestID: props.request.id,
                  workspace: project.workspace.current()
                });
              }
            });
            return body;
          })();
        }
      })];
    }
  });
}
function RejectPrompt(props) {
  let input;
  const {
    theme
  } = useTheme();
  const keybind = useKeybind();
  const textareaKeybindings = useTextareaKeybindings();
  const dimensions = useTerminalDimensions();
  const narrow = createMemo(() => dimensions().width < 80);
  const dialog = useDialog();
  useKeyboard(evt => {
    if (dialog.stack.length > 0) return;
    if (evt.name === "escape" || keybind.match("app_exit", evt)) {
      evt.preventDefault();
      props.onCancel();
      return;
    }
    if (evt.name === "return") {
      evt.preventDefault();
      props.onConfirm(input.plainText);
    }
  });
  return (() => {
    var _el$51 = _$createElement("box"),
      _el$52 = _$createElement("box"),
      _el$53 = _$createElement("box"),
      _el$54 = _$createElement("text"),
      _el$56 = _$createElement("text"),
      _el$58 = _$createElement("box"),
      _el$59 = _$createElement("text"),
      _el$61 = _$createElement("box"),
      _el$62 = _$createElement("textarea"),
      _el$63 = _$createElement("box"),
      _el$64 = _$createElement("text"),
      _el$65 = _$createTextNode(`enter `),
      _el$66 = _$createElement("span"),
      _el$68 = _$createElement("text"),
      _el$69 = _$createTextNode(`esc `),
      _el$70 = _$createElement("span");
    _$insertNode(_el$51, _el$52);
    _$insertNode(_el$51, _el$61);
    _$setProp(_el$51, "border", ["left"]);
    _$insertNode(_el$52, _el$53);
    _$insertNode(_el$52, _el$58);
    _$setProp(_el$52, "gap", 1);
    _$setProp(_el$52, "paddingLeft", 1);
    _$setProp(_el$52, "paddingRight", 3);
    _$setProp(_el$52, "paddingTop", 1);
    _$setProp(_el$52, "paddingBottom", 1);
    _$insertNode(_el$53, _el$54);
    _$insertNode(_el$53, _el$56);
    _$setProp(_el$53, "flexDirection", "row");
    _$setProp(_el$53, "gap", 1);
    _$setProp(_el$53, "paddingLeft", 1);
    _$insertNode(_el$54, _$createTextNode(`△`));
    _$insertNode(_el$56, _$createTextNode(`Reject permission`));
    _$insertNode(_el$58, _el$59);
    _$setProp(_el$58, "paddingLeft", 1);
    _$insertNode(_el$59, _$createTextNode(`Tell ClosedCode what to do differently`));
    _$insertNode(_el$61, _el$62);
    _$insertNode(_el$61, _el$63);
    _$setProp(_el$61, "flexShrink", 0);
    _$setProp(_el$61, "paddingTop", 1);
    _$setProp(_el$61, "paddingLeft", 2);
    _$setProp(_el$61, "paddingRight", 3);
    _$setProp(_el$61, "paddingBottom", 1);
    _$setProp(_el$61, "gap", 1);
    _$use(val => {
      input = val;
      val.traits = {
        status: "REJECT"
      };
    }, _el$62);
    _$setProp(_el$62, "focused", true);
    _$insertNode(_el$63, _el$64);
    _$insertNode(_el$63, _el$68);
    _$setProp(_el$63, "flexDirection", "row");
    _$setProp(_el$63, "gap", 2);
    _$setProp(_el$63, "flexShrink", 0);
    _$insertNode(_el$64, _el$65);
    _$insertNode(_el$64, _el$66);
    _$insertNode(_el$66, _$createTextNode(`confirm`));
    _$insertNode(_el$68, _el$69);
    _$insertNode(_el$68, _el$70);
    _$insertNode(_el$70, _$createTextNode(`cancel`));
    _$effect(_p$ => {
      var _v$19 = theme.backgroundPanel,
        _v$20 = theme.error,
        _v$21 = SplitBorder.customBorderChars,
        _v$22 = theme.error,
        _v$23 = theme.text,
        _v$24 = theme.textMuted,
        _v$25 = narrow() ? "column" : "row",
        _v$26 = theme.backgroundElement,
        _v$27 = narrow() ? "flex-start" : "space-between",
        _v$28 = narrow() ? "flex-start" : "center",
        _v$29 = theme.text,
        _v$30 = theme.text,
        _v$31 = theme.primary,
        _v$32 = textareaKeybindings(),
        _v$33 = theme.text,
        _v$34 = {
          fg: theme.textMuted
        },
        _v$35 = theme.text,
        _v$36 = {
          fg: theme.textMuted
        };
      _v$19 !== _p$.e && (_p$.e = _$setProp(_el$51, "backgroundColor", _v$19, _p$.e));
      _v$20 !== _p$.t && (_p$.t = _$setProp(_el$51, "borderColor", _v$20, _p$.t));
      _v$21 !== _p$.a && (_p$.a = _$setProp(_el$51, "customBorderChars", _v$21, _p$.a));
      _v$22 !== _p$.o && (_p$.o = _$setProp(_el$54, "fg", _v$22, _p$.o));
      _v$23 !== _p$.i && (_p$.i = _$setProp(_el$56, "fg", _v$23, _p$.i));
      _v$24 !== _p$.n && (_p$.n = _$setProp(_el$59, "fg", _v$24, _p$.n));
      _v$25 !== _p$.s && (_p$.s = _$setProp(_el$61, "flexDirection", _v$25, _p$.s));
      _v$26 !== _p$.h && (_p$.h = _$setProp(_el$61, "backgroundColor", _v$26, _p$.h));
      _v$27 !== _p$.r && (_p$.r = _$setProp(_el$61, "justifyContent", _v$27, _p$.r));
      _v$28 !== _p$.d && (_p$.d = _$setProp(_el$61, "alignItems", _v$28, _p$.d));
      _v$29 !== _p$.l && (_p$.l = _$setProp(_el$62, "textColor", _v$29, _p$.l));
      _v$30 !== _p$.u && (_p$.u = _$setProp(_el$62, "focusedTextColor", _v$30, _p$.u));
      _v$31 !== _p$.c && (_p$.c = _$setProp(_el$62, "cursorColor", _v$31, _p$.c));
      _v$32 !== _p$.w && (_p$.w = _$setProp(_el$62, "keyBindings", _v$32, _p$.w));
      _v$33 !== _p$.m && (_p$.m = _$setProp(_el$64, "fg", _v$33, _p$.m));
      _v$34 !== _p$.f && (_p$.f = _$setProp(_el$66, "style", _v$34, _p$.f));
      _v$35 !== _p$.y && (_p$.y = _$setProp(_el$68, "fg", _v$35, _p$.y));
      _v$36 !== _p$.g && (_p$.g = _$setProp(_el$70, "style", _v$36, _p$.g));
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
      f: undefined,
      y: undefined,
      g: undefined
    });
    return _el$51;
  })();
}
function Prompt(props) {
  const {
    theme
  } = useTheme();
  const keybind = useKeybind();
  const dimensions = useTerminalDimensions();
  const keys = Object.keys(props.options);
  const [store, setStore] = createStore({
    selected: keys[0],
    expanded: false
  });
  const diffKey = Keybind.parse("ctrl+f")[0];
  const narrow = createMemo(() => dimensions().width < 80);
  const dialog = useDialog();
  useKeyboard(evt => {
    if (dialog.stack.length > 0) return;
    if (evt.name === "left" || evt.name == "h") {
      evt.preventDefault();
      const idx = keys.indexOf(store.selected);
      const next = keys[(idx - 1 + keys.length) % keys.length];
      setStore("selected", next);
    }
    if (evt.name === "right" || evt.name == "l") {
      evt.preventDefault();
      const idx = keys.indexOf(store.selected);
      const next = keys[(idx + 1) % keys.length];
      setStore("selected", next);
    }
    if (evt.name === "return") {
      evt.preventDefault();
      props.onSelect(store.selected);
    }
    if (props.escapeKey && (evt.name === "escape" || keybind.match("app_exit", evt))) {
      evt.preventDefault();
      props.onSelect(props.escapeKey);
    }
    if (props.fullscreen && diffKey && Keybind.match(diffKey, keybind.parse(evt))) {
      evt.preventDefault();
      evt.stopPropagation();
      setStore("expanded", v => !v);
    }
  });
  const hint = createMemo(() => store.expanded ? "minimize" : "fullscreen");
  useRenderer();
  const content = () => (() => {
    var _el$72 = _$createElement("box"),
      _el$73 = _$createElement("box"),
      _el$75 = _$createElement("box"),
      _el$76 = _$createElement("box"),
      _el$77 = _$createElement("box"),
      _el$82 = _$createElement("text"),
      _el$83 = _$createTextNode(`⇆ `),
      _el$85 = _$createElement("span"),
      _el$87 = _$createElement("text"),
      _el$88 = _$createTextNode(`enter `),
      _el$89 = _$createElement("span");
    _$insertNode(_el$72, _el$73);
    _$insertNode(_el$72, _el$75);
    _$setProp(_el$72, "border", ["left"]);
    _$spread(_el$72, _$mergeProps({
      get backgroundColor() {
        return theme.backgroundPanel;
      },
      get borderColor() {
        return theme.warning;
      },
      get customBorderChars() {
        return SplitBorder.customBorderChars;
      }
    }, () => store.expanded ? {
      top: dimensions().height * -1 + 1,
      bottom: 1,
      left: 2,
      right: 2,
      position: "absolute"
    } : {
      top: 0,
      maxHeight: 15,
      bottom: 0,
      left: 0,
      right: 0,
      position: "relative"
    }), true);
    _$setProp(_el$73, "gap", 1);
    _$setProp(_el$73, "paddingLeft", 1);
    _$setProp(_el$73, "paddingRight", 3);
    _$setProp(_el$73, "paddingTop", 1);
    _$setProp(_el$73, "paddingBottom", 1);
    _$setProp(_el$73, "flexGrow", 1);
    _$insert(_el$73, _$createComponent(Show, {
      get when() {
        return props.header;
      },
      get fallback() {
        return (() => {
          var _el$91 = _$createElement("box"),
            _el$92 = _$createElement("text"),
            _el$94 = _$createElement("text");
          _$insertNode(_el$91, _el$92);
          _$insertNode(_el$91, _el$94);
          _$setProp(_el$91, "flexDirection", "row");
          _$setProp(_el$91, "gap", 1);
          _$setProp(_el$91, "paddingLeft", 1);
          _$setProp(_el$91, "flexShrink", 0);
          _$insertNode(_el$92, _$createTextNode(`△`));
          _$insert(_el$94, () => props.title);
          _$effect(_p$ => {
            var _v$47 = theme.warning,
              _v$48 = theme.text;
            _v$47 !== _p$.e && (_p$.e = _$setProp(_el$92, "fg", _v$47, _p$.e));
            _v$48 !== _p$.t && (_p$.t = _$setProp(_el$94, "fg", _v$48, _p$.t));
            return _p$;
          }, {
            e: undefined,
            t: undefined
          });
          return _el$91;
        })();
      },
      get children() {
        var _el$74 = _$createElement("box");
        _$setProp(_el$74, "paddingLeft", 1);
        _$setProp(_el$74, "flexShrink", 0);
        _$insert(_el$74, () => props.header);
        return _el$74;
      }
    }), null);
    _$insert(_el$73, () => props.body, null);
    _$insertNode(_el$75, _el$76);
    _$insertNode(_el$75, _el$77);
    _$setProp(_el$75, "flexShrink", 0);
    _$setProp(_el$75, "gap", 1);
    _$setProp(_el$75, "paddingTop", 1);
    _$setProp(_el$75, "paddingLeft", 2);
    _$setProp(_el$75, "paddingRight", 3);
    _$setProp(_el$75, "paddingBottom", 1);
    _$setProp(_el$76, "flexDirection", "row");
    _$setProp(_el$76, "gap", 1);
    _$setProp(_el$76, "flexShrink", 0);
    _$insert(_el$76, _$createComponent(For, {
      each: keys,
      children: option => (() => {
        var _el$95 = _$createElement("box"),
          _el$96 = _$createElement("text");
        _$insertNode(_el$95, _el$96);
        _$setProp(_el$95, "paddingLeft", 1);
        _$setProp(_el$95, "paddingRight", 1);
        _$setProp(_el$95, "onMouseOver", () => setStore("selected", option));
        _$setProp(_el$95, "onMouseUp", () => {
          setStore("selected", option);
          props.onSelect(option);
        });
        _$insert(_el$96, () => props.options[option]);
        _$effect(_p$ => {
          var _v$49 = option === store.selected ? theme.warning : theme.backgroundMenu,
            _v$50 = option === store.selected ? selectedForeground(theme, theme.warning) : theme.textMuted;
          _v$49 !== _p$.e && (_p$.e = _$setProp(_el$95, "backgroundColor", _v$49, _p$.e));
          _v$50 !== _p$.t && (_p$.t = _$setProp(_el$96, "fg", _v$50, _p$.t));
          return _p$;
        }, {
          e: undefined,
          t: undefined
        });
        return _el$95;
      })()
    }));
    _$insertNode(_el$77, _el$82);
    _$insertNode(_el$77, _el$87);
    _$setProp(_el$77, "flexDirection", "row");
    _$setProp(_el$77, "gap", 2);
    _$setProp(_el$77, "flexShrink", 0);
    _$insert(_el$77, _$createComponent(Show, {
      get when() {
        return props.fullscreen;
      },
      get children() {
        var _el$78 = _$createElement("text"),
          _el$79 = _$createTextNode(`ctrl+f `),
          _el$81 = _$createElement("span");
        _$insertNode(_el$78, _el$79);
        _$insertNode(_el$78, _el$81);
        _$insert(_el$81, hint);
        _$effect(_p$ => {
          var _v$37 = theme.text,
            _v$38 = {
              fg: theme.textMuted
            };
          _v$37 !== _p$.e && (_p$.e = _$setProp(_el$78, "fg", _v$37, _p$.e));
          _v$38 !== _p$.t && (_p$.t = _$setProp(_el$81, "style", _v$38, _p$.t));
          return _p$;
        }, {
          e: undefined,
          t: undefined
        });
        return _el$78;
      }
    }), _el$82);
    _$insertNode(_el$82, _el$83);
    _$insertNode(_el$82, _el$85);
    _$insertNode(_el$85, _$createTextNode(`select`));
    _$insertNode(_el$87, _el$88);
    _$insertNode(_el$87, _el$89);
    _$insertNode(_el$89, _$createTextNode(`confirm`));
    _$effect(_p$ => {
      var _v$39 = narrow() ? "column" : "row",
        _v$40 = theme.backgroundElement,
        _v$41 = narrow() ? "flex-start" : "space-between",
        _v$42 = narrow() ? "flex-start" : "center",
        _v$43 = theme.text,
        _v$44 = {
          fg: theme.textMuted
        },
        _v$45 = theme.text,
        _v$46 = {
          fg: theme.textMuted
        };
      _v$39 !== _p$.e && (_p$.e = _$setProp(_el$75, "flexDirection", _v$39, _p$.e));
      _v$40 !== _p$.t && (_p$.t = _$setProp(_el$75, "backgroundColor", _v$40, _p$.t));
      _v$41 !== _p$.a && (_p$.a = _$setProp(_el$75, "justifyContent", _v$41, _p$.a));
      _v$42 !== _p$.o && (_p$.o = _$setProp(_el$75, "alignItems", _v$42, _p$.o));
      _v$43 !== _p$.i && (_p$.i = _$setProp(_el$82, "fg", _v$43, _p$.i));
      _v$44 !== _p$.n && (_p$.n = _$setProp(_el$85, "style", _v$44, _p$.n));
      _v$45 !== _p$.s && (_p$.s = _$setProp(_el$87, "fg", _v$45, _p$.s));
      _v$46 !== _p$.h && (_p$.h = _$setProp(_el$89, "style", _v$46, _p$.h));
      return _p$;
    }, {
      e: undefined,
      t: undefined,
      a: undefined,
      o: undefined,
      i: undefined,
      n: undefined,
      s: undefined,
      h: undefined
    });
    return _el$72;
  })();
  return _$createComponent(Show, {
    get when() {
      return !store.expanded;
    },
    get fallback() {
      return _$createComponent(Portal, {
        get children() {
          return content();
        }
      });
    },
    get children() {
      return content();
    }
  });
}