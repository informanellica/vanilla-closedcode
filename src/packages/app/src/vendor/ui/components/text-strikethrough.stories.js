import { template as _$template } from "solid-js/web";
import { delegateEvents as _$delegateEvents } from "solid-js/web";
import { style as _$style } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
import { memo as _$memo } from "solid-js/web";
import { use as _$use } from "solid-js/web";
import { setStyleProperty as _$setStyleProperty } from "solid-js/web";
import { effect as _$effect } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<span style="position:relative;display:block;transition:color 220ms ease"><span style="position:absolute;left:0;right:0;top:50%;height:1.5px;background:currentColor;transform-origin:left center;pointer-events:none">`),
  _tmpl$2 = /*#__PURE__*/_$template(`<span style="display:block;transition:color 220ms ease;background-image:linear-gradient(currentColor, currentColor);background-repeat:no-repeat;background-position:left center">`),
  _tmpl$3 = /*#__PURE__*/_$template(`<span style="display:grid;transition:color 220ms ease"><span style="grid-area:1 / 1"></span><span aria-hidden=true style="grid-area:1 / 1;text-decoration:line-through;pointer-events:none">`),
  _tmpl$4 = /*#__PURE__*/_$template(`<div style=display:grid;gap:24px;padding:24px;max-width:700px><button></button><div><div>F — grid stacking + clip mapped to text width (THE COMPONENT)</div><div style=margin-top:12px></div><div style=margin-top:12px></div></div><div><div>F (inline) — same but just inline variants</div><div style=margin-top:12px></div><div style=margin-top:12px></div></div><div><div>E — grid stacking + clip-path (container %)</div><div style=margin-top:12px></div><div style=margin-top:12px></div></div><div><div>A — scaleX line at 50%</div><div style=margin-top:12px></div></div><div><div>D — background-image line</div><div style=margin-top:12px>`);
import { createSignal, onMount } from "solid-js";
import { createResizeObserver } from "@solid-primitives/resize-observer";
import { createStore } from "solid-js/store";
import { useSpring } from "./motion-spring.js";
import { TextStrikethrough } from "./text-strikethrough.js";
const TEXT_SHORT = "Remove inline measure nodes";
const TEXT_MED = "Remove inline measure nodes and keep width morph behavior intact";
const TEXT_LONG = "Refactor ToolStatusTitle DOM measurement to offscreen global measurer (unconstrained by timeline layout)";
const btn = active => ({
  padding: "8px 18px",
  "border-radius": "6px",
  border: "1px solid var(--color-divider, #444)",
  background: active ? "var(--color-accent, #58f)" : "var(--color-fill-element, #222)",
  color: "var(--color-text, #eee)",
  cursor: "pointer",
  "font-size": "14px",
  "font-weight": "500"
});
const heading = {
  "font-size": "11px",
  "font-weight": "600",
  "text-transform": "uppercase",
  "letter-spacing": "0.05em",
  color: "var(--text-weak, #888)",
  "margin-bottom": "4px"
};
const card = {
  padding: "16px 20px",
  "border-radius": "10px",
  border: "1px solid var(--border-weak-base, #333)",
  background: "var(--surface-base, #1a1a1a)"
};

/* ─── Variant A: scaleX pseudo-line at 50% ─── */
function VariantA(props) {
  const progress = useSpring(() => props.active ? 1 : 0, () => ({
    visualDuration: 0.35,
    bounce: 0
  }));
  return (() => {
    var _el$ = _tmpl$(),
      _el$2 = _el$.firstChild;
    _$insert(_el$, () => props.text, _el$2);
    _$effect(_p$ => {
      var _v$ = props.active ? "var(--text-weak, #888)" : "var(--text-strong, #eee)",
        _v$2 = `scaleX(${progress()})`;
      _v$ !== _p$.e && _$setStyleProperty(_el$, "color", _p$.e = _v$);
      _v$2 !== _p$.t && _$setStyleProperty(_el$2, "transform", _p$.t = _v$2);
      return _p$;
    }, {
      e: undefined,
      t: undefined
    });
    return _el$;
  })();
}

/* ─── Variant D: background-image line ─── */
function VariantD(props) {
  const progress = useSpring(() => props.active ? 1 : 0, () => ({
    visualDuration: 0.35,
    bounce: 0
  }));
  return (() => {
    var _el$3 = _tmpl$2();
    _$insert(_el$3, () => props.text);
    _$effect(_p$ => {
      var _v$3 = props.active ? "var(--text-weak, #888)" : "var(--text-strong, #eee)",
        _v$4 = `${progress() * 100}% 1.5px`;
      _v$3 !== _p$.e && _$setStyleProperty(_el$3, "color", _p$.e = _v$3);
      _v$4 !== _p$.t && _$setStyleProperty(_el$3, "background-size", _p$.t = _v$4);
      return _p$;
    }, {
      e: undefined,
      t: undefined
    });
    return _el$3;
  })();
}

/* ─── Variant E: grid stacking + clip-path (container %) ─── */
function VariantE(props) {
  const progress = useSpring(() => props.active ? 1 : 0, () => ({
    visualDuration: 0.35,
    bounce: 0
  }));
  return (() => {
    var _el$4 = _tmpl$3(),
      _el$5 = _el$4.firstChild,
      _el$6 = _el$5.nextSibling;
    _$insert(_el$5, () => props.text);
    _$insert(_el$6, () => props.text);
    _$effect(_p$ => {
      var _v$5 = props.active ? "var(--text-weak, #888)" : "var(--text-strong, #eee)",
        _v$6 = `inset(0 ${(1 - progress()) * 100}% 0 0)`;
      _v$5 !== _p$.e && _$setStyleProperty(_el$4, "color", _p$.e = _v$5);
      _v$6 !== _p$.t && _$setStyleProperty(_el$6, "clip-path", _p$.t = _v$6);
      return _p$;
    }, {
      e: undefined,
      t: undefined
    });
    return _el$4;
  })();
}

/* ─── Variant F: grid stacking + clip-path mapped to text width ─── */
function VariantF(props) {
  const progress = useSpring(() => props.active ? 1 : 0, () => ({
    visualDuration: 0.35,
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
  const clipRight = () => {
    const cw = containerWidth();
    const tw = textWidth();
    if (cw <= 0 || tw <= 0) return `${(1 - progress()) * 100}%`;
    const revealed = progress() * tw;
    const remaining = Math.max(0, cw - revealed);
    return `${remaining}px`;
  };
  return (() => {
    var _el$7 = _tmpl$3(),
      _el$8 = _el$7.firstChild,
      _el$9 = _el$8.nextSibling;
    var _ref$ = containerRef;
    typeof _ref$ === "function" ? _$use(_ref$, _el$7) : containerRef = _el$7;
    var _ref$2 = baseRef;
    typeof _ref$2 === "function" ? _$use(_ref$2, _el$8) : baseRef = _el$8;
    _$insert(_el$8, () => props.text);
    _$insert(_el$9, () => props.text);
    _$effect(_p$ => {
      var _v$7 = props.active ? "var(--text-weak, #888)" : "var(--text-strong, #eee)",
        _v$8 = `inset(0 ${clipRight()} 0 0)`;
      _v$7 !== _p$.e && _$setStyleProperty(_el$7, "color", _p$.e = _v$7);
      _v$8 !== _p$.t && _$setStyleProperty(_el$9, "clip-path", _p$.t = _v$8);
      return _p$;
    }, {
      e: undefined,
      t: undefined
    });
    return _el$7;
  })();
}
export default {
  title: "UI/Text Strikethrough",
  id: "components-text-strikethrough",
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component: `### Animated Strikethrough Variants

