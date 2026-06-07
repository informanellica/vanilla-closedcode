import { template as _$template } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<div class="d-flex flex-column gap-3">`);
export const SettingsList = props => {
  return (() => {
    var _el$ = _tmpl$();
    _$insert(_el$, () => props.children);
    return _el$;
  })();
};