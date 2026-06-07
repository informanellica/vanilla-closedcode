import { template as _$template } from "solid-js/web";
import { delegateEvents as _$delegateEvents } from "solid-js/web";
import { memo as _$memo } from "solid-js/web";
import { setAttribute as _$setAttribute } from "solid-js/web";
import { effect as _$effect } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
import { spread as _$spread } from "solid-js/web";
import { mergeProps as _$mergeProps } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<ul role=list data-component=message-nav>`),
  _tmpl$2 = /*#__PURE__*/_$template(`<div data-slot=message-nav-tick-button role=button tabindex=0><div data-slot=message-nav-tick-line>`),
  _tmpl$3 = /*#__PURE__*/_$template(`<button data-slot=message-nav-message-button><div data-slot=message-nav-title-preview>`),
  _tmpl$4 = /*#__PURE__*/_$template(`<li data-slot=message-nav-item>`),
  _tmpl$5 = /*#__PURE__*/_$template(`<div data-slot=message-nav-tooltip-content>`);
import { For, Match, Show, splitProps, Switch } from "solid-js";
import { DiffChanges } from "./diff-changes.js";
import { Tooltip } from "./tooltip.js";
import { useI18n } from "../context/i18n.js";
export function MessageNav(props) {
  const i18n = useI18n();
  const [local, others] = splitProps(props, ["messages", "current", "size", "onMessageSelect", "getLabel"]);
  const content = () => (() => {
    var _el$ = _tmpl$();
    _$spread(_el$, _$mergeProps({
      get ["data-size"]() {
        return local.size;
      }
    }, others), false, true);
    _$insert(_el$, _$createComponent(For, {
      get each() {
        return local.messages;
      },
      children: message => {
        const handleClick = () => local.onMessageSelect(message);
        const handleKeyPress = event => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          local.onMessageSelect(message);
        };
        return (() => {
          var _el$2 = _tmpl$4();
          _$insert(_el$2, _$createComponent(Switch, {
            get children() {
              return [_$createComponent(Match, {
                get when() {
                  return local.size === "compact";
                },
                get children() {
                  var _el$3 = _tmpl$2();
                  _el$3.$$keydown = handleKeyPress;
                  _el$3.$$click = handleClick;
                  _$effect(() => _$setAttribute(_el$3, "data-active", message.id === local.current?.id || undefined));
                  return _el$3;
                }
              }), _$createComponent(Match, {
                get when() {
                  return local.size === "normal";
                },
                get children() {
                  var _el$4 = _tmpl$3(),
                    _el$5 = _el$4.firstChild;
                  _el$4.$$keydown = handleKeyPress;
                  _el$4.$$click = handleClick;
                  _$insert(_el$4, _$createComponent(DiffChanges, {
                    get changes() {
                      return message.summary?.diffs ?? [];
                    },
                    variant: "bars"
                  }), _el$5);
                  _$insert(_el$5, _$createComponent(Show, {
                    get when() {
                      return local.getLabel?.(message) ?? message.summary?.title;
                    },
                    get fallback() {
                      return i18n.t("ui.messageNav.newMessage");
                    },
                    get children() {
                      return local.getLabel?.(message) ?? message.summary?.title;
                    }
                  }));
                  _$effect(() => _$setAttribute(_el$5, "data-active", message.id === local.current?.id || undefined));
                  return _el$4;
                }
              })];
            }
          }));
          return _el$2;
        })();
      }
    }));
    return _el$;
  })();
  return _$createComponent(Switch, {
    get children() {
      return [_$createComponent(Match, {
        get when() {
          return local.size === "compact";
        },
        get children() {
          return _$createComponent(Tooltip, {
            openDelay: 0,
            placement: "right-start",
            gutter: -40,
            shift: -10,
            overlap: true,
            contentClass: "message-nav-tooltip",
            get value() {
              return (() => {
                var _el$6 = _tmpl$5();
                _$insert(_el$6, _$createComponent(MessageNav, _$mergeProps(props, {
                  size: "normal",
                  "class": ""
                })));
                return _el$6;
              })();
            },
            get children() {
              return content();
            }
          });
        }
      }), _$createComponent(Match, {
        get when() {
          return local.size === "normal";
        },
        get children() {
          return content();
        }
      })];
    }
  });
}
_$delegateEvents(["click", "keydown"]);