- **A** — scaleX line at 50% (single line only)
- **D** — background-image line (single line only)
- **E** — grid stacking + clip-path (container %)
- **F** — grid stacking + clip-path mapped to text width (the real component)`
      }
    }
  }
};
export const Playground = {
  render: () => {
    const [active, setActive] = createSignal(false);
    const toggle = () => setActive(v => !v);
    return (() => {
      var _el$0 = _tmpl$4(),
        _el$1 = _el$0.firstChild,
        _el$10 = _el$1.nextSibling,
        _el$11 = _el$10.firstChild,
        _el$12 = _el$11.nextSibling,
        _el$13 = _el$12.nextSibling,
        _el$14 = _el$10.nextSibling,
        _el$15 = _el$14.firstChild,
        _el$16 = _el$15.nextSibling,
        _el$17 = _el$16.nextSibling,
        _el$18 = _el$14.nextSibling,
        _el$19 = _el$18.firstChild,
        _el$20 = _el$19.nextSibling,
        _el$21 = _el$20.nextSibling,
        _el$22 = _el$18.nextSibling,
        _el$23 = _el$22.firstChild,
        _el$24 = _el$23.nextSibling,
        _el$25 = _el$22.nextSibling,
        _el$26 = _el$25.firstChild,
        _el$27 = _el$26.nextSibling;
      _el$1.$$click = toggle;
      _$insert(_el$1, () => active() ? "Undo strikethrough" : "Strike through all");
      _$insert(_el$10, _$createComponent(TextStrikethrough, {
        get active() {
          return active();
        },
        text: TEXT_SHORT,
        get style() {
          return {
            color: active() ? "var(--text-weak, #888)" : "var(--text-strong, #eee)",
            transition: "color 220ms ease"
          };
        }
      }), _el$12);
      _$insert(_el$10, _$createComponent(TextStrikethrough, {
        get active() {
          return active();
        },
        text: TEXT_MED,
        get style() {
          return {
            color: active() ? "var(--text-weak, #888)" : "var(--text-strong, #eee)",
            transition: "color 220ms ease"
          };
        }
      }), _el$13);
      _$insert(_el$10, _$createComponent(TextStrikethrough, {
        get active() {
          return active();
        },
        text: TEXT_LONG,
        get style() {
          return {
            color: active() ? "var(--text-weak, #888)" : "var(--text-strong, #eee)",
            transition: "color 220ms ease"
          };
        }
      }), null);
      _$insert(_el$14, _$createComponent(VariantF, {
        get active() {
          return active();
        },
        text: TEXT_SHORT
      }), _el$16);
      _$insert(_el$14, _$createComponent(VariantF, {
        get active() {
          return active();
        },
        text: TEXT_MED
      }), _el$17);
      _$insert(_el$14, _$createComponent(VariantF, {
        get active() {
          return active();
        },
        text: TEXT_LONG
      }), null);
      _$insert(_el$18, _$createComponent(VariantE, {
        get active() {
          return active();
        },
        text: TEXT_SHORT
      }), _el$20);
      _$insert(_el$18, _$createComponent(VariantE, {
        get active() {
          return active();
        },
        text: TEXT_MED
      }), _el$21);
      _$insert(_el$18, _$createComponent(VariantE, {
        get active() {
          return active();
        },
        text: TEXT_LONG
      }), null);
      _$insert(_el$22, _$createComponent(VariantA, {
        get active() {
          return active();
        },
        text: TEXT_SHORT
      }), _el$24);
      _$insert(_el$22, _$createComponent(VariantA, {
        get active() {
          return active();
        },
        text: TEXT_LONG
      }), null);
      _$insert(_el$25, _$createComponent(VariantD, {
        get active() {
          return active();
        },
        text: TEXT_SHORT
      }), _el$27);
      _$insert(_el$25, _$createComponent(VariantD, {
        get active() {
          return active();
        },
        text: TEXT_LONG
      }), null);
      _$effect(_p$ => {
        var _v$9 = btn(active()),
          _v$0 = card,
          _v$1 = heading,
          _v$10 = card,
          _v$11 = heading,
          _v$12 = card,
          _v$13 = heading,
          _v$14 = card,
          _v$15 = heading,
          _v$16 = card,
          _v$17 = heading;
        _p$.e = _$style(_el$1, _v$9, _p$.e);
        _p$.t = _$style(_el$10, _v$0, _p$.t);
        _p$.a = _$style(_el$11, _v$1, _p$.a);
        _p$.o = _$style(_el$14, _v$10, _p$.o);
        _p$.i = _$style(_el$15, _v$11, _p$.i);
        _p$.n = _$style(_el$18, _v$12, _p$.n);
        _p$.s = _$style(_el$19, _v$13, _p$.s);
        _p$.h = _$style(_el$22, _v$14, _p$.h);
        _p$.r = _$style(_el$23, _v$15, _p$.r);
        _p$.d = _$style(_el$25, _v$16, _p$.d);
        _p$.l = _$style(_el$26, _v$17, _p$.l);
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
      return _el$0;
    })();
  }
};
_$delegateEvents(["click"]);