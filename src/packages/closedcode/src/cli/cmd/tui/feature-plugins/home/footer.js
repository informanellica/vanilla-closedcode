import { createComponent as _$createComponent } from "@opentui/solid";
import { createTextNode as _$createTextNode } from "@opentui/solid";
import { insertNode as _$insertNode } from "@opentui/solid";
import { setProp as _$setProp } from "@opentui/solid";
import { effect as _$effect } from "@opentui/solid";
import { insert as _$insert } from "@opentui/solid";
import { createElement as _$createElement } from "@opentui/solid";
import { createMemo, Match, Show, Switch } from "solid-js";
import { Global } from "core/global";
const id = "internal:home-footer";
function Directory(props) {
  const theme = () => props.api.theme.current;
  const dir = createMemo(() => {
    const dir = props.api.state.path.directory || process.cwd();
    const out = dir.replace(Global.Path.home, "~");
    const branch = props.api.state.vcs?.branch;
    if (branch) return out + ":" + branch;
    return out;
  });
  return (() => {
    var _el$ = _$createElement("text");
    _$insert(_el$, dir);
    _$effect(_$p => _$setProp(_el$, "fg", theme().textMuted, _$p));
    return _el$;
  })();
}
function Mcp(props) {
  const theme = () => props.api.theme.current;
  const list = createMemo(() => props.api.state.mcp());
  const has = createMemo(() => list().length > 0);
  const err = createMemo(() => list().some(item => item.status === "failed"));
  const count = createMemo(() => list().filter(item => item.status === "connected").length);
  return _$createComponent(Show, {
    get when() {
      return has();
    },
    get children() {
      var _el$2 = _$createElement("box"),
        _el$3 = _$createElement("text"),
        _el$8 = _$createTextNode(` MCP`),
        _el$9 = _$createElement("text");
      _$insertNode(_el$2, _el$3);
      _$insertNode(_el$2, _el$9);
      _$setProp(_el$2, "gap", 1);
      _$setProp(_el$2, "flexDirection", "row");
      _$setProp(_el$2, "flexShrink", 0);
      _$insertNode(_el$3, _el$8);
      _$insert(_el$3, _$createComponent(Switch, {
        get children() {
          return [_$createComponent(Match, {
            get when() {
              return err();
            },
            get children() {
              var _el$4 = _$createElement("span");
              _$insertNode(_el$4, _$createTextNode(`⊙ `));
              _$effect(_$p => _$setProp(_el$4, "style", {
                fg: theme().error
              }, _$p));
              return _el$4;
            }
          }), _$createComponent(Match, {
            when: true,
            get children() {
              var _el$6 = _$createElement("span");
              _$insertNode(_el$6, _$createTextNode(`⊙ `));
              _$effect(_$p => _$setProp(_el$6, "style", {
                fg: count() > 0 ? theme().success : theme().textMuted
              }, _$p));
              return _el$6;
            }
          })];
        }
      }), _el$8);
      _$insert(_el$3, count, _el$8);
      _$insertNode(_el$9, _$createTextNode(`/status`));
      _$effect(_p$ => {
        var _v$ = theme().text,
          _v$2 = theme().textMuted;
        _v$ !== _p$.e && (_p$.e = _$setProp(_el$3, "fg", _v$, _p$.e));
        _v$2 !== _p$.t && (_p$.t = _$setProp(_el$9, "fg", _v$2, _p$.t));
        return _p$;
      }, {
        e: undefined,
        t: undefined
      });
      return _el$2;
    }
  });
}
function Version(props) {
  const theme = () => props.api.theme.current;
  return (() => {
    var _el$1 = _$createElement("box"),
      _el$10 = _$createElement("text");
    _$insertNode(_el$1, _el$10);
    _$setProp(_el$1, "flexShrink", 0);
    _$insert(_el$10, () => props.api.app.version);
    _$effect(_$p => _$setProp(_el$10, "fg", theme().textMuted, _$p));
    return _el$1;
  })();
}
function View(props) {
  return (() => {
    var _el$11 = _$createElement("box"),
      _el$12 = _$createElement("box");
    _$insertNode(_el$11, _el$12);
    _$setProp(_el$11, "width", "100%");
    _$setProp(_el$11, "paddingTop", 1);
    _$setProp(_el$11, "paddingBottom", 1);
    _$setProp(_el$11, "paddingLeft", 2);
    _$setProp(_el$11, "paddingRight", 2);
    _$setProp(_el$11, "flexDirection", "row");
    _$setProp(_el$11, "flexShrink", 0);
    _$setProp(_el$11, "gap", 2);
    _$insert(_el$11, _$createComponent(Directory, {
      get api() {
        return props.api;
      }
    }), _el$12);
    _$insert(_el$11, _$createComponent(Mcp, {
      get api() {
        return props.api;
      }
    }), _el$12);
    _$setProp(_el$12, "flexGrow", 1);
    _$insert(_el$11, _$createComponent(Version, {
      get api() {
        return props.api;
      }
    }), null);
    return _el$11;
  })();
}
const tui = async api => {
  api.slots.register({
    order: 100,
    slots: {
      home_footer() {
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