import { createComponent as _$createComponent } from "@opentui/solid";
import { setProp as _$setProp } from "@opentui/solid";
import { effect as _$effect } from "@opentui/solid";
import { memo as _$memo } from "@opentui/solid";
import { insert as _$insert } from "@opentui/solid";
import { createTextNode as _$createTextNode } from "@opentui/solid";
import { insertNode as _$insertNode } from "@opentui/solid";
import { createElement as _$createElement } from "@opentui/solid";
import { createMemo } from "solid-js";
const id = "internal:sidebar-context";
const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD"
});
function View(props) {
  const theme = () => props.api.theme.current;
  const msg = createMemo(() => props.api.state.session.messages(props.session_id));
  const cost = createMemo(() => msg().reduce((sum, item) => sum + (item.role === "assistant" ? item.cost : 0), 0));
  const state = createMemo(() => {
    const last = msg().findLast(item => item.role === "assistant" && item.tokens.output > 0);
    if (!last) {
      return {
        tokens: 0,
        percent: null
      };
    }
    const tokens = last.tokens.input + last.tokens.output + last.tokens.reasoning + last.tokens.cache.read + last.tokens.cache.write;
    const model = props.api.state.provider.find(item => item.id === last.providerID)?.models[last.modelID];
    return {
      tokens,
      percent: model?.limit.context ? Math.round(tokens / model.limit.context * 100) : null
    };
  });
  return (() => {
    var _el$ = _$createElement("box"),
      _el$2 = _$createElement("text"),
      _el$3 = _$createElement("b"),
      _el$5 = _$createElement("text"),
      _el$6 = _$createTextNode(` tokens`),
      _el$7 = _$createElement("text"),
      _el$8 = _$createTextNode(`% used`),
      _el$9 = _$createElement("text"),
      _el$0 = _$createTextNode(` spent`);
    _$insertNode(_el$, _el$2);
    _$insertNode(_el$, _el$5);
    _$insertNode(_el$, _el$7);
    _$insertNode(_el$, _el$9);
    _$insertNode(_el$2, _el$3);
    _$insertNode(_el$3, _$createTextNode(`Context`));
    _$insertNode(_el$5, _el$6);
    _$insert(_el$5, () => state().tokens.toLocaleString(), _el$6);
    _$insertNode(_el$7, _el$8);
    _$insert(_el$7, () => state().percent ?? 0, _el$8);
    _$insertNode(_el$9, _el$0);
    _$insert(_el$9, () => money.format(cost()), _el$0);
    _$effect(_p$ => {
      var _v$ = theme().text,
        _v$2 = theme().textMuted,
        _v$3 = theme().textMuted,
        _v$4 = theme().textMuted;
      _v$ !== _p$.e && (_p$.e = _$setProp(_el$2, "fg", _v$, _p$.e));
      _v$2 !== _p$.t && (_p$.t = _$setProp(_el$5, "fg", _v$2, _p$.t));
      _v$3 !== _p$.a && (_p$.a = _$setProp(_el$7, "fg", _v$3, _p$.a));
      _v$4 !== _p$.o && (_p$.o = _$setProp(_el$9, "fg", _v$4, _p$.o));
      return _p$;
    }, {
      e: undefined,
      t: undefined,
      a: undefined,
      o: undefined
    });
    return _el$;
  })();
}
const tui = async api => {
  api.slots.register({
    order: 100,
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