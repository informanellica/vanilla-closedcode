import { template as _$template } from "solid-js/web";
import { setAttribute as _$setAttribute } from "solid-js/web";
import { className as _$className } from "solid-js/web";
import { effect as _$effect } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<span data-component=tool-count-label><span data-slot=tool-count-label-before></span><span data-slot=tool-count-label-word><span data-slot=tool-count-label-stem></span><span data-slot=tool-count-label-suffix><span data-slot=tool-count-label-suffix-inner>`);
import { createMemo } from "solid-js";
import { AnimatedNumber } from "./animated-number.js";
function split(text) {
  const match = /{{\s*count\s*}}/.exec(text);
  if (!match) return {
    before: "",
    after: text
  };
  if (match.index === undefined) return {
    before: "",
    after: text
  };
  return {
    before: text.slice(0, match.index),
    after: text.slice(match.index + match[0].length)
  };
}
function common(one, other) {
  const a = Array.from(one);
  const b = Array.from(other);
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return {
    stem: a.slice(0, i).join(""),
    one: a.slice(i).join(""),
    other: b.slice(i).join("")
  };
}
export function AnimatedCountLabel(props) {
  const one = createMemo(() => split(props.one));
  const other = createMemo(() => split(props.other));
  const singular = createMemo(() => Math.round(props.count) === 1);
  const active = createMemo(() => singular() ? one() : other());
  const suffix = createMemo(() => common(one().after, other().after));
  const splitSuffix = createMemo(() => one().before === other().before && (one().after.startsWith(other().after) || other().after.startsWith(one().after)));
  const before = createMemo(() => splitSuffix() ? one().before : active().before);
  const stem = createMemo(() => splitSuffix() ? suffix().stem : active().after);
  const tail = createMemo(() => {
    if (!splitSuffix()) return "";
    if (singular()) return suffix().one;
    return suffix().other;
  });
  const showTail = createMemo(() => splitSuffix() && tail().length > 0);
  return (() => {
    var _el$ = _tmpl$(),
      _el$2 = _el$.firstChild,
      _el$3 = _el$2.nextSibling,
      _el$4 = _el$3.firstChild,
      _el$5 = _el$4.nextSibling,
      _el$6 = _el$5.firstChild;
    _$insert(_el$2, before);
    _$insert(_el$, _$createComponent(AnimatedNumber, {
      get value() {
        return props.count;
      }
    }), _el$3);
    _$insert(_el$4, stem);
    _$insert(_el$6, tail);
    _$effect(_p$ => {
      var _v$ = props.class,
        _v$2 = showTail() ? "true" : "false";
      _v$ !== _p$.e && _$className(_el$, _p$.e = _v$);
      _v$2 !== _p$.t && _$setAttribute(_el$5, "data-active", _p$.t = _v$2);
      return _p$;
    }, {
      e: undefined,
      t: undefined
    });
    return _el$;
  })();
}