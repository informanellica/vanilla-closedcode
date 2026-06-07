import { createComponent as _$createComponent } from "@opentui/solid";
import { effect as _$effect } from "@opentui/solid";
import { createTextNode as _$createTextNode } from "@opentui/solid";
import { insertNode as _$insertNode } from "@opentui/solid";
import { insert as _$insert } from "@opentui/solid";
import { spread as _$spread } from "@opentui/solid";
import { mergeProps as _$mergeProps } from "@opentui/solid";
import { setProp as _$setProp } from "@opentui/solid";
import { createElement as _$createElement } from "@opentui/solid";
import { createMemo, createSignal, Show } from "solid-js";
import { useRouteData } from "@tui/context/route.js";
import { useSync } from "@tui/context/sync.js";
import { useTheme } from "@tui/context/theme.js";
import { SplitBorder } from "@tui/component/border.js";
import { useCommandDialog } from "@tui/component/dialog-command.js";
import { useKeybind } from "../../context/keybind.js";
import { Locale } from "@/util/locale.js";
import { useTerminalDimensions } from "@opentui/solid";
export function SubagentFooter() {
  const route = useRouteData("session");
  const sync = useSync();
  const messages = createMemo(() => sync.data.message[route.sessionID] ?? []);
  const session = createMemo(() => sync.session.get(route.sessionID));
  const subagentInfo = createMemo(() => {
    const s = session();
    if (!s) return {
      label: "Subagent",
      index: 0,
      total: 0
    };
    const agentMatch = s.title.match(/@(\w+) subagent/);
    const label = agentMatch ? Locale.titlecase(agentMatch[1]) : "Subagent";
    if (!s.parentID) return {
      label,
      index: 0,
      total: 0
    };
    const siblings = sync.data.session.filter(x => x.parentID === s.parentID).toSorted((a, b) => a.time.created - b.time.created);
    const index = siblings.findIndex(x => x.id === s.id);
    return {
      label,
      index: index + 1,
      total: siblings.length
    };
  });
  const usage = createMemo(() => {
    const msg = messages();
    const last = msg.findLast(item => item.role === "assistant" && item.tokens.output > 0);
    if (!last) return;
    const tokens = last.tokens.input + last.tokens.output + last.tokens.reasoning + last.tokens.cache.read + last.tokens.cache.write;
    if (tokens <= 0) return;
    const model = sync.data.provider.find(item => item.id === last.providerID)?.models[last.modelID];
    const pct = model?.limit.context ? `${Math.round(tokens / model.limit.context * 100)}%` : undefined;
    const cost = msg.reduce((sum, item) => sum + (item.role === "assistant" ? item.cost : 0), 0);
    const money = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD"
    });
    return {
      context: pct ? `${Locale.number(tokens)} (${pct})` : Locale.number(tokens),
      cost: cost > 0 ? money.format(cost) : undefined
    };
  });
  const {
    theme
  } = useTheme();
  const keybind = useKeybind();
  const command = useCommandDialog();
  const [hover, setHover] = createSignal(null);
  useTerminalDimensions();
  return (() => {
    var _el$ = _$createElement("box"),
      _el$2 = _$createElement("box"),
      _el$3 = _$createElement("box"),
      _el$4 = _$createElement("box"),
      _el$5 = _$createElement("text"),
      _el$6 = _$createElement("b"),
      _el$1 = _$createElement("box"),
      _el$10 = _$createElement("box"),
      _el$11 = _$createElement("text"),
      _el$12 = _$createTextNode(`Parent `),
      _el$13 = _$createElement("span"),
      _el$14 = _$createElement("box"),
      _el$15 = _$createElement("text"),
      _el$16 = _$createTextNode(`Prev `),
      _el$17 = _$createElement("span"),
      _el$18 = _$createElement("box"),
      _el$19 = _$createElement("text"),
      _el$20 = _$createTextNode(`Next `),
      _el$21 = _$createElement("span");
    _$insertNode(_el$, _el$2);
    _$setProp(_el$, "flexShrink", 0);
    _$insertNode(_el$2, _el$3);
    _$setProp(_el$2, "paddingTop", 1);
    _$setProp(_el$2, "paddingBottom", 1);
    _$setProp(_el$2, "paddingLeft", 2);
    _$setProp(_el$2, "paddingRight", 1);
    _$spread(_el$2, _$mergeProps(SplitBorder, {
      "border": ["left"],
      get borderColor() {
        return theme.border;
      },
      "flexShrink": 0,
      get backgroundColor() {
        return theme.backgroundPanel;
      }
    }), true);
    _$insertNode(_el$3, _el$4);
    _$insertNode(_el$3, _el$1);
    _$setProp(_el$3, "flexDirection", "row");
    _$setProp(_el$3, "justifyContent", "space-between");
    _$setProp(_el$3, "gap", 1);
    _$insertNode(_el$4, _el$5);
    _$setProp(_el$4, "flexDirection", "row");
    _$setProp(_el$4, "gap", 1);
    _$insertNode(_el$5, _el$6);
    _$insert(_el$6, () => subagentInfo().label);
    _$insert(_el$4, _$createComponent(Show, {
      get when() {
        return subagentInfo().total > 0;
      },
      get children() {
        var _el$7 = _$createElement("text"),
          _el$8 = _$createTextNode(`(`),
          _el$9 = _$createTextNode(` of `),
          _el$0 = _$createTextNode(`)`);
        _$insertNode(_el$7, _el$8);
        _$insertNode(_el$7, _el$9);
        _$insertNode(_el$7, _el$0);
        _$insert(_el$7, () => subagentInfo().index, _el$9);
        _$insert(_el$7, () => subagentInfo().total, _el$0);
        _$effect(_$p => _$setProp(_el$7, "style", {
          fg: theme.textMuted
        }, _$p));
        return _el$7;
      }
    }), null);
    _$insert(_el$4, _$createComponent(Show, {
      get when() {
        return usage();
      },
      children: item => (() => {
        var _el$22 = _$createElement("text");
        _$setProp(_el$22, "wrapMode", "none");
        _$insert(_el$22, () => [item().context, item().cost].filter(Boolean).join(" · "));
        _$effect(_$p => _$setProp(_el$22, "fg", theme.textMuted, _$p));
        return _el$22;
      })()
    }), null);
    _$insertNode(_el$1, _el$10);
    _$insertNode(_el$1, _el$14);
    _$insertNode(_el$1, _el$18);
    _$setProp(_el$1, "flexDirection", "row");
    _$setProp(_el$1, "gap", 2);
    _$insertNode(_el$10, _el$11);
    _$setProp(_el$10, "onMouseOver", () => setHover("parent"));
    _$setProp(_el$10, "onMouseOut", () => setHover(null));
    _$setProp(_el$10, "onMouseUp", () => command.trigger("session.parent"));
    _$insertNode(_el$11, _el$12);
    _$insertNode(_el$11, _el$13);
    _$insert(_el$13, () => keybind.print("session_parent"));
    _$insertNode(_el$14, _el$15);
    _$setProp(_el$14, "onMouseOver", () => setHover("prev"));
    _$setProp(_el$14, "onMouseOut", () => setHover(null));
    _$setProp(_el$14, "onMouseUp", () => command.trigger("session.child.previous"));
    _$insertNode(_el$15, _el$16);
    _$insertNode(_el$15, _el$17);
    _$insert(_el$17, () => keybind.print("session_child_cycle_reverse"));
    _$insertNode(_el$18, _el$19);
    _$setProp(_el$18, "onMouseOver", () => setHover("next"));
    _$setProp(_el$18, "onMouseOut", () => setHover(null));
    _$setProp(_el$18, "onMouseUp", () => command.trigger("session.child.next"));
    _$insertNode(_el$19, _el$20);
    _$insertNode(_el$19, _el$21);
    _$insert(_el$21, () => keybind.print("session_child_cycle"));
    _$effect(_p$ => {
      var _v$ = theme.text,
        _v$2 = hover() === "parent" ? theme.backgroundElement : theme.backgroundPanel,
        _v$3 = theme.text,
        _v$4 = {
          fg: theme.textMuted
        },
        _v$5 = hover() === "prev" ? theme.backgroundElement : theme.backgroundPanel,
        _v$6 = theme.text,
        _v$7 = {
          fg: theme.textMuted
        },
        _v$8 = hover() === "next" ? theme.backgroundElement : theme.backgroundPanel,
        _v$9 = theme.text,
        _v$0 = {
          fg: theme.textMuted
        };
      _v$ !== _p$.e && (_p$.e = _$setProp(_el$5, "fg", _v$, _p$.e));
      _v$2 !== _p$.t && (_p$.t = _$setProp(_el$10, "backgroundColor", _v$2, _p$.t));
      _v$3 !== _p$.a && (_p$.a = _$setProp(_el$11, "fg", _v$3, _p$.a));
      _v$4 !== _p$.o && (_p$.o = _$setProp(_el$13, "style", _v$4, _p$.o));
      _v$5 !== _p$.i && (_p$.i = _$setProp(_el$14, "backgroundColor", _v$5, _p$.i));
      _v$6 !== _p$.n && (_p$.n = _$setProp(_el$15, "fg", _v$6, _p$.n));
      _v$7 !== _p$.s && (_p$.s = _$setProp(_el$17, "style", _v$7, _p$.s));
      _v$8 !== _p$.h && (_p$.h = _$setProp(_el$18, "backgroundColor", _v$8, _p$.h));
      _v$9 !== _p$.r && (_p$.r = _$setProp(_el$19, "fg", _v$9, _p$.r));
      _v$0 !== _p$.d && (_p$.d = _$setProp(_el$21, "style", _v$0, _p$.d));
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
      d: undefined
    });
    return _el$;
  })();
}