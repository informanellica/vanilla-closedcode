import { template as _$template } from "solid-js/web";
import { delegateEvents as _$delegateEvents } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
import { memo as _$memo } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<span class="min-w-0 flex-1 truncate text-body cursor-default">`),
  _tmpl$2 = /*#__PURE__*/_$template(`<div class="pl-3 pr-2 py-2 d-flex align-items-center gap-2"role=button tabindex=0><span class="shrink-0 text-body-emphasis cursor-default"></span><div class="ml-auto shrink-0">`),
  _tmpl$3 = /*#__PURE__*/_$template(`<div class=h-5 aria-hidden=true>`),
  _tmpl$4 = /*#__PURE__*/_$template(`<div class="px-3 pb-7 d-flex flex-column gap-1.5 max-h-42 overflow-y-auto no-scrollbar">`),
  _tmpl$5 = /*#__PURE__*/_$template(`<div class="d-flex align-items-center gap-2 min-w-0 py-1"><span class="min-w-0 flex-1 truncate fw-normal text-body-emphasis">`);
import { For, Show, createEffect, createMemo } from "solid-js";
import { createStore } from "solid-js/store";
import { Button } from "@/bs/button.js";
import { DockTray } from "@/vendor/ui/components/dock-surface.js";
import { IconButton } from "@/bs/icon-button.js";
import { useLanguage } from "@/context/language.js";
export function SessionRevertDock(props) {
  const language = useLanguage();
  const [store, setStore] = createStore({
    collapsed: true
  });
  createEffect(() => {
    props.items.length;
    props.items[0]?.id;
    setStore("collapsed", true);
  });
  const toggle = () => setStore("collapsed", value => !value);
  const total = createMemo(() => props.items.length);
  const label = createMemo(() => language.t(total() === 1 ? "session.revertDock.summary.one" : "session.revertDock.summary.other", {
    count: total()
  }));
  const preview = createMemo(() => props.items[0]?.text ?? "");
  return _$createComponent(DockTray, {
    "data-component": "session-revert-dock",
    get children() {
      return [(() => {
        var _el$ = _tmpl$2(),
          _el$2 = _el$.firstChild,
          _el$4 = _el$2.nextSibling;
        _el$.$$keydown = event => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          toggle();
        };
        _el$.$$click = toggle;
        _$insert(_el$2, label);
        _$insert(_el$, _$createComponent(Show, {
          get when() {
            return _$memo(() => !!store.collapsed)() && preview();
          },
          get children() {
            var _el$3 = _tmpl$();
            _$insert(_el$3, preview);
            return _el$3;
          }
        }), _el$4);
        _$insert(_el$4, _$createComponent(IconButton, {
          get ["data-collapsed"]() {
            return store.collapsed ? "true" : "false";
          },
          icon: "chevron-down",
          size: "normal",
          variant: "ghost",
          get style() {
            return {
              transform: `rotate(${store.collapsed ? 180 : 0}deg)`
            };
          },
          onMouseDown: event => {
            event.preventDefault();
            event.stopPropagation();
          },
          onClick: event => {
            event.stopPropagation();
            toggle();
          },
          get ["aria-label"]() {
            return _$memo(() => !!store.collapsed)() ? language.t("session.revertDock.expand") : language.t("session.revertDock.collapse");
          }
        }));
        return _el$;
      })(), _$createComponent(Show, {
        get when() {
          return store.collapsed;
        },
        get children() {
          return _tmpl$3();
        }
      }), _$createComponent(Show, {
        get when() {
          return !store.collapsed;
        },
        get children() {
          var _el$6 = _tmpl$4();
          _$insert(_el$6, _$createComponent(For, {
            get each() {
              return props.items;
            },
            children: item => (() => {
              var _el$7 = _tmpl$5(),
                _el$8 = _el$7.firstChild;
              _$insert(_el$8, () => item.text);
              _$insert(_el$7, _$createComponent(Button, {
                size: "small",
                variant: "secondary",
                "class": "shrink-0",
                get disabled() {
                  return props.disabled || !!props.restoring;
                },
                onClick: () => props.onRestore(item.id),
                get children() {
                  return language.t("session.revertDock.restore");
                }
              }), null);
              return _el$7;
            })()
          }));
          return _el$6;
        }
      })];
    }
  });
}
_$delegateEvents(["click", "keydown"]);