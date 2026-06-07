import { template as _$template } from "solid-js/web";
import { spread as _$spread } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
import { memo as _$memo } from "solid-js/web";
import { mergeProps as _$mergeProps } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<button>`);
import { Show, splitProps } from "solid-js";
import { Icon } from "@/bs/icon.js";
const VARIANT_CLASS = {
  primary: "btn-primary",
  secondary: "btn-outline-secondary",
  ghost: "btn-link",
  critical: "btn-danger"
};
const SIZE_CLASS = {
  small: "btn-sm",
  large: "btn-lg"
};
export function Button(props) {
  const [split, rest] = splitProps(props, ["variant", "size", "icon", "class", "classList", "children"]);
  const variantClass = () => VARIANT_CLASS[split.variant] || VARIANT_CLASS.secondary;
  const sizeClass = () => SIZE_CLASS[split.size] || "";
  return (() => {
    var _el$ = _tmpl$();
    _$spread(_el$, _$mergeProps({
      type: "button",
      "data-component": "button",
      get ["data-size"]() {
        return split.size || "normal";
      },
      get ["data-variant"]() {
        return split.variant || "secondary";
      },
      get ["data-icon"]() {
        return split.icon;
      },
      get classList() {
        return {
          ...split.classList,
          btn: true,
          [variantClass()]: true,
          [sizeClass()]: !!sizeClass(),
          "d-inline-flex align-items-center gap-1": true,
          [split.class ?? ""]: !!split.class
        };
      }
    }, rest), false, true);
    _$insert(_el$, _$createComponent(Show, {
      get when() {
        return split.icon;
      },
      get children() {
        return _$createComponent(Icon, {
          get name() {
            return split.icon;
          },
          size: "small"
        });
      }
    }), null);
    _$insert(_el$, _$memo(() => split.children), null);
    return _el$;
  })();
}
