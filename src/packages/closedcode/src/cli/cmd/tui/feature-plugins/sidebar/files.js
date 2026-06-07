import { createTextNode as _$createTextNode } from "@opentui/solid";
import { insertNode as _$insertNode } from "@opentui/solid";
import { createComponent as _$createComponent } from "@opentui/solid";
import { effect as _$effect } from "@opentui/solid";
import { insert as _$insert } from "@opentui/solid";
import { memo as _$memo } from "@opentui/solid";
import { setProp as _$setProp } from "@opentui/solid";
import { createElement as _$createElement } from "@opentui/solid";
import { createMemo, For, Show, createSignal } from "solid-js";
const id = "internal:sidebar-files";
function View(props) {
  const [open, setOpen] = createSignal(true);
  const theme = () => props.api.theme.current;
  const list = createMemo(() => props.api.state.session.diff(props.session_id));
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
      _$insertNode(_el$5, _$createTextNode(`Modified Files`));
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
              var _el$7 = _$createElement("box"),
                _el$8 = _$createElement("text"),
                _el$9 = _$createElement("box");
              _$insertNode(_el$7, _el$8);
              _$insertNode(_el$7, _el$9);
              _$setProp(_el$7, "flexDirection", "row");
              _$setProp(_el$7, "gap", 1);
              _$setProp(_el$7, "justifyContent", "space-between");
              _$setProp(_el$8, "wrapMode", "none");
              _$insert(_el$8, () => item.file);
              _$setProp(_el$9, "flexDirection", "row");
              _$setProp(_el$9, "gap", 1);
              _$setProp(_el$9, "flexShrink", 0);
              _$insert(_el$9, _$createComponent(Show, {
                get when() {
                  return item.additions;
                },
                get children() {
                  var _el$0 = _$createElement("text"),
                    _el$1 = _$createTextNode(`+`);
                  _$insertNode(_el$0, _el$1);
                  _$insert(_el$0, () => item.additions, null);
                  _$effect(_$p => _$setProp(_el$0, "fg", theme().diffAdded, _$p));
                  return _el$0;
                }
              }), null);
              _$insert(_el$9, _$createComponent(Show, {
                get when() {
                  return item.deletions;
                },
                get children() {
                  var _el$10 = _$createElement("text"),
                    _el$11 = _$createTextNode(`-`);
                  _$insertNode(_el$10, _el$11);
                  _$insert(_el$10, () => item.deletions, null);
                  _$effect(_$p => _$setProp(_el$10, "fg", theme().diffRemoved, _$p));
                  return _el$10;
                }
              }), null);
              _$effect(_$p => _$setProp(_el$8, "fg", theme().textMuted, _$p));
              return _el$7;
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
    order: 500,
    slots: {
      sidebar_content(_ctx, props) {
        return _$createComponent(View, {
          api: api,
          get session_id() {
            return props.session_id;
          }
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