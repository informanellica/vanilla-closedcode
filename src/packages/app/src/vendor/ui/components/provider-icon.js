import { template as _$template } from "solid-js/web";
import { setAttribute as _$setAttribute } from "solid-js/web";
import { effect as _$effect } from "solid-js/web";
import { spread as _$spread } from "solid-js/web";
import { mergeProps as _$mergeProps } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<svg data-component=provider-icon><use>`);
import { createMemo, splitProps } from "solid-js";
import sprite from "./provider-icons/sprite.svg";
import { iconNames } from "./provider-icons/types.js";
export const ProviderIcon = props => {
  const [local, rest] = splitProps(props, ["id", "class", "classList"]);
  const resolved = createMemo(() => iconNames.includes(local.id) ? local.id : "synthetic");
  return (() => {
    var _el$ = _tmpl$(),
      _el$2 = _el$.firstChild;
    _$spread(_el$, _$mergeProps(rest, {
      get classList() {
        return {
          ...local.classList,
          [local.class ?? ""]: !!local.class
        };
      }
    }), true, true);
    _$effect(() => _$setAttribute(_el$2, "href", `${sprite}#${resolved()}`));
    return _el$;
  })();
};