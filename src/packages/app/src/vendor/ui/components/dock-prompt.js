import { template as _$template } from "solid-js/web";
import { delegateEvents as _$delegateEvents } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
import { setAttribute as _$setAttribute } from "solid-js/web";
import { effect as _$effect } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { addEventListener as _$addEventListener } from "solid-js/web";
import { use as _$use } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<div>`),
  _tmpl$2 = /*#__PURE__*/_$template(`<div data-component=dock-prompt>`);
import { DockShell, DockTray } from "./dock-surface.js";
export function DockPrompt(props) {
  const slot = name => `${props.kind}-${name}`;
  return (() => {
    var _el$ = _tmpl$2();
    _$addEventListener(_el$, "keydown", props.onKeyDown, true);
    var _ref$ = props.ref;
    typeof _ref$ === "function" ? _$use(_ref$, _el$) : props.ref = _el$;
    _$insert(_el$, _$createComponent(DockShell, {
      get ["data-slot"]() {
        return slot("body");
      },
      get children() {
        return [(() => {
          var _el$2 = _tmpl$();
          _$insert(_el$2, () => props.header);
          _$effect(() => _$setAttribute(_el$2, "data-slot", slot("header")));
          return _el$2;
        })(), (() => {
          var _el$3 = _tmpl$();
          _$insert(_el$3, () => props.children);
          _$effect(() => _$setAttribute(_el$3, "data-slot", slot("content")));
          return _el$3;
        })()];
      }
    }), null);
    _$insert(_el$, _$createComponent(DockTray, {
      get ["data-slot"]() {
        return slot("footer");
      },
      get children() {
        return props.footer;
      }
    }), null);
    _$effect(() => _$setAttribute(_el$, "data-kind", props.kind));
    return _el$;
  })();
}
_$delegateEvents(["keydown"]);