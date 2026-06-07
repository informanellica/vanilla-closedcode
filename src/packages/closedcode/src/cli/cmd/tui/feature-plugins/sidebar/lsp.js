import { createTextNode as _$createTextNode } from "@opentui/solid";
import { insertNode as _$insertNode } from "@opentui/solid";
import { createComponent as _$createComponent } from "@opentui/solid";
import { effect as _$effect } from "@opentui/solid";
import { insert as _$insert } from "@opentui/solid";
import { memo as _$memo } from "@opentui/solid";
import { setProp as _$setProp } from "@opentui/solid";
import { createElement as _$createElement } from "@opentui/solid";
import { createMemo, For, Show, createSignal } from "solid-js";
const id = "internal:sidebar-lsp";
function View(props) {
  const [open, setOpen] = createSignal(true);
  const theme = () => props.api.theme.current;
  const list = createMemo(() => props.api.state.lsp());
  const off = createMemo(() => props.api.state.config.lsp === false);
  return (() => {
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
    _$insertNode(_el$5, _$createTextNode(`LSP`));
    _$insert(_el$, _$createComponent(Show, {
      get when() {
        return list().length <= 2 || open();
      },
      get children() {
        return [_$createComponent(Show, {
          get when() {
            return list().length === 0;
          },
          get children() {
            var _el$7 = _$createElement("text");
            _$insert(_el$7, () => off() ? "LSPs have been disabled in settings" : "LSPs will activate as files are read");
            _$effect(_$p => _$setProp(_el$7, "fg", theme().textMuted, _$p));
            return _el$7;
          }
        }), _$createComponent(For, {
          get each() {
            return list();
          },
          children: item => (() => {
            var _el$8 = _$createElement("box"),
              _el$9 = _$createElement("text"),
              _el$1 = _$createElement("text"),
              _el$10 = _$createTextNode(` `);
            _$insertNode(_el$8, _el$9);
            _$insertNode(_el$8, _el$1);
            _$setProp(_el$8, "flexDirection", "row");
            _$setProp(_el$8, "gap", 1);
            _$insertNode(_el$9, _$createTextNode(`•`));
            _$setProp(_el$9, "flexShrink", 0);
            _$insertNode(_el$1, _el$10);
            _$insert(_el$1, () => item.id, _el$10);
            _$insert(_el$1, () => item.root, null);
            _$effect(_p$ => {
              var _v$ = {
                  fg: item.status === "connected" ? theme().success : theme().error
                },
                _v$2 = theme().textMuted;
              _v$ !== _p$.e && (_p$.e = _$setProp(_el$9, "style", _v$, _p$.e));
              _v$2 !== _p$.t && (_p$.t = _$setProp(_el$1, "fg", _v$2, _p$.t));
              return _p$;
            }, {
              e: undefined,
              t: undefined
            });
            return _el$8;
          })()
        })];
      }
    }), null);
    _$effect(_$p => _$setProp(_el$4, "fg", theme().text, _$p));
    return _el$;
  })();
}
const tui = async api => {
  api.slots.register({
    order: 300,
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