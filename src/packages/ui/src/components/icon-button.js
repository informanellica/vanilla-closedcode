import { mergeProps as _$mergeProps } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
import { memo as _$memo } from "solid-js/web";
import { Button as Kobalte } from "@kobalte/core/button";
import { splitProps } from "solid-js";
import { Icon } from "./icon.js";
export function IconButton(props) {
  const [split, rest] = splitProps(props, ["variant", "size", "iconSize", "class", "classList"]);
  return _$createComponent(Kobalte, _$mergeProps(rest, {
    "data-component": "icon-button",
    get ["data-icon"]() {
      return props.icon;
    },
    get ["data-size"]() {
      return split.size || "normal";
    },
    get ["data-variant"]() {
      return split.variant || "secondary";
    },
    get classList() {
      return {
        ...split.classList,
        [split.class ?? ""]: !!split.class
      };
    },
    get children() {
      return _$createComponent(Icon, {
        get name() {
          return props.icon;
        },
        get size() {
          return split.iconSize ?? (split.size === "large" ? "normal" : "small");
        }
      });
    }
  }));
}