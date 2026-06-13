import { template as _$template } from "../../../lib/reactivity.js";
import { delegateEvents as _$delegateEvents } from "../../../lib/reactivity.js";
import { style as _$style } from "../../../lib/reactivity.js";
import { effect as _$effect } from "../../../lib/reactivity.js";
import { insert as _$insert } from "../../../lib/reactivity.js";
import { createComponent as _$createComponent } from "../../../lib/reactivity.js";
import { memo as _$memo } from "../../../lib/reactivity.js";
import { use as _$use } from "../../../lib/reactivity.js";
var _tmpl$ = /*#__PURE__*/_$template(`<div data-component=todo-stage><style>\n[data-component="todo-stage"] \{\n  display: grid;\n  gap: 20px;\n  padding: 20px;\n}\n\n[data-component="todo-preview"] \{\n  height: 560px;\n  min-height: 0;\n}\n\n[data-component="todo-session-root"] \{\n  position: relative;\n  width: 100%;\n  height: 100%;\n  overflow: hidden;\n  display: flex;\n  flex-direction: column;\n  background: var(--background-base);\n  border: 1px solid var(--border-weak-base);\n  border-radius: 12px;\n}\n\n[data-component="todo-session-frame"] \{\n  flex: 1 1 auto;\n  min-height: 0;\n  display: flex;\n  flex-direction: column;\n}\n\n[data-component="todo-session-panel"] \{\n  position: relative;\n  flex: 1 1 auto;\n  min-height: 0;\n  height: 100%;\n  display: flex;\n  flex-direction: column;\n  background: var(--background-stronger);\n}\n\n[data-slot="todo-preview-content"] \{\n  flex: 1 1 auto;\n  min-height: 0;\n  overflow: hidden;\n}\n\n[data-slot="todo-preview-scroll"] \{\n  height: 100%;\n  overflow: auto;\n  min-height: 0;\n  padding: 14px 16px;\n  display: flex;\n  flex-direction: column;\n  gap: 10px;\n}\n\n[data-slot="todo-preview-spacer"] \{\n  flex: 1 1 auto;\n  min-height: 0;\n}\n\n[data-slot="todo-preview-msg"] \{\n  border-radius: 8px;\n  border: 1px solid var(--border-weak-base);\n  background: var(--surface-base);\n  color: var(--text-weak);\n  padding: 8px 10px;\n  font-size: 13px;\n  line-height: 1.35;\n}\n\n[data-slot="todo-preview-msg"][data-strong="true"] \{\n  color: var(--text-strong);\n}\n</style><div data-component=todo-preview><div data-component=todo-session-root><div data-component=todo-session-frame><div data-component=todo-session-panel><div data-slot=todo-preview-content><div data-slot=todo-preview-scroll class=scroll-view__viewport><div data-slot=todo-preview-spacer></div><div data-slot=todo-preview-msg data-strong=true>Thinking Checking type safety</div><div data-slot=todo-preview-msg>Shell Prints five topic blocks between timed commands</div></div></div><div></div></div></div></div></div><div style=display:flex;gap:8px;flex-wrap:wrap><button></button><button></button><button>Cycle progress (<!>/3 done)</button></div><div style=display:grid;gap:10px;max-width:560px><div style="font-size:12px;color:var(--color-text-secondary, #a3a3a3)">Dock open</div><label style=display:flex;align-items:center;gap:12px><span style="width:110px;font-size:13px;color:var(--color-text-secondary, #a3a3a3)">duration</span><input type=range min=0.1 max=1 step=0.01 style=flex:1><span style=width:64px;text-align:right;font-size:13px>ms</span></label><label style=display:flex;align-items:center;gap:12px><span style="width:110px;font-size:13px;color:var(--color-text-secondary, #a3a3a3)">bounce</span><input type=range min=0 max=1 step=0.01 style=flex:1><span style=width:64px;text-align:right;font-size:13px></span></label><div style="font-size:12px;color:var(--color-text-secondary, #a3a3a3);margin-top:4px">Dock close</div><label style=display:flex;align-items:center;gap:12px><span style="width:110px;font-size:13px;color:var(--color-text-secondary, #a3a3a3)">duration</span><input type=range min=0.1 max=1 step=0.01 style=flex:1><span style=width:64px;text-align:right;font-size:13px>ms</span></label><label style=display:flex;align-items:center;gap:12px><span style="width:110px;font-size:13px;color:var(--color-text-secondary, #a3a3a3)">bounce</span><input type=range min=0 max=1 step=0.01 style=flex:1><span style=width:64px;text-align:right;font-size:13px></span></label><div style="font-size:12px;color:var(--color-text-secondary, #a3a3a3);margin-top:4px">Drawer expand</div><label style=display:flex;align-items:center;gap:12px><span style="width:110px;font-size:13px;color:var(--color-text-secondary, #a3a3a3)">duration</span><input type=range min=0.1 max=1 step=0.01 style=flex:1><span style=width:64px;text-align:right;font-size:13px>ms</span></label><label style=display:flex;align-items:center;gap:12px><span style="width:110px;font-size:13px;color:var(--color-text-secondary, #a3a3a3)">bounce</span><input type=range min=0 max=1 step=0.01 style=flex:1><span style=width:64px;text-align:right;font-size:13px></span></label><div style="font-size:12px;color:var(--color-text-secondary, #a3a3a3);margin-top:4px">Drawer collapse</div><label style=display:flex;align-items:center;gap:12px><span style="width:110px;font-size:13px;color:var(--color-text-secondary, #a3a3a3)">duration</span><input type=range min=0.1 max=1 step=0.01 style=flex:1><span style=width:64px;text-align:right;font-size:13px>ms</span></label><label style=display:flex;align-items:center;gap:12px><span style="width:110px;font-size:13px;color:var(--color-text-secondary, #a3a3a3)">bounce</span><input type=range min=0 max=1 step=0.01 style=flex:1><span style=width:64px;text-align:right;font-size:13px></span></label><div style="font-size:12px;color:var(--color-text-secondary, #a3a3a3);margin-top:4px">Subtitle odometer</div><label style=display:flex;align-items:center;gap:12px><span style="width:110px;font-size:13px;color:var(--color-text-secondary, #a3a3a3)">duration</span><input type=range min=120 max=1400 step=10 style=flex:1><span style=width:64px;text-align:right;font-size:13px>ms</span></label><label style=display:flex;align-items:center;gap:12px><span style="width:110px;font-size:13px;color:var(--color-text-secondary, #a3a3a3)">auto fit</span><input type=checkbox><span style=width:64px;text-align:right;font-size:13px></span></label><label style=display:flex;align-items:center;gap:12px><span style="width:110px;font-size:13px;color:var(--color-text-secondary, #a3a3a3)">travel</span><input type=range min=0 max=40 step=1 style=flex:1><span style=width:64px;text-align:right;font-size:13px>px</span></label><label style=display:flex;align-items:center;gap:12px><span style="width:110px;font-size:13px;color:var(--color-text-secondary, #a3a3a3)">edge</span><input type=range min=1 max=40 step=1 style=flex:1><span style=width:64px;text-align:right;font-size:13px>%</span></label><div style="font-size:12px;color:var(--color-text-secondary, #a3a3a3);margin-top:4px">Count odometer</div><label style=display:flex;align-items:center;gap:12px><span style="width:110px;font-size:13px;color:var(--color-text-secondary, #a3a3a3)">duration</span><input type=range min=120 max=1400 step=10 style=flex:1><span style=width:64px;text-align:right;font-size:13px>ms</span></label><label style=display:flex;align-items:center;gap:12px><span style="width:110px;font-size:13px;color:var(--color-text-secondary, #a3a3a3)">mask</span><input type=range min=4 max=40 step=1 style=flex:1><span style=width:64px;text-align:right;font-size:13px>%</span></label><label style=display:flex;align-items:center;gap:12px><span style="width:110px;font-size:13px;color:var(--color-text-secondary, #a3a3a3)">mask height</span><input type=range min=0 max=14 step=1 style=flex:1><span style=width:64px;text-align:right;font-size:13px>px</span></label><label style=display:flex;align-items:center;gap:12px><span style="width:110px;font-size:13px;color:var(--color-text-secondary, #a3a3a3)">width spring</span><input type=range min=0 max=1200 step=10 style=flex:1><span style=width:64px;text-align:right;font-size:13px>ms`),
  _tmpl$2 = /*#__PURE__*/_$template(`<button> done`);
