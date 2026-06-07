import { createTextNode as _$createTextNode } from "@opentui/solid";
import { insertNode as _$insertNode } from "@opentui/solid";
import { createComponent as _$createComponent } from "@opentui/solid";
import { effect as _$effect } from "@opentui/solid";
import { insert as _$insert } from "@opentui/solid";
import { memo as _$memo } from "@opentui/solid";
import { setProp as _$setProp } from "@opentui/solid";
import { createElement as _$createElement } from "@opentui/solid";
import { createMemo, For, Show, createSignal } from "solid-js";
import { TodoItem } from "../../component/todo-item.js";
const id = "internal:sidebar-todo";
function View(props) {
  const [open, setOpen] = createSignal(true);
  const theme = () => props.api.theme.current;
  const list = createMemo(() => props.api.state.session.todo(props.session_id));
  const show = createMemo(() => list().length > 0 && list().some(item => item.status !== "completed"));
  return _$createComponent(Show, {
    get when() {
      return show();
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
      _$insertNode(_el$5, _$createTextNode(`Todo`));
      _$insert(_el$, _$createComponent(Show, {
        get when() {
          return list().length <= 2 || open();
        },
        get children() {
          return _$createComponent(For, {
            get each() {
              return list();
            },
            children: item => _$createComponent(TodoItem, {
              get status() {
                return item.status;
              },
              get content() {
                return item.content;
              }
            })
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
    order: 400,
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