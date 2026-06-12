import { insert as _solidInsert } from "solid-js/web";
import { TextField as Kobalte } from "@kobalte/core/text-field";
import { createComponent, createSignal, mergeProps, Show, splitProps } from "solid-js";
import { useI18n } from "../context/i18n.js";
import { IconButton } from "./icon-button.js";
import { Tooltip } from "./tooltip.js";

export function TextField(props) {
  const i18n = useI18n();
  const [local, others] = splitProps(props, ["name", "defaultValue", "value", "onChange", "onKeyDown", "validationState", "required", "disabled", "readOnly", "class", "label", "hideLabel", "description", "error", "variant", "copyable", "copyKind", "multiline"]);
  const [copied, setCopied] = createSignal(false);
  const label = () => {
    if (copied()) return i18n.t("ui.textField.copied");
    if (local.copyKind === "link") return i18n.t("ui.textField.copyLink");
    return i18n.t("ui.textField.copyToClipboard");
  };
  const icon = () => {
    if (copied()) return "check";
    if (local.copyKind === "link") return "link";
    return "copy";
  };
  async function handleCopy() {
    // Controlled value wins over defaultValue; read props live at click time.
    const value = local.value ?? local.defaultValue ?? "";
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  function handleClick() {
    if (local.copyable) void handleCopy();
  }

  // Wrapper holding the input/textarea plus the optional copy affordance.
  // Replaces the compiled _tmpl$ (`<div data-slot=input-wrapper>`). The two
  // Show regions resolve to reactive accessors, so they go through solid's
  // insert() to stay live; a one-shot appendChild would freeze them.
  function buildWrapper() {
    const wrapper = document.createElement("div");
    wrapper.setAttribute("data-slot", "input-wrapper");
    // Show(multiline), non-keyed: swaps textarea/input only when truthiness
    // flips. Both forward the `others` rest-props proxy through mergeProps so
    // arbitrary attributes (type, placeholder, autocomplete, ...) stay
    // reactive on the rendered element.
    _solidInsert(wrapper, createComponent(Show, {
      get when() {
        return local.multiline;
      },
      get fallback() {
        return createComponent(Kobalte.Input, mergeProps(others, {
          "data-slot": "input-input",
          get ["class"]() {
            return local.class;
          }
        }));
      },
      get children() {
        return createComponent(Kobalte.TextArea, mergeProps(others, {
          autoResize: true,
          "data-slot": "input-input",
          get ["class"]() {
            return local.class;
          }
        }));
      }
    }), null);
    // Show(copyable): tooltip-wrapped copy button rendered after the input.
    _solidInsert(wrapper, createComponent(Show, {
      get when() {
        return local.copyable;
      },
      get children() {
        return createComponent(Tooltip, {
          get value() {
            return label();
          },
          placement: "top",
          gutter: 4,
          get forceOpen() {
            return copied();
          },
          skipDelayDuration: 0,
          get children() {
            // The vanilla IconButton reads its props once at creation
            // (createComponent untracks the component body), so getter props
            // would freeze on the first value. Read the signals here, inside
            // the tooltip trigger's tracked children scope, so a copied() /
            // copyKind flip rebuilds the button with fresh icon + aria-label.
            const currentIcon = icon();
            const currentLabel = label();
            return createComponent(IconButton, {
              type: "button",
              icon: currentIcon,
              variant: "ghost",
              onClick: handleCopy,
              tabIndex: -1,
              "data-slot": "input-copy-button",
              "aria-label": currentLabel
            });
          }
        });
      }
    }), null);
    return wrapper;
  }

  // Kobalte owns the field behavior (controlled/uncontrolled value, aria
  // wiring, validation data attributes the CSS keys off). Every controlled
  // prop is forwarded through a getter so external state stays live.
  return createComponent(Kobalte, {
    "data-component": "input",
    get ["data-variant"]() {
      return local.variant || "normal";
    },
    get name() {
      return local.name;
    },
    get defaultValue() {
      return local.defaultValue;
    },
    get value() {
      return local.value;
    },
    get onChange() {
      return local.onChange;
    },
    get onKeyDown() {
      return local.onKeyDown;
    },
    onClick: handleClick,
    get required() {
      return local.required;
    },
    get disabled() {
      return local.disabled;
    },
    get readOnly() {
      return local.readOnly;
    },
    get validationState() {
      return local.validationState;
    },
    get children() {
      // Show keeps the label/description mount state independent of the
      // sibling nodes; the wrapper is rebuilt on each children evaluation,
      // matching the compiled IIFE.
      return [createComponent(Show, {
        get when() {
          return local.label;
        },
        get children() {
          return createComponent(Kobalte.Label, {
            "data-slot": "input-label",
            get classList() {
              return {
                "sr-only": local.hideLabel
              };
            },
            get children() {
              return local.label;
            }
          });
        }
      }), buildWrapper(), createComponent(Show, {
        get when() {
          return local.description;
        },
        get children() {
          return createComponent(Kobalte.Description, {
            "data-slot": "input-description",
            get children() {
              return local.description;
            }
          });
        }
      }), createComponent(Kobalte.ErrorMessage, {
        "data-slot": "input-error",
        get children() {
          return local.error;
        }
      })];
    }
  });
}
