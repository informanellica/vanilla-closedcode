import { template as _$template } from "solid-js/web";
import { className as _$className } from "solid-js/web";
import { setStyleProperty as _$setStyleProperty } from "solid-js/web";
import { setAttribute as _$setAttribute } from "solid-js/web";
import { effect as _$effect } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<span data-slot=animated-number-digit><span data-slot=animated-number-strip style="--animated-number-duration:var(--tool-motion-odometer-ms, 600ms)">`),
  _tmpl$2 = /*#__PURE__*/_$template(`<span data-slot=animated-number-cell>`),
  _tmpl$3 = /*#__PURE__*/_$template(`<span data-component=animated-number><span data-slot=animated-number-value>`);
import { For, Index, createEffect, createMemo, on } from "solid-js";
import { createStore } from "solid-js/store";
const TRACK = Array.from({
  length: 30
}, (_, index) => index % 10);
const DURATION = 600;
function normalize(value) {
  return (value % 10 + 10) % 10;
}
function spin(from, to, direction) {
  if (from === to) return 0;
  if (direction > 0) return (to - from + 10) % 10;
  return -((from - to + 10) % 10);
}
function Digit(props) {
  const [state, setState] = createStore({
    step: props.value + 10,
    animating: false
  });
  const step = () => state.step;
  const animating = () => state.animating;
  let last = props.value;
  createEffect(on(() => props.value, next => {
    const delta = spin(last, next, props.direction);
    last = next;
    if (!delta) {
      setState("animating", false);
      setState("step", next + 10);
      return;
    }
    setState("animating", true);
    setState("step", value => value + delta);
  }, {
    defer: true
  }));
  return (() => {
    var _el$ = _tmpl$(),
      _el$2 = _el$.firstChild;
    _el$2.addEventListener("transitionend", () => {
      setState("animating", false);
      setState("step", value => normalize(value) + 10);
    });
    _$insert(_el$2, _$createComponent(For, {
      each: TRACK,
      children: value => (() => {
        var _el$3 = _tmpl$2();
        _$insert(_el$3, value);
        return _el$3;
      })()
    }));
    _$effect(_p$ => {
      var _v$ = animating() ? "true" : "false",
        _v$2 = `${step()}`;
      _v$ !== _p$.e && _$setAttribute(_el$2, "data-animating", _p$.e = _v$);
      _v$2 !== _p$.t && _$setStyleProperty(_el$2, "--animated-number-offset", _p$.t = _v$2);
      return _p$;
    }, {
      e: undefined,
      t: undefined
    });
    return _el$;
  })();
}
export function AnimatedNumber(props) {
  const target = createMemo(() => {
    if (!Number.isFinite(props.value)) return 0;
    return Math.max(0, Math.round(props.value));
  });
  const [state, setState] = createStore({
    value: target(),
    direction: 1
  });
  const value = () => state.value;
  const direction = () => state.direction;
  createEffect(on(target, next => {
    const current = value();
    if (next === current) return;
    setState("direction", next > current ? 1 : -1);
    setState("value", next);
  }, {
    defer: true
  }));
  const label = createMemo(() => value().toString());
  const digits = createMemo(() => Array.from(label(), char => {
    const code = char.charCodeAt(0) - 48;
    if (code < 0 || code > 9) return 0;
    return code;
  }).reverse());
  const width = createMemo(() => `${digits().length}ch`);
  return (() => {
    var _el$4 = _tmpl$3(),
      _el$5 = _el$4.firstChild;
    _$insert(_el$5, _$createComponent(Index, {
      get each() {
        return digits();
      },
      children: digit => _$createComponent(Digit, {
        get value() {
          return digit();
        },
        get direction() {
          return direction();
        }
      })
    }));
    _$effect(_p$ => {
      var _v$3 = props.class,
        _v$4 = label(),
        _v$5 = width();
      _v$3 !== _p$.e && _$className(_el$4, _p$.e = _v$3);
      _v$4 !== _p$.t && _$setAttribute(_el$4, "aria-label", _p$.t = _v$4);
      _v$5 !== _p$.a && _$setStyleProperty(_el$5, "--animated-number-width", _p$.a = _v$5);
      return _p$;
    }, {
      e: undefined,
      t: undefined,
      a: undefined
    });
    return _el$4;
  })();
}