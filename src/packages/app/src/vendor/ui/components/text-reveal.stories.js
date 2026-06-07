import { template as _$template } from "solid-js/web";
import { delegateEvents as _$delegateEvents } from "solid-js/web";
import { style as _$style } from "solid-js/web";
import { effect as _$effect } from "solid-js/web";
import { memo as _$memo } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<div style=display:grid;gap:24px;padding:20px;max-width:700px><div style=display:grid;gap:16px><div><span>text-reveal (mask wipe + slide)</span><div><span>Thinking</span><span></span></div></div><div><span>text-reveal (mask wipe only)</span><div><span>Thinking</span><span></span></div></div></div><div style=display:flex;gap:6px;flex-wrap:wrap></div><div style=display:flex;gap:8px;flex-wrap:wrap><button>Prev</button><button>Next</button><button></button><button></button></div><div style=display:grid;gap:8px;max-width:480px><div style="font-size:11px;color:var(--color-text-weak, #666)">Hybrid (wipe + slide)</div><label style=display:flex;align-items:center;gap:12px><span>edge</span><input type=range min=1 max=40 step=1 style=flex:1><span style=width:60px;text-align:right;font-size:12px>%</span></label><label style=display:flex;align-items:center;gap:12px><span>travel</span><input type=range min=0 max=40 step=1 style=flex:1><span style=width:60px;text-align:right;font-size:12px>px</span></label><div style="font-size:11px;color:var(--color-text-weak, #666);margin-top:8px">Shared</div><label style=display:flex;align-items:center;gap:12px><span>duration</span><input type=range min=100 max=1400 step=10 style=flex:1><span style=width:60px;text-align:right;font-size:12px>ms</span></label><label style=display:flex;align-items:center;gap:12px><span>bounce</span><input type=range min=1 max=2 step=0.01 style=flex:1><span style=width:60px;text-align:right;font-size:12px></span></label><label style=display:flex;align-items:center;gap:12px><span>bounce soft</span><input type=range min=1 max=1.5 step=0.01 style=flex:1><span style=width:60px;text-align:right;font-size:12px></span></label><div style="font-size:11px;color:var(--color-text-weak, #666);margin-top:8px">Wipe only</div><label style=display:flex;align-items:center;gap:12px><span>edge</span><input type=range min=1 max=40 step=1 style=flex:1><span style=width:60px;text-align:right;font-size:12px>%</span></label><label style=display:flex;align-items:center;gap:12px><span>travel</span><input type=range min=0 max=16 step=1 style=flex:1><span style=width:60px;text-align:right;font-size:12px>px</span></label></div><div style="font-size:11px;color:var(--color-text-weak, #888);font-family:monospace">text: <!> · growOnly: `),
  _tmpl$2 = /*#__PURE__*/_$template(`<button>`);
import { onCleanup } from "solid-js";
import { createStore } from "solid-js/store";
import { TextReveal } from "./text-reveal.js";
export default {
  title: "UI/TextReveal",
  id: "components-text-reveal",
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component: `### Overview
Playground for the TextReveal text transition component.

**Hybrid** — mask wipe + vertical slide: gradient sweeps AND text moves downward.

