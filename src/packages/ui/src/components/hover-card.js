import { template as _$template } from "solid-js/web";
import { mergeProps as _$mergeProps } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<div data-slot=hover-card-body>`);
import { HoverCard as Kobalte } from "@kobalte/core/hover-card";
import { splitProps } from "solid-js";
export function HoverCard(props) {
  const [local, rest] = splitProps(props, ["trigger", "mount", "class", "classList", "children"]);
  return _$createComponent(Kobalte, _$mergeProps({
    gutter: 4
  }, rest, {
    get children() {
      return [_$createComponent(Kobalte.Trigger, {
        as: "div",
        "data-slot": "hover-card-trigger",
        tabIndex: -1,
        get children() {
          return local.trigger;
        }
      }), _$createComponent(Kobalte.Portal, {
        get mount() {
          return local.mount;
        },
        get children() {
          return _$createComponent(Kobalte.Content, {
            "data-component": "hover-card-content",
            get classList() {
              return {
                ...local.classList,
                [local.class ?? ""]: !!local.class
              };
            },
            get children() {
              var _el$ = _tmpl$();
              _$insert(_el$, () => local.children);
              return _el$;
            }
          });
        }
      })];
    }
  }));
}