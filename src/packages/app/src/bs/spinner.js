import { template as _$template } from "solid-js/web";
import { spread as _$spread } from "solid-js/web";
import { mergeProps as _$mergeProps } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<span role=status>`);
export function Spinner(props) {
  return (() => {
    var _el$ = _tmpl$();
    _$spread(_el$, _$mergeProps(props, {
      "data-component": "spinner",
      get classList() {
        return {
          "spinner-border": true,
          ...props.classList,
          [props.class ?? ""]: !!props.class
        };
      }
    }), false, false);
    return _el$;
  })();
}
