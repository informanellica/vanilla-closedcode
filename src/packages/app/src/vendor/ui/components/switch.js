import { createComponent, mergeProps, Show, splitProps } from "solid-js";
import { Switch as Kobalte } from "@kobalte/core/switch";

export function Switch(props) {
  const [local, others] = splitProps(props, ["children", "class", "hideLabel", "description"]);
  // Kobalte owns the switch behavior (controlled/uncontrolled state, aria
  // wiring, data-checked/data-disabled attributes the CSS keys off). Only the
  // compiled solid-js/web helpers were replaced with their public solid-js
  // equivalents; mergeProps keeps the `others` rest-props proxy reactive.
  return createComponent(Kobalte, mergeProps(others, {
    get ["class"]() {
      return local.class;
    },
    "data-component": "switch",
    get children() {
      return [
        createComponent(Kobalte.Input, {
          "data-slot": "switch-input"
        }),
        // Show keeps the label/description swaps independent of the sibling
        // nodes: reading local.children/local.description here directly would
        // rebuild (remount) the whole children array on every change.
        createComponent(Show, {
          get when() {
            return local.children;
          },
          get children() {
            return createComponent(Kobalte.Label, {
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
        }),
        createComponent(Show, {
          get when() {
            return local.description;
          },
          get children() {
            return createComponent(Kobalte.Description, {
              "data-slot": "switch-description",
              get children() {
                return local.description;
              }
            });
          }
        }),
        createComponent(Kobalte.ErrorMessage, {
          "data-slot": "switch-error"
        }),
        createComponent(Kobalte.Control, {
          "data-slot": "switch-control",
          get children() {
            return createComponent(Kobalte.Thumb, {
              "data-slot": "switch-thumb"
            });
          }
        })
      ];
    }
  }));
}