**Wipe only** — pure mask wipe: gradient sweeps top-to-bottom, text stays in place.`
      }
    }
  }
};
const TEXTS = ["Refactor ToolStatusTitle DOM measurement", "Remove inline measure nodes", "Run typechecks and report changes", "Verify reduced-motion behavior", "Review diff for animation edge cases", "Check keyboard semantics", undefined, "Planning key generation details", "Analyzing error handling", "Considering edge cases"];
const btn = accent => ({
  padding: "5px 12px",
  "border-radius": "6px",
  border: accent ? "1px solid var(--color-accent, #58f)" : "1px solid var(--color-divider, #333)",
  background: accent ? "var(--color-accent, #58f)" : "var(--color-fill-element, #222)",
  color: "var(--color-text, #eee)",
  cursor: "pointer",
  "font-size": "12px"
});
const sliderLabel = {
  width: "90px",
  "font-size": "12px",
  color: "var(--color-text-secondary, #a3a3a3)",
  "flex-shrink": "0"
};
const cardStyle = {
  padding: "20px 24px",
  "border-radius": "10px",
  border: "1px solid var(--color-divider, #333)",
  background: "var(--color-fill-element, #1a1a1a)",
  display: "grid",
  gap: "12px"
};
const cardLabel = {
  "font-size": "11px",
  "font-family": "monospace",
  color: "var(--color-text-weak, #666)"
};
const previewRow = {
  display: "flex",
  "align-items": "center",
  gap: "8px",
  "font-size": "14px",
  "font-weight": "500",
  "line-height": "20px",
  color: "var(--text-weak, #aaa)",
  "min-height": "20px",
  overflow: "visible"
};
const headingSlot = {
  "min-width": "0",
  overflow: "visible",
  color: "var(--text-weaker, #888)",
  "font-weight": "400"
};
export const Playground = {
  render: () => {
    const [state, setState] = createStore({
      index: 0,
      cycling: false,
      growOnly: true,
      duration: 600,
      bounce: 1.0,
      bounceSoft: 1.0,
      hybridTravel: 25,
      hybridEdge: 17,
      edge: 17,
      revealTravel: 0
    });
    const index = () => state.index;
    const cycling = () => state.cycling;
    const growOnly = () => state.growOnly;
    const duration = () => state.duration;
    const bounce = () => state.bounce;
    const bounceSoft = () => state.bounceSoft;
    const hybridTravel = () => state.hybridTravel;
    const hybridEdge = () => state.hybridEdge;
    const edge = () => state.edge;
    const revealTravel = () => state.revealTravel;
    let timer;
    const text = () => TEXTS[index()];
    const next = () => setState("index", value => (value + 1) % TEXTS.length);
    const prev = () => setState("index", value => (value - 1 + TEXTS.length) % TEXTS.length);
    const toggleCycle = () => {
      if (cycling()) {
        if (timer) clearTimeout(timer);
        timer = undefined;
        setState("cycling", false);
        return;
      }
      setState("cycling", true);
      const tick = () => {
        next();
        timer = window.setTimeout(tick, 700 + Math.floor(Math.random() * 600));
      };
      timer = window.setTimeout(tick, 700 + Math.floor(Math.random() * 600));
    };
    onCleanup(() => {
      if (timer) clearTimeout(timer);
    });
    const spring = () => `cubic-bezier(0.34, ${bounce()}, 0.64, 1)`;
    const springSoft = () => `cubic-bezier(0.34, ${bounceSoft()}, 0.64, 1)`;
    return (() => {
      var _el$ = _tmpl$(),
        _el$2 = _el$.firstChild,
        _el$3 = _el$2.firstChild,
        _el$4 = _el$3.firstChild,
        _el$5 = _el$4.nextSibling,
        _el$6 = _el$5.firstChild,
        _el$7 = _el$6.nextSibling,
        _el$8 = _el$3.nextSibling,
        _el$9 = _el$8.firstChild,
        _el$0 = _el$9.nextSibling,
        _el$1 = _el$0.firstChild,
        _el$10 = _el$1.nextSibling,
        _el$11 = _el$2.nextSibling,
        _el$12 = _el$11.nextSibling,
        _el$13 = _el$12.firstChild,
        _el$14 = _el$13.nextSibling,
        _el$15 = _el$14.nextSibling,
        _el$16 = _el$15.nextSibling,
        _el$17 = _el$12.nextSibling,
        _el$18 = _el$17.firstChild,
        _el$19 = _el$18.nextSibling,
        _el$20 = _el$19.firstChild,
        _el$21 = _el$20.nextSibling,
        _el$22 = _el$21.nextSibling,
        _el$23 = _el$22.firstChild,
        _el$24 = _el$19.nextSibling,
        _el$25 = _el$24.firstChild,
        _el$26 = _el$25.nextSibling,
        _el$27 = _el$26.nextSibling,
        _el$28 = _el$27.firstChild,
        _el$29 = _el$24.nextSibling,
        _el$30 = _el$29.nextSibling,
        _el$31 = _el$30.firstChild,
        _el$32 = _el$31.nextSibling,
        _el$33 = _el$32.nextSibling,
        _el$34 = _el$33.firstChild,
        _el$35 = _el$30.nextSibling,
        _el$36 = _el$35.firstChild,
        _el$37 = _el$36.nextSibling,
        _el$38 = _el$37.nextSibling,
        _el$39 = _el$35.nextSibling,
        _el$40 = _el$39.firstChild,
        _el$41 = _el$40.nextSibling,
        _el$42 = _el$41.nextSibling,
        _el$43 = _el$39.nextSibling,
        _el$44 = _el$43.nextSibling,
        _el$45 = _el$44.firstChild,
        _el$46 = _el$45.nextSibling,
        _el$47 = _el$46.nextSibling,
        _el$48 = _el$47.firstChild,
        _el$49 = _el$44.nextSibling,
        _el$50 = _el$49.firstChild,
        _el$51 = _el$50.nextSibling,
        _el$52 = _el$51.nextSibling,
        _el$53 = _el$52.firstChild,
        _el$54 = _el$17.nextSibling,
        _el$55 = _el$54.firstChild,
        _el$57 = _el$55.nextSibling,
        _el$56 = _el$57.nextSibling;
      _$insert(_el$7, _$createComponent(TextReveal, {
        "class": "fw-normal",
        get text() {
          return text();
        },
        get duration() {
          return duration();
        },
        get edge() {
          return hybridEdge();
        },
        get travel() {
          return hybridTravel();
        },
        get spring() {
          return spring();
        },
        get springSoft() {
          return springSoft();
        },
        get growOnly() {
          return growOnly();
        }
      }));
      _$insert(_el$10, _$createComponent(TextReveal, {
        "class": "fw-normal",
        get text() {
          return text();
        },
        get duration() {
          return duration();
        },
        get edge() {
          return edge();
        },
        get travel() {
          return revealTravel();
        },
        get spring() {
          return spring();
        },
        get springSoft() {
          return springSoft();
        },
        get growOnly() {
          return growOnly();
        }
      }));
      _$insert(_el$11, () => TEXTS.map((t, i) => (() => {
        var _el$58 = _tmpl$2();
        _el$58.$$click = () => setState("index", i);
        _$insert(_el$58, t ?? "(none)");
        _$effect(_$p => _$style(_el$58, btn(index() === i), _$p));
        return _el$58;
      })()));
      _el$13.$$click = prev;
      _el$14.$$click = next;
      _el$15.$$click = toggleCycle;
      _$insert(_el$15, () => cycling() ? "Stop cycle" : "Auto cycle");
      _el$16.$$click = () => setState("growOnly", value => !value);
      _$insert(_el$16, () => growOnly() ? "growOnly: on" : "growOnly: off");
      _el$21.$$input = e => setState("hybridEdge", e.currentTarget.valueAsNumber);
      _$insert(_el$22, hybridEdge, _el$23);
      _el$26.$$input = e => setState("hybridTravel", e.currentTarget.valueAsNumber);
      _$insert(_el$27, hybridTravel, _el$28);
      _el$32.$$input = e => setState("duration", e.currentTarget.valueAsNumber);
      _$insert(_el$33, duration, _el$34);
      _el$37.$$input = e => setState("bounce", e.currentTarget.valueAsNumber);
      _$insert(_el$38, () => bounce().toFixed(2));
      _el$41.$$input = e => setState("bounceSoft", e.currentTarget.valueAsNumber);
      _$insert(_el$42, () => bounceSoft().toFixed(2));
      _el$46.$$input = e => setState("edge", e.currentTarget.valueAsNumber);
      _$insert(_el$47, edge, _el$48);
      _el$51.$$input = e => setState("revealTravel", e.currentTarget.valueAsNumber);
      _$insert(_el$52, revealTravel, _el$53);
      _$insert(_el$54, () => text() ?? "(none)", _el$57);
      _$insert(_el$54, () => growOnly() ? "on" : "off", null);
      _$effect(_p$ => {
        var _v$ = cardStyle,
          _v$2 = cardLabel,
          _v$3 = previewRow,
          _v$4 = headingSlot,
          _v$5 = cardStyle,
          _v$6 = cardLabel,
          _v$7 = previewRow,
          _v$8 = headingSlot,
          _v$9 = btn(),
          _v$0 = btn(),
          _v$1 = btn(cycling()),
          _v$10 = btn(growOnly()),
          _v$11 = sliderLabel,
          _v$12 = sliderLabel,
          _v$13 = sliderLabel,
          _v$14 = sliderLabel,
          _v$15 = sliderLabel,
          _v$16 = sliderLabel,
          _v$17 = sliderLabel;
        _p$.e = _$style(_el$3, _v$, _p$.e);
        _p$.t = _$style(_el$4, _v$2, _p$.t);
        _p$.a = _$style(_el$5, _v$3, _p$.a);
        _p$.o = _$style(_el$7, _v$4, _p$.o);
        _p$.i = _$style(_el$8, _v$5, _p$.i);
        _p$.n = _$style(_el$9, _v$6, _p$.n);
        _p$.s = _$style(_el$0, _v$7, _p$.s);
        _p$.h = _$style(_el$10, _v$8, _p$.h);
        _p$.r = _$style(_el$13, _v$9, _p$.r);
        _p$.d = _$style(_el$14, _v$0, _p$.d);
        _p$.l = _$style(_el$15, _v$1, _p$.l);
        _p$.u = _$style(_el$16, _v$10, _p$.u);
        _p$.c = _$style(_el$20, _v$11, _p$.c);
        _p$.w = _$style(_el$25, _v$12, _p$.w);
        _p$.m = _$style(_el$31, _v$13, _p$.m);
        _p$.f = _$style(_el$36, _v$14, _p$.f);
        _p$.y = _$style(_el$40, _v$15, _p$.y);
        _p$.g = _$style(_el$45, _v$16, _p$.g);
        _p$.p = _$style(_el$50, _v$17, _p$.p);
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
        y: undefined,
        g: undefined,
        p: undefined
      });
      _$effect(() => _el$21.value = hybridEdge());
      _$effect(() => _el$26.value = hybridTravel());
      _$effect(() => _el$32.value = duration());
      _$effect(() => _el$37.value = bounce());
      _$effect(() => _el$41.value = bounceSoft());
      _$effect(() => _el$46.value = edge());
      _$effect(() => _el$51.value = revealTravel());
      return _el$;
    })();
  }
};
_$delegateEvents(["click", "input"]);