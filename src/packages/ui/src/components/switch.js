import { mergeProps as _$mergeProps } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
import { Switch as Kobalte } from "@kobalte/core/switch";
import { Show, splitProps } from "solid-js";
export function Switch(props) {
  const [local, others] = splitProps(props, ["children", "class", "hideLabel", "description"]);
  return _$createComponent(Kobalte, _$mergeProps(others, {
    get ["class"]() {
      return local.class;
    },
    "data-component": "switch",
    get children() {
      return [_$createComponent(Kobalte.Input, {
        "data-slot": "switch-input"
      }), _$createComponent(Show, {
        get when() {
          return local.children;
        },
        get children() {
          return _$createComponent(Kobalte.Label, {
            "data-slot": "switch-label",
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
      }), _$createComponent(Show, {
        get when() {
          return local.description;
        },
        get children() {
          return _$createComponent(Kobalte.Description, {
            "data-slot": "switch-description",
            get children() {
              return local.description;
            }
          });
        }
      }), _$createComponent(Kobalte.ErrorMessage, {
        "data-slot": "switch-error"
      }), _$createComponent(Kobalte.Control, {
        "data-slot": "switch-control",
        get children() {
          return _$createComponent(Kobalte.Thumb, {
            "data-slot": "switch-thumb"
          });
        }
      })];
    }
  }));
}