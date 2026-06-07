import { template as _$template } from "solid-js/web";
import { setAttribute as _$setAttribute } from "solid-js/web";
import { effect as _$effect } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
import { memo as _$memo } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<div data-slot=dialog-header>`),
  _tmpl$2 = /*#__PURE__*/_$template(`<div data-slot=dialog-body>`),
  _tmpl$3 = /*#__PURE__*/_$template(`<div data-component=dialog><div data-slot=dialog-container>`);
import { Dialog as Kobalte } from "@kobalte/core/dialog";
import { Match, Show, Switch } from "solid-js";
import { useI18n } from "../context/i18n.js";
import { IconButton } from "./icon-button.js";
export function Dialog(props) {
  const i18n = useI18n();
  return (() => {
    var _el$ = _tmpl$3(),
      _el$2 = _el$.firstChild;
    _$insert(_el$2, _$createComponent(Kobalte.Content, {
      "data-slot": "dialog-content",
      get ["data-no-header"]() {
        return !props.title && !props.action ? "" : undefined;
      },
      get classList() {
        return {
          ...props.classList,
          [props.class ?? ""]: !!props.class
        };
      },
      onOpenAutoFocus: e => {
        const target = e.currentTarget;
        const autofocusEl = target?.querySelector("[autofocus]");
        if (autofocusEl) {
          e.preventDefault();
          autofocusEl.focus();
        }
      },
      get children() {
        return [_$createComponent(Show, {
          get when() {
            return props.title || props.action;
          },
          get children() {
            var _el$3 = _tmpl$();
            _$insert(_el$3, _$createComponent(Show, {
              get when() {
                return props.title;
              },
              get children() {
                return _$createComponent(Kobalte.Title, {
                  "data-slot": "dialog-title",
                  get children() {
                    return props.title;
                  }
                });
              }
            }), null);
            _$insert(_el$3, _$createComponent(Switch, {
              get children() {
                return [_$createComponent(Match, {
                  get when() {
                    return props.action;
                  },
                  get children() {
                    return props.action;
                  }
                }), _$createComponent(Match, {
                  when: true,
                  get children() {
                    return _$createComponent(Kobalte.CloseButton, {
                      "data-slot": "dialog-close-button",
                      as: IconButton,
                      icon: "close",
                      variant: "ghost",
                      get ["aria-label"]() {
                        return i18n.t("ui.common.close");
                      }
                    });
                  }
                })];
              }
            }), null);
            return _el$3;
          }
        }), _$createComponent(Show, {
          get when() {
            return props.description;
          },
          get children() {
            return _$createComponent(Kobalte.Description, {
              "data-slot": "dialog-description",
              style: {
                "margin-left": "-4px"
              },
              get children() {
                return props.description;
              }
            });
          }
        }), (() => {
          var _el$4 = _tmpl$2();
          _$insert(_el$4, () => props.children);
          return _el$4;
        })()];
      }
    }));
    _$effect(_p$ => {
      var _v$ = props.fit ? true : undefined,
        _v$2 = props.size || "normal",
        _v$3 = props.transition ? true : undefined;
      _v$ !== _p$.e && _$setAttribute(_el$, "data-fit", _p$.e = _v$);
      _v$2 !== _p$.t && _$setAttribute(_el$, "data-size", _p$.t = _v$2);
      _v$3 !== _p$.a && _$setAttribute(_el$, "data-transition", _p$.a = _v$3);
      return _p$;
    }, {
      e: undefined,
      t: undefined,
      a: undefined
    });
    return _el$;
  })();
}