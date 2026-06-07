import { createTextNode as _$createTextNode } from "@opentui/solid";
import { insertNode as _$insertNode } from "@opentui/solid";
import { createComponent as _$createComponent } from "@opentui/solid";
import { effect as _$effect } from "@opentui/solid";
import { insert as _$insert } from "@opentui/solid";
import { memo as _$memo } from "@opentui/solid";
import { setProp as _$setProp } from "@opentui/solid";
import { createElement as _$createElement } from "@opentui/solid";
import { createMemo, For, Match, Show, Switch, createSignal } from "solid-js";
const id = "internal:sidebar-mcp";
function View(props) {
  const [open, setOpen] = createSignal(true);
  const theme = () => props.api.theme.current;
  const list = createMemo(() => props.api.state.mcp());
  const on = createMemo(() => list().filter(item => item.status === "connected").length);
  const bad = createMemo(() => list().filter(item => item.status === "failed" || item.status === "needs_auth" || item.status === "needs_client_registration").length);
  const dot = status => {
    if (status === "connected") return theme().success;
    if (status === "failed") return theme().error;
    if (status === "disabled") return theme().textMuted;
    if (status === "needs_auth") return theme().warning;
    if (status === "needs_client_registration") return theme().error;
    return theme().textMuted;
  };
  return _$createComponent(Show, {
    get when() {
      return list().length > 0;
    },
    get children() {
      var _el$ = _$createElement("box"),
        _el$2 = _$createElement("box"),
        _el$4 = _$createElement("text"),
        _el$5 = _$createElement("b");
      _$insertNode(_el$, _el$2);
      _$insertNode(_el$2, _el$4);
      _$setProp(_el$2, "flexDirection", "row");
      _$setProp(_el$2, "gap", 1);
      _$setProp(_el$2, "onMouseDown", () => list().length > 2 && setOpen(x => !x));
      _$insert(_el$2, _$createComponent(Show, {
        get when() {
          return list().length > 2;
        },
        get children() {
          var _el$3 = _$createElement("text");
          _$insert(_el$3, () => open() ? "▼" : "▶");
          _$effect(_$p => _$setProp(_el$3, "fg", theme().text, _$p));
          return _el$3;
        }
      }), _el$4);
      _$insertNode(_el$4, _el$5);
      _$insertNode(_el$5, _$createTextNode(`MCP`));
      _$insert(_el$4, _$createComponent(Show, {
        get when() {
          return !open();
        },
        get children() {
          var _el$7 = _$createElement("span"),
            _el$8 = _$createTextNode(` (`),
            _el$0 = _$createTextNode(` active`),
            _el$1 = _$createTextNode(`)`);
          _$insertNode(_el$7, _el$8);
          _$insertNode(_el$7, _el$0);
          _$insertNode(_el$7, _el$1);
          _$insert(_el$7, on, _el$0);
          _$insert(_el$7, (() => {
            var _c$ = _$memo(() => bad() > 0);
            return () => _c$() ? `, ${bad()} error${bad() > 1 ? "s" : ""}` : "";
          })(), _el$1);
          _$effect(_$p => _$setProp(_el$7, "style", {
            fg: theme().textMuted
          }, _$p));
          return _el$7;
        }
      }), null);
      _$insert(_el$, _$createComponent(Show, {
        get when() {
          return list().length <= 2 || open();
        },
        get children() {
          return _$createComponent(For, {
            get each() {
              return list();
            },
            children: item => (() => {
              var _el$10 = _$createElement("box"),
                _el$11 = _$createElement("text"),
                _el$13 = _$createElement("text"),
                _el$14 = _$createTextNode(` `),
                _el$15 = _$createElement("span");
              _$insertNode(_el$10, _el$11);
              _$insertNode(_el$10, _el$13);
              _$setProp(_el$10, "flexDirection", "row");
              _$setProp(_el$10, "gap", 1);
              _$insertNode(_el$11, _$createTextNode(`•`));
              _$setProp(_el$11, "flexShrink", 0);
              _$insertNode(_el$13, _el$14);
              _$insertNode(_el$13, _el$15);
              _$setProp(_el$13, "wrapMode", "word");
              _$insert(_el$13, () => item.name, _el$14);
              _$insert(_el$15, _$createComponent(Switch, {
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
                      return item.status === "failed";
                    },
                    get children() {
                      var _el$16 = _$createElement("i");
                      _$insert(_el$16, () => item.error);
                      return _el$16;
                    }
                  }), _$createComponent(Match, {
                    get when() {
                      return item.status === "disabled";
                    },
                    children: "Disabled"
                  }), _$createComponent(Match, {
                    get when() {
                      return item.status === "needs_auth";
                    },
                    children: "Needs auth"
                  }), _$createComponent(Match, {
                    get when() {
                      return item.status === "needs_client_registration";
                    },
                    children: "Needs client ID"
                  })];
                }
              }));
              _$effect(_p$ => {
                var _v$ = {
                    fg: dot(item.status)
                  },
                  _v$2 = theme().text,
                  _v$3 = {
                    fg: theme().textMuted
                  };
                _v$ !== _p$.e && (_p$.e = _$setProp(_el$11, "style", _v$, _p$.e));
                _v$2 !== _p$.t && (_p$.t = _$setProp(_el$13, "fg", _v$2, _p$.t));
                _v$3 !== _p$.a && (_p$.a = _$setProp(_el$15, "style", _v$3, _p$.a));
                return _p$;
              }, {
                e: undefined,
                t: undefined,
                a: undefined
              });
              return _el$10;
            })()
          });
        }
      }), null);
      _$effect(_$p => _$setProp(_el$4, "fg", theme().text, _$p));
      return _el$;
    }
  });
}
const tui = async api => {
  api.slots.register({
    order: 200,
    slots: {
      sidebar_content() {
        return _$createComponent(View, {
          api: api
        });
      }
    }
  });
};
const plugin = {
  id,
  tui
};
export default plugin;