import { template as _$template } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { mergeProps as _$mergeProps } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
import { memo as _$memo } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<div data-slot=input-wrapper>`);
import { TextField as Kobalte } from "@kobalte/core/text-field";
import { createSignal, Show, splitProps } from "solid-js";
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
    const value = local.value ?? local.defaultValue ?? "";
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  function handleClick() {
    if (local.copyable) void handleCopy();
  }
  return _$createComponent(Kobalte, {
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
      return [_$createComponent(Show, {
        get when() {
          return local.label;
        },
        get children() {
          return _$createComponent(Kobalte.Label, {
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
      }), (() => {
        var _el$ = _tmpl$();
        _$insert(_el$, _$createComponent(Show, {
          get when() {
            return local.multiline;
          },
          get fallback() {
            return _$createComponent(Kobalte.Input, _$mergeProps(others, {
              "data-slot": "input-input",
              get ["class"]() {
                return local.class;
              }
            }));
          },
          get children() {
            return _$createComponent(Kobalte.TextArea, _$mergeProps(others, {
              autoResize: true,
              "data-slot": "input-input",
              get ["class"]() {
                return local.class;
              }
            }));
          }
        }), null);
        _$insert(_el$, _$createComponent(Show, {
          get when() {
            return local.copyable;
          },
          get children() {
            return _$createComponent(Tooltip, {
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
                return _$createComponent(IconButton, {
                  type: "button",
                  get icon() {
                    return icon();
                  },
                  variant: "ghost",
                  onClick: handleCopy,
                  tabIndex: -1,
                  "data-slot": "input-copy-button",
                  get ["aria-label"]() {
                    return label();
                  }
                });
              }
            });
          }
        }), null);
        return _el$;
      })(), _$createComponent(Show, {
        get when() {
          return local.description;
        },
        get children() {
          return _$createComponent(Kobalte.Description, {
            "data-slot": "input-description",
            get children() {
              return local.description;
            }
          });
        }
      }), _$createComponent(Kobalte.ErrorMessage, {
        "data-slot": "input-error",
        get children() {
          return local.error;
        }
      })];
    }
  });
}