import { template as _$template } from "solid-js/web";
import { setStyleProperty as _$setStyleProperty } from "solid-js/web";
import { style as _$style } from "solid-js/web";
import { className as _$className } from "solid-js/web";
import { effect as _$effect } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { use as _$use } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<span data-component=text-strikethrough style=display:grid><span style="grid-area:1 / 1"></span><span aria-hidden=true style="grid-area:1 / 1;text-decoration:line-through;pointer-events:none">`);
import { onMount } from "solid-js";
import { createResizeObserver } from "@solid-primitives/resize-observer";
import { createStore } from "solid-js/store";
import { useSpring } from "./motion-spring.js";
export function TextStrikethrough(props) {
  const progress = useSpring(() => props.active ? 1 : 0, () => ({
    visualDuration: props.visualDuration ?? 0.35,
    bounce: 0
  }));
  let baseRef;
  let containerRef;
  const [state, setState] = createStore({
    textWidth: 0,
    containerWidth: 0
  });
  const textWidth = () => state.textWidth;
  const containerWidth = () => state.containerWidth;
  const measure = () => {
    if (baseRef) setState("textWidth", baseRef.scrollWidth);
    if (containerRef) setState("containerWidth", containerRef.offsetWidth);
  };
  onMount(measure);
  createResizeObserver(() => containerRef, measure);

  // Revealed pixels from left = progress * textWidth
  const revealedPx = () => {
    const tw = textWidth();
    return tw > 0 ? progress() * tw : 0;
  };

  // Overlay clip: hide everything to the right of revealed area
  const overlayClip = () => {
    const cw = containerWidth();
    const tw = textWidth();
    if (cw <= 0 || tw <= 0) return `inset(0 ${(1 - progress()) * 100}% 0 0)`;
    const remaining = Math.max(0, cw - revealedPx());
    return `inset(0 ${remaining}px 0 0)`;
  };

  // Base clip: hide everything to the left of revealed area (complementary)
  const baseClip = () => {
    const px = revealedPx();
    if (px <= 0.5) return "none";
    return `inset(0 0 0 ${px}px)`;
  };
  return (() => {
    var _el$ = _tmpl$(),
      _el$2 = _el$.firstChild,
      _el$3 = _el$2.nextSibling;
    var _ref$ = containerRef;
    typeof _ref$ === "function" ? _$use(_ref$, _el$) : containerRef = _el$;
    var _ref$2 = baseRef;
    typeof _ref$2 === "function" ? _$use(_ref$2, _el$2) : baseRef = _el$2;
    _$insert(_el$2, () => props.text);
    _$insert(_el$3, () => props.text);
    _$effect(_p$ => {
      var _v$ = props.class,
        _v$2 = {
          ...props.style
        },
        _v$3 = baseClip(),
        _v$4 = overlayClip();
      _v$ !== _p$.e && _$className(_el$, _p$.e = _v$);
      _p$.t = _$style(_el$, _v$2, _p$.t);
      _v$3 !== _p$.a && _$setStyleProperty(_el$2, "clip-path", _p$.a = _v$3);
      _v$4 !== _p$.o && _$setStyleProperty(_el$3, "clip-path", _p$.o = _v$4);
      return _p$;
    }, {
      e: undefined,
      t: undefined,
      a: undefined,
      o: undefined
    });
    return _el$;
  })();
}