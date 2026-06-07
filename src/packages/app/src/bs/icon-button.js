import { createComponent as _$createComponent } from "solid-js/web";
import { Dynamic as _$Dynamic } from "solid-js/web";
import { mergeProps as _$mergeProps } from "solid-js/web";
import { splitProps } from "solid-js";
import { Icon } from "@/bs/icon.js";
export function IconButton(props) {
  const [split, rest] = splitProps(props, ["icon", "variant", "size", "iconSize", "as", "class", "classList"]);
  const variantClass = () => {
    const v = split.variant || "secondary";
    return v === "ghost" ? "btn-link" : `btn-outline-${v}`;
  };
  const sizeClass = () => (split.size === "large" ? "btn-lg" : "btn-sm");
  return _$createComponent(_$Dynamic, _$mergeProps({
    get component() {
      return split.as || "button";
    }
  }, rest, {
    "data-component": "icon-button",
    get ["data-icon"]() {
      return split.icon;
    },
    get ["data-size"]() {
      return split.size || "normal";
    },
    get ["data-variant"]() {
      return split.variant || "secondary";
    },
    get classList() {
      return {
        btn: true,
        "d-inline-flex": true,
        "align-items-center": true,
        "justify-content-center": true,
        [variantClass()]: true,
        [sizeClass()]: true,
        ...split.classList,
        [split.class ?? ""]: !!split.class
      };
    },
    get children() {
      return _$createComponent(Icon, {
        get name() {
          return split.icon;
        },
        get size() {
          return split.iconSize ?? (split.size === "large" ? "normal" : "small");
        }
      });
    }
  }));
}
