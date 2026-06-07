import { template as _$template } from "solid-js/web";
import { spread as _$spread } from "solid-js/web";
import { mergeProps as _$mergeProps } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<input data-component=inline-input>`);
import { splitProps } from "solid-js";
export function InlineInput(props) {
  const [local, others] = splitProps(props, ["class", "width", "style"]);
  const style = () => {
    if (!local.style) return {
      width: local.width
    };
    if (typeof local.style === "string") {
      if (!local.width) return local.style;
      return `${local.style};width:${local.width}`;
    }
    if (!local.width) return local.style;
    return {
      ...local.style,
      width: local.width
    };
  };
  return (() => {
    var _el$ = _tmpl$();
    _$spread(_el$, _$mergeProps({
      get ["class"]() {
        return local.class;
      },
      get style() {
        return style();
      }
    }, others), false, false);
    return _el$;
  })();
}