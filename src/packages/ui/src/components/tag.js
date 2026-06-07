import { template as _$template } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { spread as _$spread } from "solid-js/web";
import { mergeProps as _$mergeProps } from "solid-js/web";
import { memo as _$memo } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<span>`);
import { splitProps } from "solid-js";
export function Tag(props) {
  const [split, rest] = splitProps(props, ["size", "class", "classList", "children"]);
  return (() => {
    var _el$ = _tmpl$();
    _$spread(_el$, _$mergeProps(rest, {
      "data-component": "tag",
      get ["data-size"]() {
        return split.size || "normal";
      },
      get classList() {
        return {
          ...split.classList,
          [split.class ?? ""]: !!split.class
        };
      }
    }), false, true);
    _$insert(_el$, () => split.children);
    return _el$;
  })();
}