import { template as _$template } from "../../../lib/reactivity.js";
import { delegateEvents as _$delegateEvents } from "../../../lib/reactivity.js";
import { style as _$style } from "../../../lib/reactivity.js";
import { setAttribute as _$setAttribute } from "../../../lib/reactivity.js";
import { effect as _$effect } from "../../../lib/reactivity.js";
import { insert as _$insert } from "../../../lib/reactivity.js";
import { createComponent as _$createComponent } from "../../../lib/reactivity.js";
import { memo as _$memo } from "../../../lib/reactivity.js";
var _tmpl$ = /*#__PURE__*/_$template(`<div style=display:grid;gap:24px;padding:20px;max-width:520px><span style="display:flex;align-items:center;gap:8px;font-size:14px;font-weight:500;color:var(--text-strong, #eee);min-width:0"><span style=flex-shrink:0></span><span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:400;color:var(--text-base, #ccc)"></span></span><div style=display:flex;gap:8px;flex-wrap:wrap><button></button><button>Reset</button><button></button></div><div style=display:flex;gap:8px;flex-wrap:wrap><button>+ read</button><button>+ search</button><button>+ list</button></div><div style="font-size:11px;color:var(--color-text-weak, #888);font-family:monospace">motion: <!> · active: <!> · reads: <!> · searches: <!> · lists: `),
  _tmpl$2 = /*#__PURE__*/_$template(`<style>[data-reduced-motion="true"] *,\n              [data-reduced-motion="true"] *::before,\n              [data-reduced-motion="true"] *::after \{\n                transition-duration: 0ms !important;\n              }`),
  _tmpl$3 = /*#__PURE__*/_$template(`<span style=display:flex;align-items:center;gap:8px;font-size:14px;font-weight:500>`),
  _tmpl$4 = /*#__PURE__*/_$template(`<span style=display:flex;align-items:center;gap:8px;font-size:14px;font-weight:500><span style="font-weight:400;color:var(--text-base, #ccc)">`);
