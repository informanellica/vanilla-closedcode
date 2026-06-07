import { template as _$template } from "solid-js/web";
import { setStyleProperty as _$setStyleProperty } from "solid-js/web";
import { setAttribute as _$setAttribute } from "solid-js/web";
import { effect as _$effect } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
import { spread as _$spread } from "solid-js/web";
import { mergeProps as _$mergeProps } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<svg>`),
  _tmpl$2 = /*#__PURE__*/_$template(`<svg><rect width=3 height=3 rx=1></svg>`, false, true, false);
import { For } from "solid-js";
const outerIndices = new Set([1, 2, 4, 7, 8, 11, 13, 14]);
const cornerIndices = new Set([0, 3, 12, 15]);
const squares = Array.from({
  length: 16
}, (_, i) => ({
  id: i,
  x: i % 4 * 4,
  y: Math.floor(i / 4) * 4,
  delay: Math.random() * 1.5,
  duration: 1 + Math.random() * 1,
  outer: outerIndices.has(i),
  corner: cornerIndices.has(i)
}));
export function Spinner(props) {
  return (() => {
    var _el$ = _tmpl$();
    _$spread(_el$, _$mergeProps(props, {
      "viewBox": "0 0 15 15",
      "data-component": "spinner",
      get classList() {
        return {
          ...props.classList,
          [props.class ?? ""]: !!props.class
        };
      },
      "fill": "currentColor"
    }), true, true);
    _$insert(_el$, _$createComponent(For, {
      each: squares,
      children: square => (() => {
        var _el$2 = _tmpl$2();
        _$effect(_p$ => {
          var _v$ = square.x,
            _v$2 = square.y,
            _v$3 = square.corner ? 0 : undefined,
            _v$4 = square.corner ? undefined : `${square.outer ? "pulse-opacity-dim" : "pulse-opacity"} ${square.duration}s ease-in-out infinite`,
            _v$5 = square.corner ? undefined : "both",
            _v$6 = square.corner ? undefined : `${square.delay}s`;
          _v$ !== _p$.e && _$setAttribute(_el$2, "x", _p$.e = _v$);
          _v$2 !== _p$.t && _$setAttribute(_el$2, "y", _p$.t = _v$2);
          _v$3 !== _p$.a && _$setStyleProperty(_el$2, "opacity", _p$.a = _v$3);
          _v$4 !== _p$.o && _$setStyleProperty(_el$2, "animation", _p$.o = _v$4);
          _v$5 !== _p$.i && _$setStyleProperty(_el$2, "animation-fill-mode", _p$.i = _v$5);
          _v$6 !== _p$.n && _$setStyleProperty(_el$2, "animation-delay", _p$.n = _v$6);
          return _p$;
        }, {
          e: undefined,
          t: undefined,
          a: undefined,
          o: undefined,
          i: undefined,
          n: undefined
        });
        return _el$2;
      })()
    }));
    return _el$;
  })();
}