import { template as _$template } from "solid-js/web";
import { delegateEvents as _$delegateEvents } from "solid-js/web";
import { memo as _$memo } from "solid-js/web";
import { spread as _$spread } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { mergeProps as _$mergeProps } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<div data-slot=toast-icon>`),
  _tmpl$2 = /*#__PURE__*/_$template(`<div data-slot=toast-content>`),
  _tmpl$3 = /*#__PURE__*/_$template(`<div data-slot=toast-actions>`),
  _tmpl$4 = /*#__PURE__*/_$template(`<button data-slot=toast-action>`);
import { Toast as Kobalte, toaster } from "@kobalte/core/toast";
import { Show } from "solid-js";
import { Portal } from "solid-js/web";
import { useI18n } from "../context/i18n.js";
import { Icon } from "./icon.js";
import { IconButton } from "./icon-button.js";
function ToastRegion(props) {
  return _$createComponent(Portal, {
    get children() {
      return _$createComponent(Kobalte.Region, _$mergeProps({
        "data-component": "toast-region"
      }, props, {
        get children() {
          return _$createComponent(Kobalte.List, {
            "data-slot": "toast-list"
          });
        }
      }));
    }
  });
}
function ToastRoot(props) {
  return _$createComponent(Kobalte, _$mergeProps({
    "data-component": "toast",
    get classList() {
      return {
        ...props.classList,
        [props.class ?? ""]: !!props.class
      };
    }
  }, props));
}
function ToastIcon(props) {
  return (() => {
    var _el$ = _tmpl$();
    _$insert(_el$, _$createComponent(Icon, {
      get name() {
        return props.name;
      }
    }));
    return _el$;
  })();
}
function ToastContent(props) {
  return (() => {
    var _el$2 = _tmpl$2();
    _$spread(_el$2, props, false, false);
    return _el$2;
  })();
}
function ToastTitle(props) {
  return _$createComponent(Kobalte.Title, _$mergeProps({
    "data-slot": "toast-title"
  }, props));
}
function ToastDescription(props) {
  return _$createComponent(Kobalte.Description, _$mergeProps({
    "data-slot": "toast-description"
  }, props));
}
function ToastActions(props) {
  return (() => {
    var _el$3 = _tmpl$3();
    _$spread(_el$3, props, false, false);
    return _el$3;
  })();
}
function ToastCloseButton(props) {
  const i18n = useI18n();
  return _$createComponent(Kobalte.CloseButton, _$mergeProps({
    "data-slot": "toast-close-button",
    as: IconButton,
    icon: "close",
    variant: "ghost",
    get ["aria-label"]() {
      return i18n.t("ui.common.dismiss");
    }
  }, props));
}
function ToastProgressTrack(props) {
  return _$createComponent(Kobalte.ProgressTrack, _$mergeProps({
    "data-slot": "toast-progress-track"
  }, props));
}
function ToastProgressFill(props) {
  return _$createComponent(Kobalte.ProgressFill, _$mergeProps({
    "data-slot": "toast-progress-fill"
  }, props));
}
export const Toast = Object.assign(ToastRoot, {
  Region: ToastRegion,
  Icon: ToastIcon,
  Content: ToastContent,
  Title: ToastTitle,
  Description: ToastDescription,
  Actions: ToastActions,
  CloseButton: ToastCloseButton,
  ProgressTrack: ToastProgressTrack,
  ProgressFill: ToastProgressFill
});
export { toaster };
export function showToast(options) {
  const opts = typeof options === "string" ? {
    description: options
  } : options;
  return toaster.show(props => _$createComponent(Toast, {
    get toastId() {
      return props.toastId;
    },
    get duration() {
      return opts.duration;
    },
    get persistent() {
      return opts.persistent;
    },
    get ["data-variant"]() {
      return opts.variant ?? "default";
    },
    get children() {
      return [_$createComponent(Show, {
        get when() {
          return opts.icon;
        },
        get children() {
          return _$createComponent(Toast.Icon, {
            get name() {
              return opts.icon;
            }
          });
        }
      }), _$createComponent(Toast.Content, {
        get children() {
          return [_$createComponent(Show, {
            get when() {
              return opts.title;
            },
            get children() {
              return _$createComponent(Toast.Title, {
                get children() {
                  return opts.title;
                }
              });
            }
          }), _$createComponent(Show, {
            get when() {
              return opts.description;
            },
            get children() {
              return _$createComponent(Toast.Description, {
                get children() {
                  return opts.description;
                }
              });
            }
          }), _$createComponent(Show, {
            get when() {
              return opts.actions?.length;
            },
            get children() {
              return _$createComponent(Toast.Actions, {
                get children() {
                  return opts.actions.map(action => (() => {
                    var _el$4 = _tmpl$4();
                    _el$4.$$click = () => {
                      if (typeof action.onClick === "function") {
                        action.onClick();
                      }
                      toaster.dismiss(props.toastId);
                    };
                    _$insert(_el$4, () => action.label);
                    return _el$4;
                  })());
                }
              });
            }
          })];
        }
      }), _$createComponent(Toast.CloseButton, {})];
    }
  }));
}
export function showPromiseToast(promise, options) {
  return toaster.promise(promise, props => _$createComponent(Toast, {
    get toastId() {
      return props.toastId;
    },
    get ["data-variant"]() {
      return _$memo(() => props.state === "pending")() ? "loading" : props.state === "fulfilled" ? "success" : "error";
    },
    get children() {
      return [_$createComponent(Toast.Content, {
        get children() {
          return _$createComponent(Toast.Description, {
            get children() {
              return [_$memo(() => _$memo(() => props.state === "pending")() && options.loading), _$memo(() => _$memo(() => props.state === "fulfilled")() && options.success?.(props.data)), _$memo(() => _$memo(() => props.state === "rejected")() && options.error?.(props.error))];
            }
          });
        }
      }), _$createComponent(Toast.CloseButton, {})];
    }
  }));
}
_$delegateEvents(["click"]);