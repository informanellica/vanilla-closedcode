import { template as _$template } from "solid-js/web";
import { delegateEvents as _$delegateEvents } from "solid-js/web";
import { style as _$style } from "solid-js/web";
import { setStyleProperty as _$setStyleProperty } from "solid-js/web";
import { effect as _$effect } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { memo as _$memo } from "solid-js/web";
import { use as _$use } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<span data-component=shell-submessage><span data-slot=shell-submessage-width style=width:0px><span data-slot=basic-tool-tool-subtitle><span data-slot=shell-submessage-value>`),
  _tmpl$2 = /*#__PURE__*/_$template(`<div style="border-radius:8px;border:1px solid var(--color-divider, #333);background:var(--color-fill-secondary, #161616);padding:14px 16px;font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;font-size:18px;color:var(--color-text, #eee);white-space:pre-wrap">$ cat &lt;&lt;'TOPIC1'`),
  _tmpl$3 = /*#__PURE__*/_$template(`<div data-component=shell-submessage-scene style=display:grid;gap:20px;padding:20px;max-width:860px><style>\n[data-component="shell-submessage-scene"] [data-component="tool-trigger"] [data-slot="basic-tool-tool-info-main"] \{\n  align-items: baseline;\n}\n\n[data-component="shell-submessage"] \{\n  min-width: 0;\n  max-width: 100%;\n  display: inline-flex;\n  align-items: baseline;\n  vertical-align: baseline;\n}\n\n[data-component="shell-submessage"] [data-slot="shell-submessage-width"] \{\n  min-width: 0;\n  max-width: 100%;\n  display: inline-flex;\n  align-items: baseline;\n  overflow: hidden;\n}\n\n[data-component="shell-submessage"] [data-slot="shell-submessage-value"] \{\n  display: inline-block;\n  vertical-align: baseline;\n  min-width: 0;\n  line-height: inherit;\n  white-space: nowrap;\n  opacity: 0;\n  filter: blur(var(--shell-sub-blur, 2px));\n  transition-property: opacity, filter;\n  transition-duration: var(--shell-sub-fade-ms, 320ms);\n  transition-timing-function: var(--shell-sub-fade-ease, cubic-bezier(0.22, 1, 0.36, 1));\n}\n\n[data-component="shell-submessage"][data-visible] [data-slot="shell-submessage-value"] \{\n  opacity: 1;\n  filter: blur(0px);\n}\n</style><div style=display:flex;gap:8px;flex-wrap:wrap><button>Replay entry</button><button></button><button></button></div><div style="display:grid;gap:10px;border-top:1px solid var(--color-divider, #333);padding-top:14px"><div style=display:flex;align-items:center;gap:12px><span>subtitle</span><input style="width:420px;max-width:100%;padding:6px 8px;border-radius:6px;border:1px solid var(--color-divider, #333);background:var(--color-fill-element, #222);color:var(--color-text, #eee)"></div><div style=display:flex;align-items:center;gap:12px><span>visualDuration</span><input type=range min=0.05 max=1.5 step=0.01><span>s</span></div><div style=display:flex;align-items:center;gap:12px><span>bounce</span><input type=range min=0 max=0.5 step=0.01><span></span></div><div style=display:flex;align-items:center;gap:12px><span>fade ease</span><button></button></div><div style=display:flex;align-items:center;gap:12px><span>fade</span><input type=range min=0 max=1400 step=10><span>ms</span></div><div style=display:flex;align-items:center;gap:12px><span>blur</span><input type=range min=0 max=14 step=0.5><span>px`),
  _tmpl$4 = /*#__PURE__*/_$template(`<div data-slot=basic-tool-tool-info-structured><div data-slot=basic-tool-tool-info-main><span data-slot=basic-tool-tool-title>Shell`);
import { createEffect, onCleanup } from "solid-js";
import { createStore } from "solid-js/store";
import { BasicTool } from "./basic-tool.js";
import { animate } from "motion";
export default {
  title: "UI/Shell Submessage Motion",
  id: "components-shell-submessage-motion",
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component: `### Overview
Interactive playground for animating the Shell tool subtitle ("submessage") in the timeline trigger row.

