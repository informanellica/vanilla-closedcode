import { memo as _$memo } from "@opentui/solid";
import { effect as _$effect } from "@opentui/solid";
import { createComponent as _$createComponent } from "@opentui/solid";
import { insert as _$insert } from "@opentui/solid";
import { createTextNode as _$createTextNode } from "@opentui/solid";
import { insertNode as _$insertNode } from "@opentui/solid";
import { setProp as _$setProp } from "@opentui/solid";
import { createElement as _$createElement } from "@opentui/solid";
import { TextAttributes } from "@opentui/core";
import { fileURLToPath } from "node:url";
import { useTheme } from "../context/theme.js";
import { useDialog } from "#tui/ui/dialog.js";
import { useSync } from "#tui/context/sync.js";
import { For, Match, Switch, Show, createMemo } from "solid-js";
export function DialogStatus() {
  const sync = useSync();
  const {
    theme
  } = useTheme();
  const dialog = useDialog();
  const enabledFormatters = createMemo(() => sync.data.formatter.filter(f => f.enabled));
  const plugins = createMemo(() => {
    const list = sync.data.config.plugin ?? [];
    const result = list.map(item => {
      const value = typeof item === "string" ? item : item[0];
      if (value.startsWith("file://")) {
        const path = fileURLToPath(value);
        const parts = path.split("/");
        const filename = parts.pop() || path;
        if (!filename.includes(".")) return {
          name: filename
        };
        const basename = filename.split(".")[0];
        if (basename === "index") {
          const dirname = parts.pop();
          const name = dirname || basename;
          return {
            name
          };
        }
        return {
          name: basename
        };
      }
      const index = value.lastIndexOf("@");
      if (index <= 0) return {
        name: value,
        version: "latest"
      };
      const name = value.substring(0, index);
      const version = value.substring(index + 1);
      return {
        name,
        version
      };
    });
    return result.toSorted((a, b) => a.name.localeCompare(b.name));
  });
  return (() => {
    var _el$ = _$createElement("box"),
      _el$2 = _$createElement("box"),
      _el$3 = _$createElement("text"),
      _el$5 = _$createElement("text");
    _$insertNode(_el$, _el$2);
    _$setProp(_el$, "paddingLeft", 2);
    _$setProp(_el$, "paddingRight", 2);
    _$setProp(_el$, "gap", 1);
    _$setProp(_el$, "paddingBottom", 1);
    _$insertNode(_el$2, _el$3);
    _$insertNode(_el$2, _el$5);
    _$setProp(_el$2, "flexDirection", "row");
    _$setProp(_el$2, "justifyContent", "space-between");
    _$insertNode(_el$3, _$createTextNode(`Status`));
    _$insertNode(_el$5, _$createTextNode(`esc`));
    _$setProp(_el$5, "onMouseUp", () => dialog.clear());
    _$insert(_el$, _$createComponent(Show, {
      get when() {
        return Object.keys(sync.data.mcp).length > 0;
      },
      get fallback() {
        return (() => {
          var _el$14 = _$createElement("text");
          _$insertNode(_el$14, _$createTextNode(`No MCP Servers`));
          _$effect(_$p => _$setProp(_el$14, "fg", theme.text, _$p));
          return _el$14;
        })();
      },
      get children() {
        var _el$7 = _$createElement("box"),
          _el$8 = _$createElement("text"),
          _el$9 = _$createTextNode(` MCP Servers`);
        _$insertNode(_el$7, _el$8);
        _$insertNode(_el$8, _el$9);
        _$insert(_el$8, () => Object.keys(sync.data.mcp).length, _el$9);
        _$insert(_el$7, _$createComponent(For, {
          get each() {
            return Object.entries(sync.data.mcp);
          },
          children: ([key, item]) => (() => {
            var _el$16 = _$createElement("box"),
              _el$17 = _$createElement("text"),
              _el$19 = _$createElement("text"),
              _el$20 = _$createElement("b"),
              _el$21 = _$createTextNode(` `),
              _el$22 = _$createElement("span");
            _$insertNode(_el$16, _el$17);
            _$insertNode(_el$16, _el$19);
            _$setProp(_el$16, "flexDirection", "row");
            _$setProp(_el$16, "gap", 1);
            _$insertNode(_el$17, _$createTextNode(`•`));
            _$setProp(_el$17, "flexShrink", 0);
            _$insertNode(_el$19, _el$20);
            _$insertNode(_el$19, _el$21);
            _$insertNode(_el$19, _el$22);
            _$setProp(_el$19, "wrapMode", "word");
            _$insert(_el$20, key);
            _$insert(_el$22, _$createComponent(Switch, {
              get fallback() {
                return item.status;
              },
              get children() {
                return [_$createComponent(Match, {
                  get when() {
                    return item.status === "connected";
                  },
                  children: "Connected"
                }), _$createComponent(Match, {
                  get when() {
                    return item.status === "failed" && item;
                  },
                  children: val => val().error
                }), _$createComponent(Match, {
                  get when() {
                    return item.status === "disabled";
                  },
                  children: "Disabled in configuration"
                }), _$createComponent(Match, {
                  get when() {
                    return item.status === "needs_auth";
                  },
                  get children() {
                    return ["Needs authentication (run: closedcode mcp auth ", key, ")"];
                  }
                }), _$createComponent(Match, {
                  get when() {
                    return item.status === "needs_client_registration" && item;
                  },
                  children: val => val().error
                })];
              }
            }));
            _$effect(_p$ => {
              var _v$4 = {
                  fg: {
                    connected: theme.success,
                    failed: theme.error,
                    disabled: theme.textMuted,
                    needs_auth: theme.warning,
                    needs_client_registration: theme.error
                  }[item.status]
                },
                _v$5 = theme.text,
                _v$6 = {
                  fg: theme.textMuted
                };
              _v$4 !== _p$.e && (_p$.e = _$setProp(_el$17, "style", _v$4, _p$.e));
              _v$5 !== _p$.t && (_p$.t = _$setProp(_el$19, "fg", _v$5, _p$.t));
              _v$6 !== _p$.a && (_p$.a = _$setProp(_el$22, "style", _v$6, _p$.a));
              return _p$;
            }, {
              e: undefined,
              t: undefined,
              a: undefined
            });
            return _el$16;
          })()
        }), null);
        _$effect(_$p => _$setProp(_el$8, "fg", theme.text, _$p));
        return _el$7;
      }
    }), null);
    _$insert(_el$, (() => {
      var _c$ = _$memo(() => sync.data.lsp.length > 0);
      return () => _c$() && (() => {
        var _el$23 = _$createElement("box"),
          _el$24 = _$createElement("text"),
          _el$25 = _$createTextNode(` LSP Servers`);
        _$insertNode(_el$23, _el$24);
        _$insertNode(_el$24, _el$25);
        _$insert(_el$24, () => sync.data.lsp.length, _el$25);
        _$insert(_el$23, _$createComponent(For, {
          get each() {
            return sync.data.lsp;
          },
          children: item => (() => {
            var _el$26 = _$createElement("box"),
              _el$27 = _$createElement("text"),
              _el$29 = _$createElement("text"),
              _el$30 = _$createElement("b"),
              _el$31 = _$createTextNode(` `),
              _el$32 = _$createElement("span");
            _$insertNode(_el$26, _el$27);
            _$insertNode(_el$26, _el$29);
            _$setProp(_el$26, "flexDirection", "row");
            _$setProp(_el$26, "gap", 1);
            _$insertNode(_el$27, _$createTextNode(`•`));
            _$setProp(_el$27, "flexShrink", 0);
            _$insertNode(_el$29, _el$30);
            _$insertNode(_el$29, _el$31);
            _$insertNode(_el$29, _el$32);
            _$setProp(_el$29, "wrapMode", "word");
            _$insert(_el$30, () => item.id);
            _$insert(_el$32, () => item.root);
            _$effect(_p$ => {
              var _v$7 = {
                  fg: {
                    connected: theme.success,
                    error: theme.error
                  }[item.status]
                },
                _v$8 = theme.text,
                _v$9 = {
                  fg: theme.textMuted
                };
              _v$7 !== _p$.e && (_p$.e = _$setProp(_el$27, "style", _v$7, _p$.e));
              _v$8 !== _p$.t && (_p$.t = _$setProp(_el$29, "fg", _v$8, _p$.t));
              _v$9 !== _p$.a && (_p$.a = _$setProp(_el$32, "style", _v$9, _p$.a));
              return _p$;
            }, {
              e: undefined,
              t: undefined,
              a: undefined
            });
            return _el$26;
          })()
        }), null);
        _$effect(_$p => _$setProp(_el$24, "fg", theme.text, _$p));
        return _el$23;
      })();
    })(), null);
    _$insert(_el$, _$createComponent(Show, {
      get when() {
        return enabledFormatters().length > 0;
      },
      get fallback() {
        return (() => {
          var _el$33 = _$createElement("text");
          _$insertNode(_el$33, _$createTextNode(`No Formatters`));
          _$effect(_$p => _$setProp(_el$33, "fg", theme.text, _$p));
          return _el$33;
        })();
      },
      get children() {
        var _el$0 = _$createElement("box"),
          _el$1 = _$createElement("text"),
          _el$10 = _$createTextNode(` Formatters`);
        _$insertNode(_el$0, _el$1);
        _$insertNode(_el$1, _el$10);
        _$insert(_el$1, () => enabledFormatters().length, _el$10);
        _$insert(_el$0, _$createComponent(For, {
          get each() {
            return enabledFormatters();
          },
          children: item => (() => {
            var _el$35 = _$createElement("box"),
              _el$36 = _$createElement("text"),
              _el$38 = _$createElement("text"),
              _el$39 = _$createElement("b");
            _$insertNode(_el$35, _el$36);
            _$insertNode(_el$35, _el$38);
            _$setProp(_el$35, "flexDirection", "row");
            _$setProp(_el$35, "gap", 1);
            _$insertNode(_el$36, _$createTextNode(`•`));
            _$setProp(_el$36, "flexShrink", 0);
            _$insertNode(_el$38, _el$39);
            _$setProp(_el$38, "wrapMode", "word");
            _$insert(_el$39, () => item.name);
            _$effect(_p$ => {
              var _v$0 = {
                  fg: theme.success
                },
                _v$1 = theme.text;
              _v$0 !== _p$.e && (_p$.e = _$setProp(_el$36, "style", _v$0, _p$.e));
              _v$1 !== _p$.t && (_p$.t = _$setProp(_el$38, "fg", _v$1, _p$.t));
              return _p$;
            }, {
              e: undefined,
              t: undefined
            });
            return _el$35;
          })()
        }), null);
        _$effect(_$p => _$setProp(_el$1, "fg", theme.text, _$p));
        return _el$0;
      }
    }), null);
    _$insert(_el$, _$createComponent(Show, {
      get when() {
        return plugins().length > 0;
      },
      get fallback() {
        return (() => {
          var _el$40 = _$createElement("text");
          _$insertNode(_el$40, _$createTextNode(`No Plugins`));
          _$effect(_$p => _$setProp(_el$40, "fg", theme.text, _$p));
          return _el$40;
        })();
      },
      get children() {
        var _el$11 = _$createElement("box"),
          _el$12 = _$createElement("text"),
          _el$13 = _$createTextNode(` Plugins`);
        _$insertNode(_el$11, _el$12);
        _$insertNode(_el$12, _el$13);
        _$insert(_el$12, () => plugins().length, _el$13);
        _$insert(_el$11, _$createComponent(For, {
          get each() {
            return plugins();
          },
          children: item => (() => {
            var _el$42 = _$createElement("box"),
              _el$43 = _$createElement("text"),
              _el$45 = _$createElement("text"),
              _el$46 = _$createElement("b");
            _$insertNode(_el$42, _el$43);
            _$insertNode(_el$42, _el$45);
            _$setProp(_el$42, "flexDirection", "row");
            _$setProp(_el$42, "gap", 1);
            _$insertNode(_el$43, _$createTextNode(`•`));
            _$setProp(_el$43, "flexShrink", 0);
            _$insertNode(_el$45, _el$46);
            _$setProp(_el$45, "wrapMode", "word");
            _$insert(_el$46, () => item.name);
            _$insert(_el$45, (() => {
              var _c$2 = _$memo(() => !!item.version);
              return () => _c$2() && (() => {
                var _el$47 = _$createElement("span"),
                  _el$48 = _$createTextNode(` @`);
                _$insertNode(_el$47, _el$48);
                _$insert(_el$47, () => item.version, null);
                _$effect(_$p => _$setProp(_el$47, "style", {
                  fg: theme.textMuted
                }, _$p));
                return _el$47;
              })();
            })(), null);
            _$effect(_p$ => {
              var _v$10 = {
                  fg: theme.success
                },
                _v$11 = theme.text;
              _v$10 !== _p$.e && (_p$.e = _$setProp(_el$43, "style", _v$10, _p$.e));
              _v$11 !== _p$.t && (_p$.t = _$setProp(_el$45, "fg", _v$11, _p$.t));
              return _p$;
            }, {
              e: undefined,
              t: undefined
            });
            return _el$42;
          })()
        }), null);
        _$effect(_$p => _$setProp(_el$12, "fg", theme.text, _$p));
        return _el$11;
      }
    }), null);
    _$effect(_p$ => {
      var _v$ = theme.text,
        _v$2 = TextAttributes.BOLD,
        _v$3 = theme.textMuted;
      _v$ !== _p$.e && (_p$.e = _$setProp(_el$3, "fg", _v$, _p$.e));
      _v$2 !== _p$.t && (_p$.t = _$setProp(_el$3, "attributes", _v$2, _p$.t));
      _v$3 !== _p$.a && (_p$.a = _$setProp(_el$5, "fg", _v$3, _p$.a));
      return _p$;
    }, {
      e: undefined,
      t: undefined,
      a: undefined
    });
    return _el$;
  })();
}