import { createEffect, createMemo, onCleanup } from "../../../lib/reactivity.js";
import { createStore } from "../../../lib/store.js";
import { useGlobalSync } from "@/context/global-sync";
import { SessionComposerRegion, createSessionComposerState } from "@/pages/session/composer";
export default {
  title: "UI/Todo Panel Motion",
  id: "components-todo-panel-motion",
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component: `### Overview
This playground renders the real session composer region from app code.

### Source path
- \`packages/app/src/pages/session/composer/session-composer-region.js\`

### Includes
- \`SessionTodoDock\` (real)
- \`PromptInput\` (real)

No visual reimplementation layer is used for the dock/input stack.`
      }
    }
  }
};
const pool = ["Refactor ToolStatusTitle DOM measurement to offscreen global measurer (unconstrained by timeline layout)", "Remove inline measure nodes/CSS hooks and keep width morph behavior intact", "Run typechecks/tests and report what changed", "Verify reduced-motion behavior in timeline", "Review diff for animation edge cases", "Document rollout notes in PR description", "Check keyboard and screen reader semantics", "Add storybook controls for iteration speed"];
const btn = accent => ({
  padding: "6px 14px",
  "border-radius": "6px",
  border: "1px solid var(--color-divider, #333)",
  background: accent ? "var(--color-accent, #58f)" : "var(--color-fill-element, #222)",
  color: "var(--color-text, #eee)",
  cursor: "pointer",
  "font-size": "13px"
});
const css = `
[data-component="todo-stage"] {
  display: grid;
  gap: 20px;
  padding: 20px;
}

[data-component="todo-preview"] {
  height: 560px;
  min-height: 0;
}

[data-component="todo-session-root"] {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: var(--background-base);
  border: 1px solid var(--border-weak-base);
  border-radius: 12px;
}

[data-component="todo-session-frame"] {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

[data-component="todo-session-panel"] {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--background-stronger);
}

[data-slot="todo-preview-content"] {
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}

[data-slot="todo-preview-scroll"] {
  height: 100%;
  overflow: auto;
  min-height: 0;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

[data-slot="todo-preview-spacer"] {
  flex: 1 1 auto;
  min-height: 0;
}

[data-slot="todo-preview-msg"] {
  border-radius: 8px;
  border: 1px solid var(--border-weak-base);
  background: var(--surface-base);
  color: var(--text-weak);
  padding: 8px 10px;
  font-size: 13px;
  line-height: 1.35;
}

[data-slot="todo-preview-msg"][data-strong="true"] {
  color: var(--text-strong);
}
`;
export const Playground = {
  render: () => {
    const global = useGlobalSync();
    const [cfg, setCfg] = createStore({
      open: true,
      step: 1,
      dockOpenDuration: 0.3,
      dockOpenBounce: 0,
      dockCloseDuration: 0.3,
      dockCloseBounce: 0,
      drawerExpandDuration: 0.3,
      drawerExpandBounce: 0,
      drawerCollapseDuration: 0.3,
      drawerCollapseBounce: 0,
      subtitleDuration: 600,
      subtitleAuto: true,
      subtitleTravel: 25,
      subtitleEdge: 17,
      countDuration: 600,
      countMask: 18,
      countMaskHeight: 0,
      countWidthDuration: 560
    });
    const open = () => cfg.open;
    const step = () => cfg.step;
    const dockOpenDuration = () => cfg.dockOpenDuration;
    const dockOpenBounce = () => cfg.dockOpenBounce;
    const dockCloseDuration = () => cfg.dockCloseDuration;
    const dockCloseBounce = () => cfg.dockCloseBounce;
    const drawerExpandDuration = () => cfg.drawerExpandDuration;
    const drawerExpandBounce = () => cfg.drawerExpandBounce;
    const drawerCollapseDuration = () => cfg.drawerCollapseDuration;
    const drawerCollapseBounce = () => cfg.drawerCollapseBounce;
    const subtitleDuration = () => cfg.subtitleDuration;
    const subtitleAuto = () => cfg.subtitleAuto;
    const subtitleTravel = () => cfg.subtitleTravel;
    const subtitleEdge = () => cfg.subtitleEdge;
    const countDuration = () => cfg.countDuration;
    const countMask = () => cfg.countMask;
    const countMaskHeight = () => cfg.countMaskHeight;
    const countWidthDuration = () => cfg.countWidthDuration;
    const state = createSessionComposerState({
      closeMs: () => Math.round(dockCloseDuration() * 1000)
    });
    let frame;
    let composerRef;
    let scrollRef;
    const todos = createMemo(() => {
      const done = Math.max(0, Math.min(3, step()));
      return pool.slice(0, 3).map((content, i) => ({
        id: `todo-${i + 1}`,
        content,
        status: i < done ? "completed" : i === done && done < 3 ? "in_progress" : "pending"
      }));
    });
    createEffect(() => {
      global.todo.set("story-session", todos());
    });
    const clear = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = undefined;
    };
    const pin = () => {
      if (!scrollRef) return;
      scrollRef.scrollTop = scrollRef.scrollHeight;
    };
    const collapsed = () => !!composerRef?.querySelector('[data-action="session-todo-toggle-button"][data-collapsed="true"]');
    const setCollapsed = value => {
      const button = composerRef?.querySelector('[data-action="session-todo-toggle-button"]');
      if (!(button instanceof HTMLButtonElement)) return;
      if (collapsed() === value) return;
      button.click();
    };
    const openDock = () => {
      clear();
      setCfg("open", true);
      frame = requestAnimationFrame(() => {
        pin();
        frame = undefined;
      });
    };
    const closeDock = () => {
      clear();
      setCfg("open", false);
    };
    const dockOpen = () => open();
    const toggleDock = () => {
      if (dockOpen()) {
        closeDock();
        return;
      }
      openDock();
    };
    const toggleDrawer = () => {
      if (!dockOpen()) {
        openDock();
        frame = requestAnimationFrame(() => {
          pin();
          setCollapsed(true);
          frame = undefined;
        });
        return;
      }
      setCollapsed(!collapsed());
    };
    const cycle = () => {
      setCfg("step", value => (value + 1) % 4);
    };
    onCleanup(clear);
    return (() => {
      var _el$ = _tmpl$(),
        _el$2 = _el$.firstChild,
        _el$3 = _el$2.nextSibling,
        _el$4 = _el$3.firstChild,
        _el$5 = _el$4.firstChild,
        _el$6 = _el$5.firstChild,
        _el$7 = _el$6.firstChild,
        _el$8 = _el$7.firstChild,
        _el$9 = _el$7.nextSibling,
        _el$0 = _el$3.nextSibling,
        _el$1 = _el$0.firstChild,
        _el$10 = _el$1.nextSibling,
        _el$11 = _el$10.nextSibling,
        _el$12 = _el$11.firstChild,
        _el$14 = _el$12.nextSibling,
        _el$13 = _el$14.nextSibling,
        _el$15 = _el$0.nextSibling,
        _el$16 = _el$15.firstChild,
        _el$17 = _el$16.nextSibling,
        _el$18 = _el$17.firstChild,
        _el$19 = _el$18.nextSibling,
        _el$20 = _el$19.nextSibling,
        _el$21 = _el$20.firstChild,
        _el$22 = _el$17.nextSibling,
        _el$23 = _el$22.firstChild,
        _el$24 = _el$23.nextSibling,
        _el$25 = _el$24.nextSibling,
        _el$26 = _el$22.nextSibling,
        _el$27 = _el$26.nextSibling,
        _el$28 = _el$27.firstChild,
        _el$29 = _el$28.nextSibling,
        _el$30 = _el$29.nextSibling,
        _el$31 = _el$30.firstChild,
        _el$32 = _el$27.nextSibling,
        _el$33 = _el$32.firstChild,
        _el$34 = _el$33.nextSibling,
        _el$35 = _el$34.nextSibling,
        _el$36 = _el$32.nextSibling,
        _el$37 = _el$36.nextSibling,
        _el$38 = _el$37.firstChild,
        _el$39 = _el$38.nextSibling,
        _el$40 = _el$39.nextSibling,
        _el$41 = _el$40.firstChild,
        _el$42 = _el$37.nextSibling,
        _el$43 = _el$42.firstChild,
        _el$44 = _el$43.nextSibling,
        _el$45 = _el$44.nextSibling,
        _el$46 = _el$42.nextSibling,
        _el$47 = _el$46.nextSibling,
        _el$48 = _el$47.firstChild,
        _el$49 = _el$48.nextSibling,
        _el$50 = _el$49.nextSibling,
        _el$51 = _el$50.firstChild,
        _el$52 = _el$47.nextSibling,
        _el$53 = _el$52.firstChild,
        _el$54 = _el$53.nextSibling,
        _el$55 = _el$54.nextSibling,
        _el$56 = _el$52.nextSibling,
        _el$57 = _el$56.nextSibling,
        _el$58 = _el$57.firstChild,
        _el$59 = _el$58.nextSibling,
        _el$60 = _el$59.nextSibling,
        _el$61 = _el$60.firstChild,
        _el$62 = _el$57.nextSibling,
        _el$63 = _el$62.firstChild,
        _el$64 = _el$63.nextSibling,
        _el$65 = _el$64.nextSibling,
        _el$66 = _el$62.nextSibling,
        _el$67 = _el$66.firstChild,
        _el$68 = _el$67.nextSibling,
        _el$69 = _el$68.nextSibling,
        _el$70 = _el$69.firstChild,
        _el$71 = _el$66.nextSibling,
        _el$72 = _el$71.firstChild,
        _el$73 = _el$72.nextSibling,
        _el$74 = _el$73.nextSibling,
        _el$75 = _el$74.firstChild,
        _el$76 = _el$71.nextSibling,
        _el$77 = _el$76.nextSibling,
        _el$78 = _el$77.firstChild,
        _el$79 = _el$78.nextSibling,
        _el$80 = _el$79.nextSibling,
        _el$81 = _el$80.firstChild,
        _el$82 = _el$77.nextSibling,
        _el$83 = _el$82.firstChild,
        _el$84 = _el$83.nextSibling,
        _el$85 = _el$84.nextSibling,
        _el$86 = _el$85.firstChild,
        _el$87 = _el$82.nextSibling,
        _el$88 = _el$87.firstChild,
        _el$89 = _el$88.nextSibling,
        _el$90 = _el$89.nextSibling,
        _el$91 = _el$90.firstChild,
        _el$92 = _el$87.nextSibling,
        _el$93 = _el$92.firstChild,
        _el$94 = _el$93.nextSibling,
        _el$95 = _el$94.nextSibling,
        _el$96 = _el$95.firstChild;
      var _ref$ = scrollRef;
      typeof _ref$ === "function" ? _$use(_ref$, _el$8) : scrollRef = _el$8;
      var _ref$2 = composerRef;
      typeof _ref$2 === "function" ? _$use(_ref$2, _el$9) : composerRef = _el$9;
      _$insert(_el$9, _$createComponent(SessionComposerRegion, {
        state: state,
        centered: false,
        inputRef: () => {},
        newSessionWorktree: "",
        onNewSessionWorktreeReset: () => {},
        onSubmit: () => {},
        onResponseSubmit: pin,
        setPromptDockRef: () => {},
        get dockOpenVisualDuration() {
          return dockOpenDuration();
        },
        get dockOpenBounce() {
          return dockOpenBounce();
        },
        get dockCloseVisualDuration() {
          return dockCloseDuration();
        },
        get dockCloseBounce() {
          return dockCloseBounce();
        },
        get drawerExpandVisualDuration() {
          return drawerExpandDuration();
        },
        get drawerExpandBounce() {
          return drawerExpandBounce();
        },
        get drawerCollapseVisualDuration() {
          return drawerCollapseDuration();
        },
        get drawerCollapseBounce() {
          return drawerCollapseBounce();
        },
        get subtitleDuration() {
          return subtitleDuration();
        },
        get subtitleTravel() {
          return _$memo(() => !!subtitleAuto())() ? undefined : subtitleTravel();
        },
        get subtitleEdge() {
          return _$memo(() => !!subtitleAuto())() ? undefined : subtitleEdge();
        },
        get countDuration() {
          return countDuration();
        },
        get countMask() {
          return countMask();
        },
        get countMaskHeight() {
          return countMaskHeight();
        },
        get countWidthDuration() {
          return countWidthDuration();
        }
      }));
      _el$1.$$click = toggleDock;
      _$insert(_el$1, () => dockOpen() ? "Animate close" : "Animate open");
      _el$10.$$click = toggleDrawer;
      _$insert(_el$10, () => dockOpen() && collapsed() ? "Expand todo dock" : "Collapse todo dock");
      _el$11.$$click = cycle;
      _$insert(_el$11, step, _el$14);
      _$insert(_el$0, () => [0, 1, 2, 3].map(value => (() => {
        var _el$97 = _tmpl$2(),
          _el$98 = _el$97.firstChild;
        _el$97.$$click = () => setCfg("step", value);
        _$insert(_el$97, value, _el$98);
        _$effect(_$p => _$style(_el$97, btn(step() === value), _$p));
        return _el$97;
      })()), null);
      _el$19.$$input = event => setCfg("dockOpenDuration", event.currentTarget.valueAsNumber);
      _$insert(_el$20, () => Math.round(dockOpenDuration() * 1000), _el$21);
      _el$24.$$input = event => setCfg("dockOpenBounce", event.currentTarget.valueAsNumber);
      _$insert(_el$25, () => dockOpenBounce().toFixed(2));
      _el$29.$$input = event => setCfg("dockCloseDuration", event.currentTarget.valueAsNumber);
      _$insert(_el$30, () => Math.round(dockCloseDuration() * 1000), _el$31);
      _el$34.$$input = event => setCfg("dockCloseBounce", event.currentTarget.valueAsNumber);
      _$insert(_el$35, () => dockCloseBounce().toFixed(2));
      _el$39.$$input = event => setCfg("drawerExpandDuration", event.currentTarget.valueAsNumber);
      _$insert(_el$40, () => Math.round(drawerExpandDuration() * 1000), _el$41);
      _el$44.$$input = event => setCfg("drawerExpandBounce", event.currentTarget.valueAsNumber);
      _$insert(_el$45, () => drawerExpandBounce().toFixed(2));
      _el$49.$$input = event => setCfg("drawerCollapseDuration", event.currentTarget.valueAsNumber);
      _$insert(_el$50, () => Math.round(drawerCollapseDuration() * 1000), _el$51);
      _el$54.$$input = event => setCfg("drawerCollapseBounce", event.currentTarget.valueAsNumber);
      _$insert(_el$55, () => drawerCollapseBounce().toFixed(2));
      _el$59.$$input = event => setCfg("subtitleDuration", event.currentTarget.valueAsNumber);
      _$insert(_el$60, () => Math.round(subtitleDuration()), _el$61);
      _el$64.$$input = event => setCfg("subtitleAuto", event.currentTarget.checked);
      _$insert(_el$65, () => subtitleAuto() ? "on" : "off");
      _el$68.$$input = event => setCfg("subtitleTravel", event.currentTarget.valueAsNumber);
      _$insert(_el$69, subtitleTravel, _el$70);
      _el$73.$$input = event => setCfg("subtitleEdge", event.currentTarget.valueAsNumber);
      _$insert(_el$74, subtitleEdge, _el$75);
      _el$79.$$input = event => setCfg("countDuration", event.currentTarget.valueAsNumber);
      _$insert(_el$80, () => Math.round(countDuration()), _el$81);
      _el$84.$$input = event => setCfg("countMask", event.currentTarget.valueAsNumber);
      _$insert(_el$85, countMask, _el$86);
      _el$89.$$input = event => setCfg("countMaskHeight", event.currentTarget.valueAsNumber);
      _$insert(_el$90, countMaskHeight, _el$91);
      _el$94.$$input = event => setCfg("countWidthDuration", event.currentTarget.valueAsNumber);
      _$insert(_el$95, () => Math.round(countWidthDuration()), _el$96);
      _$effect(_p$ => {
        var _v$ = btn(dockOpen()),
          _v$2 = btn(dockOpen() && collapsed()),
          _v$3 = btn(step() > 0);
        _p$.e = _$style(_el$1, _v$, _p$.e);
        _p$.t = _$style(_el$10, _v$2, _p$.t);
        _p$.a = _$style(_el$11, _v$3, _p$.a);
        return _p$;
      }, {
        e: undefined,
        t: undefined,
        a: undefined
      });
      _$effect(() => _el$19.value = dockOpenDuration());
      _$effect(() => _el$24.value = dockOpenBounce());
      _$effect(() => _el$29.value = dockCloseDuration());
      _$effect(() => _el$34.value = dockCloseBounce());
      _$effect(() => _el$39.value = drawerExpandDuration());
      _$effect(() => _el$44.value = drawerExpandBounce());
      _$effect(() => _el$49.value = drawerCollapseDuration());
      _$effect(() => _el$54.value = drawerCollapseBounce());
      _$effect(() => _el$59.value = subtitleDuration());
      _$effect(() => _el$64.checked = subtitleAuto());
      _$effect(() => _el$68.value = subtitleTravel());
      _$effect(() => _el$73.value = subtitleEdge());
      _$effect(() => _el$79.value = countDuration());
      _$effect(() => _el$84.value = countMask());
      _$effect(() => _el$89.value = countMaskHeight());
      _$effect(() => _el$94.value = countWidthDuration());
      return _el$;
    })();
  }
};
_$delegateEvents(["click", "input"]);