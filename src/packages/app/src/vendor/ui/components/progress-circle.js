import { template as _$template } from "solid-js/web";
import { setAttribute as _$setAttribute } from "solid-js/web";
import { effect as _$effect } from "solid-js/web";
import { spread as _$spread } from "solid-js/web";
import { mergeProps as _$mergeProps } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<svg><circle cx=8 cy=8 data-slot=progress-circle-background></circle><circle cx=8 cy=8 data-slot=progress-circle-progress>`);
import { createMemo, splitProps } from "solid-js";
export function ProgressCircle(props) {
  const [split, rest] = splitProps(props, ["percentage", "size", "strokeWidth", "class", "classList"]);
  const size = () => split.size || 16;
  const strokeWidth = () => split.strokeWidth || 3;
  const viewBoxSize = 16;
  const center = viewBoxSize / 2;
  const radius = () => center - strokeWidth() / 2;
  const circumference = createMemo(() => 2 * Math.PI * (radius() || 0));
  const offset = createMemo(() => {
    const clampedPercentage = Math.max(0, Math.min(100, split.percentage || 0));
    const progress = clampedPercentage / 100;
    return (circumference() || 0) * (1 - progress);
  });
  return (() => {
    var _el$ = _tmpl$(),
      _el$2 = _el$.firstChild,
      _el$3 = _el$2.nextSibling;
    _$spread(_el$, _$mergeProps(rest, {
      get width() {
        return size();
      },
      get height() {
        return size();
      },
      "viewBox": "0 0 16 16",
      "fill": "none",
      "data-component": "progress-circle",
      get classList() {
        return {
          ...split.classList,
          [split.class ?? ""]: !!split.class
        };
      }
    }), true, true);
    _$effect(_p$ => {
      var _v$ = radius(),
        _v$2 = strokeWidth(),
        _v$3 = radius(),
        _v$4 = strokeWidth(),
        _v$5 = String(circumference() ?? 0),
        _v$6 = offset() ?? 0;
      _v$ !== _p$.e && _$setAttribute(_el$2, "r", _p$.e = _v$);
      _v$2 !== _p$.t && _$setAttribute(_el$2, "stroke-width", _p$.t = _v$2);
      _v$3 !== _p$.a && _$setAttribute(_el$3, "r", _p$.a = _v$3);
      _v$4 !== _p$.o && _$setAttribute(_el$3, "stroke-width", _p$.o = _v$4);
      _v$5 !== _p$.i && _$setAttribute(_el$3, "stroke-dasharray", _p$.i = _v$5);
      _v$6 !== _p$.n && _$setAttribute(_el$3, "stroke-dashoffset", _p$.n = _v$6);
      return _p$;
    }, {
      e: undefined,
      t: undefined,
      a: undefined,
      o: undefined,
      i: undefined,
      n: undefined
    });
    return _el$;
  })();
}