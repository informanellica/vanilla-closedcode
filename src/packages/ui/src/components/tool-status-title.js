import { template as _$template } from "solid-js/web";
import { className as _$className } from "solid-js/web";
import { setAttribute as _$setAttribute } from "solid-js/web";
import { setStyleProperty as _$setStyleProperty } from "solid-js/web";
import { effect as _$effect } from "solid-js/web";
import { use as _$use } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<span data-slot=tool-status-suffix><span data-slot=tool-status-prefix></span><span data-slot=tool-status-tail><span data-slot=tool-status-active></span><span data-slot=tool-status-done>`),
  _tmpl$2 = /*#__PURE__*/_$template(`<span data-component=tool-status-title>`),
  _tmpl$3 = /*#__PURE__*/_$template(`<span data-slot=tool-status-swap><span data-slot=tool-status-active></span><span data-slot=tool-status-done>`);
import { Show, createEffect, createMemo, on, onCleanup, onMount } from "solid-js";
import { createStore } from "solid-js/store";
import { TextShimmer } from "./text-shimmer.js";
function common(active, done) {
  const a = Array.from(active);
  const b = Array.from(done);
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return {
    prefix: a.slice(0, i).join(""),
    active: a.slice(i).join(""),
    done: b.slice(i).join("")
  };
}
function contentWidth(el) {
  if (!el) return 0;
  const range = document.createRange();
  range.selectNodeContents(el);
  return Math.ceil(range.getBoundingClientRect().width);
}
export function ToolStatusTitle(props) {
  const split = createMemo(() => common(props.activeText, props.doneText));
  const suffix = createMemo(() => (props.split ?? true) && split().prefix.length >= 2 && split().active.length > 0 && split().done.length > 0);
  const prefixLen = createMemo(() => Array.from(split().prefix).length);
  const activeTail = createMemo(() => suffix() ? split().active : props.activeText);
  const doneTail = createMemo(() => suffix() ? split().done : props.doneText);
  const [state, setState] = createStore({
    width: "auto",
    ready: false
  });
  const width = () => state.width;
  const ready = () => state.ready;
  let activeRef;
  let doneRef;
  let frame;
  let readyFrame;
  const measure = () => {
    const target = props.active ? activeRef : doneRef;
    const px = contentWidth(target);
    if (px > 0) setState("width", `${px}px`);
  };
  const schedule = () => {
    if (typeof requestAnimationFrame !== "function") {
      measure();
      return;
    }
    if (frame !== undefined) cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      frame = undefined;
      measure();
    });
  };
  const finish = () => {
    if (typeof requestAnimationFrame !== "function") {
      setState("ready", true);
      return;
    }
    if (readyFrame !== undefined) cancelAnimationFrame(readyFrame);
    readyFrame = requestAnimationFrame(() => {
      readyFrame = undefined;
      setState("ready", true);
    });
  };
  createEffect(on([() => props.active, activeTail, doneTail, suffix], () => schedule()));
  onMount(() => {
    measure();
    const fonts = typeof document !== "undefined" ? document.fonts : undefined;
    if (!fonts) {
      finish();
      return;
    }
    void fonts.ready.finally(() => {
      measure();
      finish();
    });
  });
  onCleanup(() => {
    if (frame !== undefined) cancelAnimationFrame(frame);
    if (readyFrame !== undefined) cancelAnimationFrame(readyFrame);
  });
  return (() => {
    var _el$ = _tmpl$2();
    _$insert(_el$, _$createComponent(Show, {
      get when() {
        return suffix();
      },
      get fallback() {
        return (() => {
          var _el$7 = _tmpl$3(),
            _el$8 = _el$7.firstChild,
            _el$9 = _el$8.nextSibling;
          var _ref$3 = activeRef;
          typeof _ref$3 === "function" ? _$use(_ref$3, _el$8) : activeRef = _el$8;
          _$insert(_el$8, _$createComponent(TextShimmer, {
            get text() {
              return activeTail();
            },
            get active() {
              return props.active;
            },
            offset: 0
          }));
          var _ref$4 = doneRef;
          typeof _ref$4 === "function" ? _$use(_ref$4, _el$9) : doneRef = _el$9;
          _$insert(_el$9, _$createComponent(TextShimmer, {
            get text() {
              return doneTail();
            },
            active: false,
            offset: 0
          }));
          _$effect(_$p => _$setStyleProperty(_el$7, "width", width()));
          return _el$7;
        })();
      },
      get children() {
        var _el$2 = _tmpl$(),
          _el$3 = _el$2.firstChild,
          _el$4 = _el$3.nextSibling,
          _el$5 = _el$4.firstChild,
          _el$6 = _el$5.nextSibling;
        _$insert(_el$3, _$createComponent(TextShimmer, {
          get text() {
            return split().prefix;
          },
          get active() {
            return props.active;
          },
          offset: 0
        }));
        var _ref$ = activeRef;
        typeof _ref$ === "function" ? _$use(_ref$, _el$5) : activeRef = _el$5;
        _$insert(_el$5, _$createComponent(TextShimmer, {
          get text() {
            return activeTail();
          },
          get active() {
            return props.active;
          },
          get offset() {
            return prefixLen();
          }
        }));
        var _ref$2 = doneRef;
        typeof _ref$2 === "function" ? _$use(_ref$2, _el$6) : doneRef = _el$6;
        _$insert(_el$6, _$createComponent(TextShimmer, {
          get text() {
            return doneTail();
          },
          active: false,
          get offset() {
            return prefixLen();
          }
        }));
        _$effect(_$p => _$setStyleProperty(_el$4, "width", width()));
        return _el$2;
      }
    }));
    _$effect(_p$ => {
      var _v$ = props.active ? "true" : "false",
        _v$2 = ready() ? "true" : "false",
        _v$3 = suffix() ? "suffix" : "swap",
        _v$4 = props.class,
        _v$5 = props.active ? props.activeText : props.doneText;
      _v$ !== _p$.e && _$setAttribute(_el$, "data-active", _p$.e = _v$);
      _v$2 !== _p$.t && _$setAttribute(_el$, "data-ready", _p$.t = _v$2);
      _v$3 !== _p$.a && _$setAttribute(_el$, "data-mode", _p$.a = _v$3);
      _v$4 !== _p$.o && _$className(_el$, _p$.o = _v$4);
      _v$5 !== _p$.i && _$setAttribute(_el$, "aria-label", _p$.i = _v$5);
      return _p$;
    }, {
      e: undefined,
      t: undefined,
      a: undefined,
      o: undefined,
      i: undefined
    });
    return _el$;
  })();
}