import { onCleanup } from "../../../lib/reactivity.js";
import { createStore } from "../../../lib/store.js";
import { AnimatedCountList } from "./tool-count-summary.js";
import { ToolStatusTitle } from "./tool-status-title.js";
export default {
  title: "UI/AnimatedCountList",
  id: "components-animated-count-list",
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component: `### Overview
Animated count list that smoothly transitions items in/out as counts change.

Uses \`grid-template-columns: 0fr → 1fr\` for width animations and the odometer
digit roller for count transitions. Shown here with \`ToolStatusTitle\` exactly
as it appears in the context tool group on the session page.`
      }
    }
  }
};
const TEXT = {
  active: "Exploring",
  done: "Explored",
  read: {
    one: "{{count}} read",
    other: "{{count}} reads"
  },
  search: {
    one: "{{count}} search",
    other: "{{count}} searches"
  },
  list: {
    one: "{{count}} list",
    other: "{{count}} lists"
  }
};
function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
const btn = accent => ({
  padding: "6px 14px",
  "border-radius": "6px",
  border: "1px solid var(--color-divider, #333)",
  background: accent ? "var(--color-danger-fill, #c33)" : "var(--color-fill-element, #222)",
  color: "var(--color-text, #eee)",
  cursor: "pointer",
  "font-size": "13px"
});
const smallBtn = active => ({
  padding: "4px 12px",
  "border-radius": "6px",
  border: active ? "1px solid var(--color-accent, #58f)" : "1px solid var(--color-divider, #333)",
  background: active ? "var(--color-accent, #58f)" : "var(--color-fill-element, #222)",
  color: "var(--color-text, #eee)",
  cursor: "pointer",
  "font-size": "12px"
});
export const Playground = {
  render: () => {
    const [state, setState] = createStore({
      reads: 0,
      searches: 0,
      lists: 0,
      active: false,
      reducedMotion: false
    });
    const reads = () => state.reads;
    const searches = () => state.searches;
    const lists = () => state.lists;
    const active = () => state.active;
    const reducedMotion = () => state.reducedMotion;
    let timeouts = [];
    const clearAll = () => {
      for (const t of timeouts) clearTimeout(t);
      timeouts = [];
    };
    onCleanup(clearAll);
    const startSim = () => {
      clearAll();
      setState("reads", 0);
      setState("searches", 0);
      setState("lists", 0);
      setState("active", true);
      const steps = rand(3, 10);
      let elapsed = 0;
      for (let i = 0; i < steps; i++) {
        const delay = rand(300, 800);
        elapsed += delay;
        const t = setTimeout(() => {
          const pick = rand(0, 2);
          if (pick === 0) setState("reads", value => value + 1);else if (pick === 1) setState("searches", value => value + 1);else setState("lists", value => value + 1);
        }, elapsed);
        timeouts.push(t);
      }
      const end = setTimeout(() => setState("active", false), elapsed + 100);
      timeouts.push(end);
    };
    const stopSim = () => {
      clearAll();
      setState("active", false);
    };
    const reset = () => {
      stopSim();
      setState("reads", 0);
      setState("searches", 0);
      setState("lists", 0);
    };
    const items = () => [{
      key: "read",
      count: reads(),
      one: TEXT.read.one,
      other: TEXT.read.other
    }, {
      key: "search",
      count: searches(),
      one: TEXT.search.one,
      other: TEXT.search.other
    }, {
      key: "list",
      count: lists(),
      one: TEXT.list.one,
      other: TEXT.list.other
    }];
    return (() => {
      var _el$ = _tmpl$(),
        _el$2 = _el$.firstChild,
        _el$3 = _el$2.firstChild,
        _el$4 = _el$3.nextSibling,
        _el$5 = _el$2.nextSibling,
        _el$6 = _el$5.firstChild,
        _el$7 = _el$6.nextSibling,
        _el$8 = _el$7.nextSibling,
        _el$9 = _el$5.nextSibling,
        _el$0 = _el$9.firstChild,
        _el$1 = _el$0.nextSibling,
        _el$10 = _el$1.nextSibling,
        _el$11 = _el$9.nextSibling,
        _el$12 = _el$11.firstChild,
        _el$17 = _el$12.nextSibling,
        _el$13 = _el$17.nextSibling,
        _el$18 = _el$13.nextSibling,
        _el$14 = _el$18.nextSibling,
        _el$19 = _el$14.nextSibling,
        _el$15 = _el$19.nextSibling,
        _el$20 = _el$15.nextSibling,
        _el$16 = _el$20.nextSibling;
      _$insert(_el$, (() => {
        var _c$ = _$memo(() => !!reducedMotion());
        return () => _c$() && _tmpl$2();
      })(), _el$2);
      _$insert(_el$3, _$createComponent(ToolStatusTitle, {
        get active() {
          return active();
        },
        get activeText() {
          return TEXT.active;
        },
        get doneText() {
          return TEXT.done;
        },
        split: false
      }));
      _$insert(_el$4, _$createComponent(AnimatedCountList, {
        get items() {
          return items();
        },
        fallback: ""
      }));
      _el$6.$$click = () => active() ? stopSim() : startSim();
      _$insert(_el$6, () => active() ? "Stop" : "Simulate");
      _el$7.$$click = reset;
      _el$8.$$click = () => setState("reducedMotion", value => !value);
      _$insert(_el$8, () => reducedMotion() ? "Motion: reduced" : "Motion: normal");
      _el$0.$$click = () => setState("reads", value => value + 1);
      _el$1.$$click = () => setState("searches", value => value + 1);
      _el$10.$$click = () => setState("lists", value => value + 1);
      _$insert(_el$11, () => reducedMotion() ? "reduced" : "normal", _el$17);
      _$insert(_el$11, () => active() ? "true" : "false", _el$18);
      _$insert(_el$11, reads, _el$19);
      _$insert(_el$11, searches, _el$20);
      _$insert(_el$11, lists, null);
      _$effect(_p$ => {
        var _v$ = reducedMotion(),
          _v$2 = btn(active()),
          _v$3 = btn(),
          _v$4 = smallBtn(reducedMotion()),
          _v$5 = smallBtn(),
          _v$6 = smallBtn(),
          _v$7 = smallBtn();
        _v$ !== _p$.e && _$setAttribute(_el$2, "data-reduced-motion", _p$.e = _v$);
        _p$.t = _$style(_el$6, _v$2, _p$.t);
        _p$.a = _$style(_el$7, _v$3, _p$.a);
        _p$.o = _$style(_el$8, _v$4, _p$.o);
        _p$.i = _$style(_el$0, _v$5, _p$.i);
        _p$.n = _$style(_el$1, _v$6, _p$.n);
        _p$.s = _$style(_el$10, _v$7, _p$.s);
        return _p$;
      }, {
        e: undefined,
        t: undefined,
        a: undefined,
        o: undefined,
        i: undefined,
        n: undefined,
        s: undefined
      });
      return _el$;
    })();
  }
};
export const Empty = {
  render: () => (() => {
    var _el$22 = _tmpl$3();
    _$insert(_el$22, _$createComponent(ToolStatusTitle, {
      active: true,
      activeText: "Exploring",
      doneText: "Explored",
      split: false
    }), null);
    _$insert(_el$22, _$createComponent(AnimatedCountList, {
      items: [{
        key: "read",
        count: 0,
        one: "{{count}} read",
        other: "{{count}} reads"
      }, {
        key: "search",
        count: 0,
        one: "{{count}} search",
        other: "{{count}} searches"
      }],
      fallback: ""
    }), null);
    return _el$22;
  })()
};
export const Done = {
  render: () => (() => {
    var _el$23 = _tmpl$4(),
      _el$24 = _el$23.firstChild;
    _$insert(_el$23, _$createComponent(ToolStatusTitle, {
      active: false,
      activeText: "Exploring",
      doneText: "Explored",
      split: false
    }), _el$24);
    _$insert(_el$24, _$createComponent(AnimatedCountList, {
      items: [{
        key: "read",
        count: 5,
        one: "{{count}} read",
        other: "{{count}} reads"
      }, {
        key: "search",
        count: 3,
        one: "{{count}} search",
        other: "{{count}} searches"
      }, {
        key: "list",
        count: 1,
        one: "{{count}} list",
        other: "{{count}} lists"
      }],
      fallback: ""
    }));
    return _el$23;
  })()
};
_$delegateEvents(["click"]);