import { template as _$template } from "solid-js/web";
import { setStyleProperty as _$setStyleProperty } from "solid-js/web";
import { className as _$className } from "solid-js/web";
import { setAttribute as _$setAttribute } from "solid-js/web";
import { effect as _$effect } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { memo as _$memo } from "solid-js/web";
import { use as _$use } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<span data-component=text-reveal><span data-slot=text-reveal-track><span data-slot=text-reveal-entering></span><span data-slot=text-reveal-leaving>`);
import { createEffect, on, onCleanup, onMount } from "solid-js";
import { createStore } from "solid-js/store";
const px = (value, fallback) => {
  if (typeof value === "number") return `${value}px`;
  if (typeof value === "string") return value;
  return `${fallback}px`;
};
const ms = (value, fallback) => {
  if (typeof value === "number") return `${value}ms`;
  if (typeof value === "string") return value;
  return `${fallback}ms`;
};
const pct = (value, fallback) => {
  const v = value ?? fallback;
  return `${v}%`;
};
export function TextReveal(props) {
  const [state, setState] = createStore({
    cur: props.text,
    old: undefined,
    width: "auto",
    ready: false,
    swapping: false
  });
  const cur = () => state.cur;
  const old = () => state.old;
  const width = () => state.width;
  const ready = () => state.ready;
  const swapping = () => state.swapping;
  let inRef;
  let outRef;
  let rootRef;
  let frame;
  const win = () => inRef?.scrollWidth ?? 0;
  const wout = () => outRef?.scrollWidth ?? 0;
  const widen = next => {
    if (next <= 0) return;
    if (props.growOnly ?? true) {
      const prev = Number.parseFloat(width());
      if (Number.isFinite(prev) && next <= prev) return;
    }
    setState("width", `${next}px`);
  };
  createEffect(on(() => props.text, (next, prev) => {
    if (next === prev) return;
    if (typeof next === "string" && typeof prev === "string" && next.startsWith(prev)) {
      setState("cur", next);
      widen(win());
      return;
    }
    setState("swapping", true);
    setState("old", prev);
    setState("cur", next);
    if (typeof requestAnimationFrame !== "function") {
      widen(Math.max(win(), wout()));
      rootRef?.offsetHeight;
      setState("swapping", false);
      return;
    }
    if (frame !== undefined && typeof cancelAnimationFrame === "function") cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      widen(Math.max(win(), wout()));
      rootRef?.offsetHeight;
      setState("swapping", false);
      frame = undefined;
    });
  }));
  onMount(() => {
    widen(win());
    const fonts = typeof document !== "undefined" ? document.fonts : undefined;
    if (typeof requestAnimationFrame !== "function") {
      setState("ready", true);
      return;
    }
    if (!fonts) {
      requestAnimationFrame(() => setState("ready", true));
      return;
    }
    void fonts.ready.finally(() => {
      widen(win());
      requestAnimationFrame(() => setState("ready", true));
    });
  });
  onCleanup(() => {
    if (frame === undefined || typeof cancelAnimationFrame !== "function") return;
    cancelAnimationFrame(frame);
  });
  return (() => {
    var _el$ = _tmpl$(),
      _el$2 = _el$.firstChild,
      _el$3 = _el$2.firstChild,
      _el$4 = _el$3.nextSibling;
    var _ref$ = rootRef;
    typeof _ref$ === "function" ? _$use(_ref$, _el$) : rootRef = _el$;
    var _ref$2 = inRef;
    typeof _ref$2 === "function" ? _$use(_ref$2, _el$3) : inRef = _el$3;
    _$insert(_el$3, () => cur() ?? "\u00A0");
    var _ref$3 = outRef;
    typeof _ref$3 === "function" ? _$use(_ref$3, _el$4) : outRef = _el$4;
    _$insert(_el$4, () => old() ?? "\u00A0");
    _$effect(_p$ => {
      var _v$ = ready() ? "true" : "false",
        _v$2 = swapping() ? "true" : "false",
        _v$3 = props.truncate ? "true" : "false",
        _v$4 = props.class,
        _v$5 = props.text ?? "",
        _v$6 = ms(props.duration, 450),
        _v$7 = pct(props.edge, 17),
        _v$8 = px(props.travel, 0),
        _v$9 = props.spring ?? "cubic-bezier(0.34, 1.08, 0.64, 1)",
        _v$0 = props.springSoft ?? "cubic-bezier(0.34, 1, 0.64, 1)",
        _v$1 = props.truncate ? "100%" : width();
      _v$ !== _p$.e && _$setAttribute(_el$, "data-ready", _p$.e = _v$);
      _v$2 !== _p$.t && _$setAttribute(_el$, "data-swapping", _p$.t = _v$2);
      _v$3 !== _p$.a && _$setAttribute(_el$, "data-truncate", _p$.a = _v$3);
      _v$4 !== _p$.o && _$className(_el$, _p$.o = _v$4);
      _v$5 !== _p$.i && _$setAttribute(_el$, "aria-label", _p$.i = _v$5);
      _v$6 !== _p$.n && _$setStyleProperty(_el$, "--text-reveal-duration", _p$.n = _v$6);
      _v$7 !== _p$.s && _$setStyleProperty(_el$, "--text-reveal-edge", _p$.s = _v$7);
      _v$8 !== _p$.h && _$setStyleProperty(_el$, "--text-reveal-travel", _p$.h = _v$8);
      _v$9 !== _p$.r && _$setStyleProperty(_el$, "--text-reveal-spring", _p$.r = _v$9);
      _v$0 !== _p$.d && _$setStyleProperty(_el$, "--text-reveal-spring-soft", _p$.d = _v$0);
      _v$1 !== _p$.l && _$setStyleProperty(_el$2, "width", _p$.l = _v$1);
      return _p$;
    }, {
      e: undefined,
      t: undefined,
      a: undefined,
      o: undefined,
      i: undefined,
      n: undefined,
      s: undefined,
      h: undefined,
      r: undefined,
      d: undefined,
      l: undefined
    });
    return _el$;
  })();
}