### Production component path
- Trigger layout: \`packages/ui/src/components/basic-tool.js\`
- Bash tool subtitle source: \`packages/ui/src/components/message-part.js\` (tool: \`bash\`, \`trigger.subtitle\`)

### What this playground tunes
- Width reveal (spring-driven pixel width via \`useSpring\`)
- Opacity fade
- Blur settle`
      }
    }
  }
};
const btn = accent => ({
  padding: "6px 14px",
  "border-radius": "6px",
  border: "1px solid var(--color-divider, #333)",
  background: accent ? "var(--color-accent, #58f)" : "var(--color-fill-element, #222)",
  color: "var(--color-text, #eee)",
  cursor: "pointer",
  "font-size": "13px"
});
const sliderLabel = {
  "font-size": "11px",
  "font-family": "monospace",
  color: "var(--color-text-weak, #666)",
  "min-width": "84px",
  "flex-shrink": "0",
  "text-align": "right"
};
const sliderValue = {
  "font-family": "monospace",
  "font-size": "11px",
  color: "var(--color-text-weak, #aaa)",
  "min-width": "76px"
};
const shellCss = `
[data-component="shell-submessage-scene"] [data-component="tool-trigger"] [data-slot="basic-tool-tool-info-main"] {
  align-items: baseline;
}

[data-component="shell-submessage"] {
  min-width: 0;
  max-width: 100%;
  display: inline-flex;
  align-items: baseline;
  vertical-align: baseline;
}

[data-component="shell-submessage"] [data-slot="shell-submessage-width"] {
  min-width: 0;
  max-width: 100%;
  display: inline-flex;
  align-items: baseline;
  overflow: hidden;
}

[data-component="shell-submessage"] [data-slot="shell-submessage-value"] {
  display: inline-block;
  vertical-align: baseline;
  min-width: 0;
  line-height: inherit;
  white-space: nowrap;
  opacity: 0;
  filter: blur(var(--shell-sub-blur, 2px));
  transition-property: opacity, filter;
  transition-duration: var(--shell-sub-fade-ms, 320ms);
  transition-timing-function: var(--shell-sub-fade-ease, cubic-bezier(0.22, 1, 0.36, 1));
}

[data-component="shell-submessage"][data-visible] [data-slot="shell-submessage-value"] {
  opacity: 1;
  filter: blur(0px);
}
`;
const ease = {
  smooth: "cubic-bezier(0.16, 1, 0.3, 1)",
  snappy: "cubic-bezier(0.22, 1, 0.36, 1)",
  standard: "cubic-bezier(0.2, 0.8, 0.2, 1)",
  linear: "linear"
};
function SpringSubmessage(props) {
  let ref;
  let widthRef;
  createEffect(() => {
    if (!widthRef) return;
    if (props.visible) {
      requestAnimationFrame(() => {
        ref?.setAttribute("data-visible", "");
        animate(widthRef, {
          width: "auto"
        }, {
          type: "spring",
          visualDuration: props.visualDuration,
          bounce: props.bounce
        });
      });
    } else {
      ref?.removeAttribute("data-visible");
      animate(widthRef, {
        width: "0px"
      }, {
        type: "spring",
        visualDuration: props.visualDuration,
        bounce: props.bounce
      });
    }
  });
  return (() => {
    var _el$ = _tmpl$(),
      _el$2 = _el$.firstChild,
      _el$3 = _el$2.firstChild,
      _el$4 = _el$3.firstChild;
    var _ref$ = ref;
    typeof _ref$ === "function" ? _$use(_ref$, _el$) : ref = _el$;
    var _ref$2 = widthRef;
    typeof _ref$2 === "function" ? _$use(_ref$2, _el$2) : widthRef = _el$2;
    _$insert(_el$4, () => props.text || "\u00A0");
    return _el$;
  })();
}
export const Playground = {
  render: () => {
    const [state, setState] = createStore({
      text: "Prints five topic blocks between timed commands",
      show: true,
      visualDuration: 0.35,
      bounce: 0,
      fadeMs: 320,
      blur: 2,
      fadeEase: "snappy",
      auto: false
    });
    const text = () => state.text;
    const show = () => state.show;
    const visualDuration = () => state.visualDuration;
    const bounce = () => state.bounce;
    const fadeMs = () => state.fadeMs;
    const blur = () => state.blur;
    const fadeEase = () => state.fadeEase;
    const auto = () => state.auto;
    let replayTimer;
    let autoTimer;
    const replay = () => {
      setState("show", false);
      if (replayTimer) clearTimeout(replayTimer);
      replayTimer = setTimeout(() => {
        setState("show", true);
      }, 50);
    };
    const stopAuto = () => {
      if (autoTimer) clearInterval(autoTimer);
      autoTimer = undefined;
      setState("auto", false);
    };
    const toggleAuto = () => {
      if (auto()) {
        stopAuto();
        return;
      }
      setState("auto", true);
      autoTimer = setInterval(replay, 2200);
    };
    onCleanup(() => {
      if (replayTimer) clearTimeout(replayTimer);
      if (autoTimer) clearInterval(autoTimer);
    });
    return (() => {
      var _el$5 = _tmpl$3(),
        _el$6 = _el$5.firstChild,
        _el$8 = _el$6.nextSibling,
        _el$9 = _el$8.firstChild,
        _el$0 = _el$9.nextSibling,
        _el$1 = _el$0.nextSibling,
        _el$10 = _el$8.nextSibling,
        _el$11 = _el$10.firstChild,
        _el$12 = _el$11.firstChild,
        _el$13 = _el$12.nextSibling,
        _el$14 = _el$11.nextSibling,
        _el$15 = _el$14.firstChild,
        _el$16 = _el$15.nextSibling,
        _el$17 = _el$16.nextSibling,
        _el$18 = _el$17.firstChild,
        _el$19 = _el$14.nextSibling,
        _el$20 = _el$19.firstChild,
        _el$21 = _el$20.nextSibling,
        _el$22 = _el$21.nextSibling,
        _el$23 = _el$19.nextSibling,
        _el$24 = _el$23.firstChild,
        _el$25 = _el$24.nextSibling,
        _el$26 = _el$23.nextSibling,
        _el$27 = _el$26.firstChild,
        _el$28 = _el$27.nextSibling,
        _el$29 = _el$28.nextSibling,
        _el$30 = _el$29.firstChild,
        _el$31 = _el$26.nextSibling,
        _el$32 = _el$31.firstChild,
        _el$33 = _el$32.nextSibling,
        _el$34 = _el$33.nextSibling,
        _el$35 = _el$34.firstChild;
      _$insert(_el$5, _$createComponent(BasicTool, {
        icon: "console",
        defaultOpen: true,
        get trigger() {
          return (() => {
            var _el$36 = _tmpl$4(),
              _el$37 = _el$36.firstChild,
              _el$38 = _el$37.firstChild;
            _$insert(_el$37, _$createComponent(SpringSubmessage, {
              get text() {
                return text();
              },
              get visible() {
                return show();
              },
              get visualDuration() {
                return visualDuration();
              },
              get bounce() {
                return bounce();
              }
            }), null);
            return _el$36;
          })();
        },
        get children() {
          return _tmpl$2();
        }
      }), _el$8);
      _el$9.$$click = replay;
      _el$0.$$click = () => setState("show", value => !value);
      _$insert(_el$0, () => show() ? "Hide subtitle" : "Show subtitle");
      _el$1.$$click = toggleAuto;
      _$insert(_el$1, () => auto() ? "Stop auto replay" : "Auto replay");
      _el$13.$$input = e => setState("text", e.currentTarget.value);
      _el$16.$$input = e => setState("visualDuration", Number(e.currentTarget.value));
      _$insert(_el$17, () => visualDuration().toFixed(2), _el$18);
      _el$21.$$input = e => setState("bounce", Number(e.currentTarget.value));
      _$insert(_el$22, () => bounce().toFixed(2));
      _el$25.$$click = () => setState("fadeEase", value => value === "snappy" ? "smooth" : value === "smooth" ? "standard" : value === "standard" ? "linear" : "snappy");
      _$insert(_el$25, fadeEase);
      _el$28.$$input = e => setState("fadeMs", Number(e.currentTarget.value));
      _$insert(_el$29, fadeMs, _el$30);
      _el$33.$$input = e => setState("blur", Number(e.currentTarget.value));
      _$insert(_el$34, blur, _el$35);
      _$effect(_p$ => {
        var _v$ = `${fadeMs()}ms`,
          _v$2 = `${blur()}px`,
          _v$3 = ease[fadeEase()],
          _v$4 = btn(),
          _v$5 = btn(show()),
          _v$6 = btn(auto()),
          _v$7 = sliderLabel,
          _v$8 = sliderLabel,
          _v$9 = sliderValue,
          _v$0 = sliderLabel,
          _v$1 = sliderValue,
          _v$10 = sliderLabel,
          _v$11 = btn(),
          _v$12 = sliderLabel,
          _v$13 = sliderValue,
          _v$14 = sliderLabel,
          _v$15 = sliderValue;
        _v$ !== _p$.e && _$setStyleProperty(_el$5, "--shell-sub-fade-ms", _p$.e = _v$);
        _v$2 !== _p$.t && _$setStyleProperty(_el$5, "--shell-sub-blur", _p$.t = _v$2);
        _v$3 !== _p$.a && _$setStyleProperty(_el$5, "--shell-sub-fade-ease", _p$.a = _v$3);
        _p$.o = _$style(_el$9, _v$4, _p$.o);
        _p$.i = _$style(_el$0, _v$5, _p$.i);
        _p$.n = _$style(_el$1, _v$6, _p$.n);
        _p$.s = _$style(_el$12, _v$7, _p$.s);
        _p$.h = _$style(_el$15, _v$8, _p$.h);
        _p$.r = _$style(_el$17, _v$9, _p$.r);
        _p$.d = _$style(_el$20, _v$0, _p$.d);
        _p$.l = _$style(_el$22, _v$1, _p$.l);
        _p$.u = _$style(_el$24, _v$10, _p$.u);
        _p$.c = _$style(_el$25, _v$11, _p$.c);
        _p$.w = _$style(_el$27, _v$12, _p$.w);
        _p$.m = _$style(_el$29, _v$13, _p$.m);
        _p$.f = _$style(_el$32, _v$14, _p$.f);
        _p$.y = _$style(_el$34, _v$15, _p$.y);
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
        l: undefined,
        u: undefined,
        c: undefined,
        w: undefined,
        m: undefined,
        f: undefined,
        y: undefined
      });
      _$effect(() => _el$13.value = text());
      _$effect(() => _el$16.value = visualDuration());
      _$effect(() => _el$21.value = bounce());
      _$effect(() => _el$28.value = fadeMs());
      _$effect(() => _el$33.value = blur());
      return _el$5;
    })();
  }
};
_$delegateEvents(["click", "input"]);