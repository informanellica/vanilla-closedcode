import { template as _$template } from "solid-js/web";
import { mergeProps as _$mergeProps } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
import { memo as _$memo } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<div data-slot=progress-header>`);
import { Progress as Kobalte } from "@kobalte/core/progress";
import { Show, splitProps } from "solid-js";
export function Progress(props) {
  const [local, others] = splitProps(props, ["children", "class", "classList", "hideLabel", "showValueLabel"]);
  return _$createComponent(Kobalte, _$mergeProps(others, {
    "data-component": "progress",
    get classList() {
      return {
        ...local.classList,
        [local.class ?? ""]: !!local.class
      };
    },
    get children() {
      return [_$createComponent(Show, {
        get when() {
          return local.children || local.showValueLabel;
        },
        get children() {
          var _el$ = _tmpl$();
          _$insert(_el$, _$createComponent(Show, {
            get when() {
              return local.children;
            },
            get children() {
              return _$createComponent(Kobalte.Label, {
                "data-slot": "progress-label",
                get classList() {
                  return {
                    "sr-only": local.hideLabel
                  };
                },
                get children() {
                  return local.children;
                }
              });
            }
          }), null);
          _$insert(_el$, _$createComponent(Show, {
            get when() {
              return local.showValueLabel;
            },
            get children() {
              return _$createComponent(Kobalte.ValueLabel, {
                "data-slot": "progress-value-label"
              });
            }
          }), null);
          return _el$;
        }
      }), _$createComponent(Kobalte.Track, {
        "data-slot": "progress-track",
        get children() {
          return _$createComponent(Kobalte.Fill, {
            "data-slot": "progress-fill"
          });
        }
      })];
    }
  }));
}