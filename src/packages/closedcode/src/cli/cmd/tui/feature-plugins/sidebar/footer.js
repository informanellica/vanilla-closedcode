import { insert as _$insert } from "@opentui/solid";
import { createComponent as _$createComponent } from "@opentui/solid";
import { effect as _$effect } from "@opentui/solid";
import { createTextNode as _$createTextNode } from "@opentui/solid";
import { insertNode as _$insertNode } from "@opentui/solid";
import { setProp as _$setProp } from "@opentui/solid";
import { createElement as _$createElement } from "@opentui/solid";
import { createMemo, Show } from "solid-js";
import { Global } from "core/global";
const id = "internal:sidebar-footer";
function View(props) {
  const theme = () => props.api.theme.current;
  const has = createMemo(() => props.api.state.provider.some(item => item.id !== "opencode" || Object.values(item.models).some(model => model.cost?.input !== 0)));
  const done = createMemo(() => props.api.kv.get("dismissed_getting_started", false));
  const show = createMemo(() => !has() && !done());
  const path = createMemo(() => {
    const dir = props.api.state.path.directory || process.cwd();
    const out = dir.replace(Global.Path.home, "~");
    const text = props.api.state.vcs?.branch ? out + ":" + props.api.state.vcs.branch : out;
    const list = text.split("/");
    return {
      parent: list.slice(0, -1).join("/"),
      name: list.at(-1) ?? ""
    };
  });
  return (() => {
    var _el$ = _$createElement("box"),
      _el$19 = _$createElement("text"),
      _el$20 = _$createElement("span"),
      _el$21 = _$createTextNode(`/`),
      _el$22 = _$createElement("span"),
      _el$23 = _$createElement("text"),
      _el$24 = _$createElement("span"),
      _el$26 = _$createTextNode(` `),
      _el$27 = _$createElement("b"),
      _el$29 = _$createElement("span"),
      _el$30 = _$createElement("b"),
      _el$32 = _$createTextNode(` `),
      _el$33 = _$createElement("span");
    _$insertNode(_el$, _el$19);
    _$insertNode(_el$, _el$23);
    _$setProp(_el$, "gap", 1);
    _$insert(_el$, _$createComponent(Show, {
      get when() {
        return show();
      },
      get children() {
        var _el$2 = _$createElement("box"),
          _el$3 = _$createElement("text"),
          _el$5 = _$createElement("box"),
          _el$6 = _$createElement("box"),
          _el$7 = _$createElement("text"),
          _el$8 = _$createElement("b"),
          _el$0 = _$createElement("text"),
          _el$10 = _$createElement("text"),
          _el$12 = _$createElement("text"),
          _el$14 = _$createElement("box"),
          _el$15 = _$createElement("text"),
          _el$17 = _$createElement("text");
        _$insertNode(_el$2, _el$3);
        _$insertNode(_el$2, _el$5);
        _$setProp(_el$2, "paddingTop", 1);
        _$setProp(_el$2, "paddingBottom", 1);
        _$setProp(_el$2, "paddingLeft", 2);
        _$setProp(_el$2, "paddingRight", 2);
        _$setProp(_el$2, "flexDirection", "row");
        _$setProp(_el$2, "gap", 1);
        _$insertNode(_el$3, _$createTextNode(`⬖`));
        _$setProp(_el$3, "flexShrink", 0);
        _$insertNode(_el$5, _el$6);
        _$insertNode(_el$5, _el$10);
        _$insertNode(_el$5, _el$12);
        _$insertNode(_el$5, _el$14);
        _$setProp(_el$5, "flexGrow", 1);
        _$setProp(_el$5, "gap", 1);
        _$insertNode(_el$6, _el$7);
        _$insertNode(_el$6, _el$0);
        _$setProp(_el$6, "flexDirection", "row");
        _$setProp(_el$6, "justifyContent", "space-between");
        _$insertNode(_el$7, _el$8);
        _$insertNode(_el$8, _$createTextNode(`Getting started`));
        _$insertNode(_el$0, _$createTextNode(`✕`));
        _$setProp(_el$0, "onMouseDown", () => props.api.kv.set("dismissed_getting_started", true));
        _$insertNode(_el$10, _$createTextNode(`ClosedCode includes free models so you can start immediately.`));
        _$insertNode(_el$12, _$createTextNode(`Connect from 75+ providers to use other models, including Claude, GPT, Gemini etc`));
        _$insertNode(_el$14, _el$15);
        _$insertNode(_el$14, _el$17);
        _$setProp(_el$14, "flexDirection", "row");
        _$setProp(_el$14, "gap", 1);
        _$setProp(_el$14, "justifyContent", "space-between");
        _$insertNode(_el$15, _$createTextNode(`Connect provider`));
        _$insertNode(_el$17, _$createTextNode(`/connect`));
        _$effect(_p$ => {
          var _v$ = theme().backgroundElement,
            _v$2 = theme().text,
            _v$3 = theme().text,
            _v$4 = theme().textMuted,
            _v$5 = theme().textMuted,
            _v$6 = theme().textMuted,
            _v$7 = theme().text,
            _v$8 = theme().textMuted;
          _v$ !== _p$.e && (_p$.e = _$setProp(_el$2, "backgroundColor", _v$, _p$.e));
          _v$2 !== _p$.t && (_p$.t = _$setProp(_el$3, "fg", _v$2, _p$.t));
          _v$3 !== _p$.a && (_p$.a = _$setProp(_el$7, "fg", _v$3, _p$.a));
          _v$4 !== _p$.o && (_p$.o = _$setProp(_el$0, "fg", _v$4, _p$.o));
          _v$5 !== _p$.i && (_p$.i = _$setProp(_el$10, "fg", _v$5, _p$.i));
          _v$6 !== _p$.n && (_p$.n = _$setProp(_el$12, "fg", _v$6, _p$.n));
          _v$7 !== _p$.s && (_p$.s = _$setProp(_el$15, "fg", _v$7, _p$.s));
          _v$8 !== _p$.h && (_p$.h = _$setProp(_el$17, "fg", _v$8, _p$.h));
          return _p$;
        }, {
          e: undefined,
          t: undefined,
          a: undefined,
          o: undefined,
          i: undefined,
          n: undefined,
          s: undefined,
          h: undefined
        });
        return _el$2;
      }
    }), _el$19);
    _$insertNode(_el$19, _el$20);
    _$insertNode(_el$19, _el$22);
    _$insertNode(_el$20, _el$21);
    _$insert(_el$20, () => path().parent, _el$21);
    _$insert(_el$22, () => path().name);
    _$insertNode(_el$23, _el$24);
    _$insertNode(_el$23, _el$26);
    _$insertNode(_el$23, _el$27);
    _$insertNode(_el$23, _el$29);
    _$insertNode(_el$23, _el$32);
    _$insertNode(_el$23, _el$33);
    _$insertNode(_el$24, _$createTextNode(`•`));
    _$insertNode(_el$27, _$createTextNode(`Open`));
    _$insertNode(_el$29, _el$30);
    _$insertNode(_el$30, _$createTextNode(`Code`));
    _$insert(_el$33, () => props.api.app.version);
    _$effect(_p$ => {
      var _v$9 = {
          fg: theme().textMuted
        },
        _v$0 = {
          fg: theme().text
        },
        _v$1 = theme().textMuted,
        _v$10 = {
          fg: theme().success
        },
        _v$11 = {
          fg: theme().text
        };
      _v$9 !== _p$.e && (_p$.e = _$setProp(_el$20, "style", _v$9, _p$.e));
      _v$0 !== _p$.t && (_p$.t = _$setProp(_el$22, "style", _v$0, _p$.t));
      _v$1 !== _p$.a && (_p$.a = _$setProp(_el$23, "fg", _v$1, _p$.a));
      _v$10 !== _p$.o && (_p$.o = _$setProp(_el$24, "style", _v$10, _p$.o));
      _v$11 !== _p$.i && (_p$.i = _$setProp(_el$29, "style", _v$11, _p$.i));
      return _p$;
    }, {
      e: undefined,
      t: undefined,
      a: undefined,
      o: undefined,
      i: undefined
    });
    return _el$;
  })();
}
const tui = async api => {
  api.slots.register({
    order: 100,
    slots: {
      sidebar_footer() {
        return _$createComponent(View, {
          api: api
        });
      }
    }
  });
};
const plugin = {
  id,
  tui
};
export default plugin;