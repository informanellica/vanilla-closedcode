import { mergeProps as _$mergeProps } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
import { memo as _$memo } from "solid-js/web";
import { Button as Kobalte } from "@kobalte/core/button";
import { Show, splitProps } from "solid-js";
import { Icon } from "./icon.js";
export function Button(props) {
  const [split, rest] = splitProps(props, ["variant", "size", "icon", "class", "classList"]);
  return _$createComponent(Kobalte, _$mergeProps(rest, {
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
        [split.class ?? ""]: !!split.class
      };
    },
    get children() {
      return [_$createComponent(Show, {
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
      }), _$memo(() => props.children)];
    }
  }));
}