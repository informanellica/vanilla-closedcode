import { template as _$template } from "solid-js/web";
import { delegateEvents as _$delegateEvents } from "solid-js/web";
import { setAttribute as _$setAttribute } from "solid-js/web";
import { setStyleProperty as _$setStyleProperty } from "solid-js/web";
import { addEventListener as _$addEventListener } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { memo as _$memo } from "solid-js/web";
import { effect as _$effect } from "solid-js/web";
import { use as _$use } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<div class="fixed z-50 flex h-8 items-center gap-2 rounded-md border border-border-base bg-background-base px-3 shadow-md"><input class="w-40 bg-transparent outline-none text-14-regular text-text-strong placeholder:text-text-weak"><div class="shrink-0 text-12-regular text-text-weak tabular-nums text-right"style=width:10ch></div><div class="flex items-center"><button type=button class="size-6 grid place-items-center rounded text-text-weak hover:bg-surface-base-hover hover:text-text-strong disabled:opacity-40 disabled:pointer-events-none"></button><button type=button class="size-6 grid place-items-center rounded text-text-weak hover:bg-surface-base-hover hover:text-text-strong disabled:opacity-40 disabled:pointer-events-none"></button></div><button type=button class="size-6 grid place-items-center rounded text-text-weak hover:bg-surface-base-hover hover:text-text-strong">`);
import { Portal } from "solid-js/web";
import { useI18n } from "../context/i18n.js";
import { Icon } from "./icon.js";
export function FileSearchBar(props) {
  const i18n = useI18n();
  return _$createComponent(Portal, {
    get children() {
      var _el$ = _tmpl$(),
        _el$2 = _el$.firstChild,
        _el$3 = _el$2.nextSibling,
        _el$4 = _el$3.nextSibling,
        _el$5 = _el$4.firstChild,
        _el$6 = _el$5.nextSibling,
        _el$7 = _el$4.nextSibling;
      _el$.$$pointerdown = e => e.stopPropagation();
      _$insert(_el$, _$createComponent(Icon, {
        name: "magnifying-glass",
        size: "small",
        "class": "text-text-weak shrink-0"
      }), _el$2);
      _el$2.$$keydown = e => props.onKeyDown(e);
      _el$2.$$input = e => props.onInput(e.currentTarget.value);
      var _ref$ = props.setInput;
      typeof _ref$ === "function" ? _$use(_ref$, _el$2) : props.setInput = _el$2;
      _$insert(_el$3, (() => {
        var _c$ = _$memo(() => !!props.count());
        return () => _c$() ? `${props.index() + 1}/${props.count()}` : "0/0";
      })());
      _$addEventListener(_el$5, "click", props.onPrev, true);
      _$insert(_el$5, _$createComponent(Icon, {
        name: "chevron-down",
        size: "small",
        "class": "rotate-180"
      }));
      _$addEventListener(_el$6, "click", props.onNext, true);
      _$insert(_el$6, _$createComponent(Icon, {
        name: "chevron-down",
        size: "small"
      }));
      _$addEventListener(_el$7, "click", props.onClose, true);
      _$insert(_el$7, _$createComponent(Icon, {
        name: "close-small",
        size: "small"
      }));
      _$effect(_p$ => {
        var _v$ = `${props.pos().top}px`,
          _v$2 = `${props.pos().right}px`,
          _v$3 = i18n.t("ui.fileSearch.placeholder"),
          _v$4 = props.count() === 0,
          _v$5 = i18n.t("ui.fileSearch.previousMatch"),
          _v$6 = props.count() === 0,
          _v$7 = i18n.t("ui.fileSearch.nextMatch"),
          _v$8 = i18n.t("ui.fileSearch.close");
        _v$ !== _p$.e && _$setStyleProperty(_el$, "top", _p$.e = _v$);
        _v$2 !== _p$.t && _$setStyleProperty(_el$, "right", _p$.t = _v$2);
        _v$3 !== _p$.a && _$setAttribute(_el$2, "placeholder", _p$.a = _v$3);
        _v$4 !== _p$.o && (_el$5.disabled = _p$.o = _v$4);
        _v$5 !== _p$.i && _$setAttribute(_el$5, "aria-label", _p$.i = _v$5);
        _v$6 !== _p$.n && (_el$6.disabled = _p$.n = _v$6);
        _v$7 !== _p$.s && _$setAttribute(_el$6, "aria-label", _p$.s = _v$7);
        _v$8 !== _p$.h && _$setAttribute(_el$7, "aria-label", _p$.h = _v$8);
        return _p$;
      }, {
        e: undefined,
        t: undefined,
        a: undefined,
        o: undefined,
        i: undefined,
        n: undefined,
        s: undefined,
        h: undefined
      });
      _$effect(() => _el$2.value = props.query());
      return _el$;
    }
  });
}
_$delegateEvents(["pointerdown", "input", "keydown", "click"]);