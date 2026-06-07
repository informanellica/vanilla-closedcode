import { template as _$template } from "solid-js/web";
import { classList as _$classList } from "solid-js/web";
import { effect as _$effect } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<span data-component=keybind>`);
export function Keybind(props) {
  return (() => {
    var _el$ = _tmpl$();
    _$insert(_el$, () => props.children);
    _$effect(_$p => _$classList(_el$, {
      ...props.classList,
      [props.class ?? ""]: !!props.class
    }, _$p));
    return _el$;
  })();
}