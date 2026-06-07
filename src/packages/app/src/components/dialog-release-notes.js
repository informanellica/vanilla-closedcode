import { template as _$template } from "solid-js/web";
import { delegateEvents as _$delegateEvents } from "solid-js/web";
import { setAttribute as _$setAttribute } from "solid-js/web";
import { effect as _$effect } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { memo as _$memo } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<div class="d-flex flex-1 min-w-0 min-h-0"tabindex=0 autofocus><div class="d-flex flex-column flex-1 min-w-0 p-8"><div class="d-flex flex-column gap-2 pt-22"><div class="d-flex align-items-center gap-2"><h1 class="fs-6 fw-medium text-body-emphasis"></h1></div><p class="text-body"></p></div><div class=flex-1></div><div class="d-flex flex-column gap-12"><div class="d-flex flex-column align-items-start gap-3">`),
  _tmpl$2 = /*#__PURE__*/_$template(`<div class="d-flex align-items-center gap-1.5 -my-2.5">`),
  _tmpl$3 = /*#__PURE__*/_$template(`<button type=button class="h-6 d-flex align-items-center cursor-pointer bg-transparent border-none p-0 transition-all duration-200"><div class="w-100 h-0.5 rounded-[1px] transition-colors duration-200">`),
  _tmpl$4 = /*#__PURE__*/_$template(`<div class="flex-1 min-w-0 bg-body-tertiary overflow-hidden rounded-r-xl">`),
  _tmpl$5 = /*#__PURE__*/_$template(`<img class="w-100 h-100 object-cover">`),
  _tmpl$6 = /*#__PURE__*/_$template(`<video autoplay loop muted playsinline class="w-100 h-100 object-cover">`);
import { createSignal } from "solid-js";
import { Dialog } from "@/bs/dialog.js";
import { Button } from "@/bs/button.js";
import { useDialog } from "@/lib/dialog.js";
import { useLanguage } from "@/context/language.js";
import { useSettings } from "@/context/settings.js";
export function DialogReleaseNotes(props) {
  const dialog = useDialog();
  const language = useLanguage();
  const settings = useSettings();
  const [index, setIndex] = createSignal(0);
  const total = () => props.highlights.length;
  const last = () => Math.max(0, total() - 1);
  const feature = () => props.highlights[index()] ?? props.highlights[last()];
  const isFirst = () => index() === 0;
  const isLast = () => index() >= last();
  const paged = () => total() > 1;
  function handleNext() {
    if (isLast()) return;
    setIndex(index() + 1);
  }
  function handleClose() {
    dialog.close();
  }
  function handleDisable() {
    settings.general.setReleaseNotes(false);
    handleClose();
  }
  function handleKeyDown(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      handleClose();
      return;
    }
    if (!paged()) return;
    if (e.key === "ArrowLeft" && !isFirst()) {
      e.preventDefault();
      setIndex(index() - 1);
    }
    if (e.key === "ArrowRight" && !isLast()) {
      e.preventDefault();
      setIndex(index() + 1);
    }
  }
  return _$createComponent(Dialog, {
    size: "large",
    fit: true,
    "class": "w-[min(calc(100vw-40px),720px)] h-[min(calc(100vh-40px),400px)] -mt-20 min-h-0 overflow-hidden",
    get children() {
      var _el$ = _tmpl$(),
        _el$2 = _el$.firstChild,
        _el$3 = _el$2.firstChild,
        _el$4 = _el$3.firstChild,
        _el$5 = _el$4.firstChild,
        _el$6 = _el$4.nextSibling,
        _el$7 = _el$3.nextSibling,
        _el$8 = _el$7.nextSibling,
        _el$9 = _el$8.firstChild;
      _el$.$$keydown = handleKeyDown;
      _$insert(_el$5, () => feature()?.title ?? "");
      _$insert(_el$6, () => feature()?.description ?? "");
      _$insert(_el$9, (() => {
        var _c$ = _$memo(() => !!isLast());
        return () => _c$() ? _$createComponent(Button, {
          variant: "primary",
          size: "large",
          onClick: handleClose,
          get children() {
            return language.t("dialog.releaseNotes.action.getStarted");
          }
        }) : _$createComponent(Button, {
          variant: "secondary",
          size: "large",
          onClick: handleNext,
          get children() {
            return language.t("dialog.releaseNotes.action.next");
          }
        });
      })(), null);
      _$insert(_el$9, _$createComponent(Button, {
        variant: "ghost",
        size: "small",
        onClick: handleDisable,
        get children() {
          return language.t("dialog.releaseNotes.action.hideFuture");
        }
      }), null);
      _$insert(_el$8, (() => {
        var _c$2 = _$memo(() => !!paged());
        return () => _c$2() && (() => {
          var _el$0 = _tmpl$2();
          _$insert(_el$0, () => props.highlights.map((_, i) => (() => {
            var _el$1 = _tmpl$3(),
              _el$10 = _el$1.firstChild;
            _el$1.$$click = () => setIndex(i);
            _$effect(_p$ => {
              var _v$ = !!(i === index()),
                _v$2 = !!(i !== index()),
                _v$3 = !!(i === index()),
                _v$4 = !!(i !== index());
              _v$ !== _p$.e && _el$1.classList.toggle("w-8", _p$.e = _v$);
              _v$2 !== _p$.t && _el$1.classList.toggle("w-3", _p$.t = _v$2);
              _v$3 !== _p$.a && _el$10.classList.toggle("bg-icon-strong-base", _p$.a = _v$3);
              _v$4 !== _p$.o && _el$10.classList.toggle("bg-icon-weak-base", _p$.o = _v$4);
              return _p$;
            }, {
              e: undefined,
              t: undefined,
              a: undefined,
              o: undefined
            });
            return _el$1;
          })()));
          return _el$0;
        })();
      })(), null);
      _$insert(_el$, (() => {
        var _c$3 = _$memo(() => !!feature()?.media);
        return () => _c$3() && (() => {
          var _el$11 = _tmpl$4();
          _$insert(_el$11, (() => {
            var _c$4 = _$memo(() => feature().media.type === "image");
            return () => _c$4() ? (() => {
              var _el$12 = _tmpl$5();
              _$effect(_p$ => {
                var _v$5 = feature().media.src,
                  _v$6 = feature().media.alt ?? feature()?.title ?? language.t("dialog.releaseNotes.media.alt");
                _v$5 !== _p$.e && _$setAttribute(_el$12, "src", _p$.e = _v$5);
                _v$6 !== _p$.t && _$setAttribute(_el$12, "alt", _p$.t = _v$6);
                return _p$;
              }, {
                e: undefined,
                t: undefined
              });
              return _el$12;
            })() : (() => {
              var _el$13 = _tmpl$6();
              _$effect(() => _$setAttribute(_el$13, "src", feature().media.src));
              return _el$13;
            })();
          })());
          return _el$11;
        })();
      })(), null);
      return _el$;
    }
  });
}
_$delegateEvents(["keydown", "click"]);