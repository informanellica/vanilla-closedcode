import { insert as _$insert } from "@opentui/solid";
import { createComponent as _$createComponent } from "@opentui/solid";
import { setProp as _$setProp } from "@opentui/solid";
import { createElement as _$createElement } from "@opentui/solid";
import { createMemo, Show } from "solid-js";
import { Tips } from "./tips-view.js";
const id = "internal:home-tips";
function View(props) {
  return (() => {
    var _el$ = _$createElement("box");
    _$setProp(_el$, "height", 4);
    _$setProp(_el$, "minHeight", 0);
    _$setProp(_el$, "width", "100%");
    _$setProp(_el$, "maxWidth", 75);
    _$setProp(_el$, "alignItems", "center");
    _$setProp(_el$, "paddingTop", 3);
    _$setProp(_el$, "flexShrink", 1);
    _$insert(_el$, _$createComponent(Show, {
      get when() {
        return props.show;
      },
      get children() {
        return _$createComponent(Tips, {
          get connected() {
            return props.connected;
          }
        });
      }
    }));
    return _el$;
  })();
}
const tui = async api => {
  api.command.register(() => [{
    title: api.kv.get("tips_hidden", false) ? "Show tips" : "Hide tips",
    value: "tips.toggle",
    keybind: "tips_toggle",
    category: "System",
    hidden: api.route.current.name !== "home",
    onSelect() {
      api.kv.set("tips_hidden", !api.kv.get("tips_hidden", false));
      api.ui.dialog.clear();
    }
  }]);
  api.slots.register({
    order: 100,
    slots: {
      home_bottom() {
        const hidden = createMemo(() => api.kv.get("tips_hidden", false));
        const first = createMemo(() => api.state.session.count() === 0);
        const connected = createMemo(() => api.state.provider.some(item => item.id !== "opencode" || Object.values(item.models).some(model => model.cost?.input !== 0)));
        const show = createMemo(() => (!first() || !connected()) && !hidden());
        return _$createComponent(View, {
          get show() {
            return show();
          },
          get connected() {
            return connected();
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