import { template as _$template } from "solid-js/web";
import { mergeProps as _$mergeProps } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { memo as _$memo } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<div data-slot=checkbox-checkbox-content>`),
  _tmpl$2 = /*#__PURE__*/_$template(`<svg viewBox="0 0 12 12"fill=none width=10 height=10 xmlns=http://www.w3.org/2000/svg><path d="M3 7.17905L5.02703 8.85135L9 3.5"stroke=currentColor stroke-width=1.5 stroke-linecap=square>`);
import { Checkbox as Kobalte } from "@kobalte/core/checkbox";
import { Show, splitProps } from "solid-js";
export function Checkbox(props) {
  const [local, others] = splitProps(props, ["children", "class", "label", "hideLabel", "description", "icon"]);
  return _$createComponent(Kobalte, _$mergeProps(others, {
    "data-component": "checkbox",
    get children() {
      return [_$createComponent(Kobalte.Input, {
        "data-slot": "checkbox-checkbox-input"
      }), _$createComponent(Kobalte.Control, {
        "data-slot": "checkbox-checkbox-control",
        get children() {
          return _$createComponent(Kobalte.Indicator, {
            "data-slot": "checkbox-checkbox-indicator",
            get children() {
              return local.icon || _tmpl$2();
            }
          });
        }
      }), (() => {
        var _el$ = _tmpl$();
        _$insert(_el$, _$createComponent(Show, {
          get when() {
            return props.children;
          },
          get children() {
            return _$createComponent(Kobalte.Label, {
              "data-slot": "checkbox-checkbox-label",
              get classList() {
                return {
                  "sr-only": local.hideLabel
                };
              },
              get children() {
                return props.children;
              }
            });
          }
        }), null);
        _$insert(_el$, _$createComponent(Show, {
          get when() {
            return local.description;
          },
          get children() {
            return _$createComponent(Kobalte.Description, {
              "data-slot": "checkbox-checkbox-description",
              get children() {
                return local.description;
              }
            });
          }
        }), null);
        _$insert(_el$, _$createComponent(Kobalte.ErrorMessage, {
          "data-slot": "checkbox-checkbox-error"
        }), null);
        return _el$;
      })()];
    }
  }));
}