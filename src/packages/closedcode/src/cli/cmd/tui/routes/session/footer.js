import { memo as _$memo } from "@opentui/solid";
import { createComponent as _$createComponent } from "@opentui/solid";
import { effect as _$effect } from "@opentui/solid";
import { createTextNode as _$createTextNode } from "@opentui/solid";
import { insertNode as _$insertNode } from "@opentui/solid";
import { insert as _$insert } from "@opentui/solid";
import { setProp as _$setProp } from "@opentui/solid";
import { createElement as _$createElement } from "@opentui/solid";
import { createMemo, Match, onCleanup, onMount, Show, Switch } from "solid-js";
import { useTheme } from "../../context/theme.js";
import { useSync } from "../../context/sync.js";
import { useDirectory } from "../../context/directory.js";
import { useConnected } from "../../component/use-connected.js";
import { createStore } from "solid-js/store";
import { useRoute } from "../../context/route.js";
export function Footer() {
  const {
    theme
  } = useTheme();
  const sync = useSync();
  const route = useRoute();
  const mcp = createMemo(() => Object.values(sync.data.mcp).filter(x => x.status === "connected").length);
  const mcpError = createMemo(() => Object.values(sync.data.mcp).some(x => x.status === "failed"));
  const lsp = createMemo(() => Object.keys(sync.data.lsp));
  const permissions = createMemo(() => {
    if (route.data.type !== "session") return [];
    return sync.data.permission[route.data.sessionID] ?? [];
  });
  const directory = useDirectory();
  const connected = useConnected();
  const [store, setStore] = createStore({
    welcome: false
  });
  onMount(() => {
    // Track all timeouts to ensure proper cleanup
    const timeouts = [];
    function tick() {
      if (connected()) return;
      if (!store.welcome) {
        setStore("welcome", true);
        timeouts.push(setTimeout(() => tick(), 5000));
        return;
      }
      if (store.welcome) {
        setStore("welcome", false);
        timeouts.push(setTimeout(() => tick(), 10_000));
        return;
      }
    }
    timeouts.push(setTimeout(() => tick(), 10_000));
    onCleanup(() => {
      timeouts.forEach(clearTimeout);
    });
  });
  return (() => {
    var _el$ = _$createElement("box"),
      _el$2 = _$createElement("text"),
      _el$3 = _$createElement("box");
    _$insertNode(_el$, _el$2);
    _$insertNode(_el$, _el$3);
    _$setProp(_el$, "flexDirection", "row");
    _$setProp(_el$, "justifyContent", "space-between");
    _$setProp(_el$, "gap", 1);
    _$setProp(_el$, "flexShrink", 0);
    _$insert(_el$2, directory);
    _$setProp(_el$3, "gap", 2);
    _$setProp(_el$3, "flexDirection", "row");
    _$setProp(_el$3, "flexShrink", 0);
    _$insert(_el$3, _$createComponent(Switch, {
      get children() {
        return [_$createComponent(Match, {
          get when() {
            return store.welcome;
          },
          get children() {
            var _el$4 = _$createElement("text"),
              _el$5 = _$createTextNode(`Get started `),
              _el$6 = _$createElement("span");
            _$insertNode(_el$4, _el$5);
            _$insertNode(_el$4, _el$6);
            _$insertNode(_el$6, _$createTextNode(`/connect`));
            _$effect(_p$ => {
              var _v$ = theme.text,
                _v$2 = {
                  fg: theme.textMuted
                };
              _v$ !== _p$.e && (_p$.e = _$setProp(_el$4, "fg", _v$, _p$.e));
              _v$2 !== _p$.t && (_p$.t = _$setProp(_el$6, "style", _v$2, _p$.t));
              return _p$;
            }, {
              e: undefined,
              t: undefined
            });
            return _el$4;
          }
        }), _$createComponent(Match, {
          get when() {
            return connected();
          },
          get children() {
            return [_$createComponent(Show, {
              get when() {
                return permissions().length > 0;
              },
              get children() {
                var _el$8 = _$createElement("text"),
                  _el$9 = _$createElement("span"),
                  _el$1 = _$createTextNode(` `),
                  _el$10 = _$createTextNode(` Permission`);
                _$insertNode(_el$8, _el$9);
                _$insertNode(_el$8, _el$1);
                _$insertNode(_el$8, _el$10);
                _$insertNode(_el$9, _$createTextNode(`△`));
                _$insert(_el$8, () => permissions().length, _el$10);
                _$insert(_el$8, () => permissions().length > 1 ? "s" : "", null);
                _$effect(_p$ => {
                  var _v$3 = theme.warning,
                    _v$4 = {
                      fg: theme.warning
                    };
                  _v$3 !== _p$.e && (_p$.e = _$setProp(_el$8, "fg", _v$3, _p$.e));
                  _v$4 !== _p$.t && (_p$.t = _$setProp(_el$9, "style", _v$4, _p$.t));
                  return _p$;
                }, {
                  e: undefined,
                  t: undefined
                });
                return _el$8;
              }
            }), (() => {
              var _el$11 = _$createElement("text"),
                _el$12 = _$createElement("span"),
                _el$14 = _$createTextNode(` `),
                _el$15 = _$createTextNode(` LSP`);
              _$insertNode(_el$11, _el$12);
              _$insertNode(_el$11, _el$14);
              _$insertNode(_el$11, _el$15);
              _$insertNode(_el$12, _$createTextNode(`•`));
              _$insert(_el$11, () => lsp().length, _el$15);
              _$effect(_p$ => {
                var _v$5 = theme.text,
                  _v$6 = {
                    fg: lsp().length > 0 ? theme.success : theme.textMuted
                  };
                _v$5 !== _p$.e && (_p$.e = _$setProp(_el$11, "fg", _v$5, _p$.e));
                _v$6 !== _p$.t && (_p$.t = _$setProp(_el$12, "style", _v$6, _p$.t));
                return _p$;
              }, {
                e: undefined,
                t: undefined
              });
              return _el$11;
            })(), _$createComponent(Show, {
              get when() {
                return mcp();
              },
              get children() {
                var _el$16 = _$createElement("text"),
                  _el$21 = _$createTextNode(` MCP`);
                _$insertNode(_el$16, _el$21);
                _$insert(_el$16, _$createComponent(Switch, {
                  get children() {
                    return [_$createComponent(Match, {
                      get when() {
                        return mcpError();
                      },
                      get children() {
                        var _el$17 = _$createElement("span");
                        _$insertNode(_el$17, _$createTextNode(`⊙ `));
                        _$effect(_$p => _$setProp(_el$17, "style", {
                          fg: theme.error
                        }, _$p));
                        return _el$17;
                      }
                    }), _$createComponent(Match, {
                      when: true,
                      get children() {
                        var _el$19 = _$createElement("span");
                        _$insertNode(_el$19, _$createTextNode(`⊙ `));
                        _$effect(_$p => _$setProp(_el$19, "style", {
                          fg: theme.success
                        }, _$p));
                        return _el$19;
                      }
                    })];
                  }
                }), _el$21);
                _$insert(_el$16, mcp, _el$21);
                _$effect(_$p => _$setProp(_el$16, "fg", theme.text, _$p));
                return _el$16;
              }
            }), (() => {
              var _el$22 = _$createElement("text");
              _$insertNode(_el$22, _$createTextNode(`/status`));
              _$effect(_$p => _$setProp(_el$22, "fg", theme.textMuted, _$p));
              return _el$22;
            })()];
          }
        })];
      }
    }));
    _$effect(_$p => _$setProp(_el$2, "fg", theme.textMuted, _$p));
    return _el$;
  })();
}