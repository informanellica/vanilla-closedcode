import { effect as _$effect } from "@opentui/solid";
import { insert as _$insert } from "@opentui/solid";
import { memo as _$memo } from "@opentui/solid";
import { createTextNode as _$createTextNode } from "@opentui/solid";
import { insertNode as _$insertNode } from "@opentui/solid";
import { setProp as _$setProp } from "@opentui/solid";
import { createElement as _$createElement } from "@opentui/solid";
import { TextAttributes } from "@opentui/core";
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/solid";
import * as Clipboard from "#tui/util/clipboard.js";
import { createSignal } from "solid-js";
import { InstallationVersion } from "core/installation/version";
import { win32FlushInputBuffer } from "../win32.js";
import { getScrollAcceleration } from "../util/scroll.js";
export function ErrorComponent(props) {
  const term = useTerminalDimensions();
  const renderer = useRenderer();
  const handleExit = async () => {
    await props.onBeforeExit?.();
    renderer.setTerminalTitle("");
    renderer.destroy();
    win32FlushInputBuffer();
    await props.onExit();
  };
  useKeyboard(evt => {
    if (evt.ctrl && evt.name === "c") {
      void handleExit();
    }
  });
  const [copied, setCopied] = createSignal(false);
  const issueURL = new URL("https://github.com/informanellica/vanilla-closedcode/issues/new");

  // Choose safe fallback colors per mode since theme context may not be available
  const isLight = props.mode === "light";
  const colors = {
    bg: isLight ? "#ffffff" : "#0a0a0a",
    text: isLight ? "#1a1a1a" : "#eeeeee",
    muted: isLight ? "#8a8a8a" : "#808080",
    primary: isLight ? "#3b7dd8" : "#fab283"
  };
  if (props.error.message) {
    issueURL.searchParams.set("title", `opentui: fatal: ${props.error.message}`);
  }
  if (props.error.stack) {
    issueURL.searchParams.set("description", "```\n" + props.error.stack.substring(0, 6000 - issueURL.toString().length) + "...\n```");
  }
  issueURL.searchParams.set("closedcode-version", InstallationVersion);
  const copyIssueURL = () => {
    void Clipboard.copy(issueURL.toString()).then(() => {
      setCopied(true);
    });
  };
  return (() => {
    var _el$ = _$createElement("box"),
      _el$2 = _$createElement("box"),
      _el$3 = _$createElement("text"),
      _el$5 = _$createElement("box"),
      _el$6 = _$createElement("text"),
      _el$8 = _$createElement("box"),
      _el$9 = _$createElement("text"),
      _el$1 = _$createElement("box"),
      _el$10 = _$createElement("text"),
      _el$12 = _$createElement("box"),
      _el$13 = _$createElement("text"),
      _el$15 = _$createElement("scrollbox"),
      _el$16 = _$createElement("text"),
      _el$17 = _$createElement("text");
    _$insertNode(_el$, _el$2);
    _$insertNode(_el$, _el$8);
    _$insertNode(_el$, _el$15);
    _$insertNode(_el$, _el$17);
    _$setProp(_el$, "flexDirection", "column");
    _$setProp(_el$, "gap", 1);
    _$insertNode(_el$2, _el$3);
    _$insertNode(_el$2, _el$5);
    _$setProp(_el$2, "flexDirection", "row");
    _$setProp(_el$2, "gap", 1);
    _$setProp(_el$2, "alignItems", "center");
    _$insertNode(_el$3, _$createTextNode(`Please report an issue.`));
    _$insertNode(_el$5, _el$6);
    _$setProp(_el$5, "onMouseUp", copyIssueURL);
    _$setProp(_el$5, "padding", 1);
    _$insertNode(_el$6, _$createTextNode(`Copy issue URL (exception info pre-filled)`));
    _$insert(_el$2, (() => {
      var _c$ = _$memo(() => !!copied());
      return () => _c$() && (() => {
        var _el$18 = _$createElement("text");
        _$insertNode(_el$18, _$createTextNode(`Successfully copied`));
        _$effect(_$p => _$setProp(_el$18, "fg", colors.muted, _$p));
        return _el$18;
      })();
    })(), null);
    _$insertNode(_el$8, _el$9);
    _$insertNode(_el$8, _el$1);
    _$insertNode(_el$8, _el$12);
    _$setProp(_el$8, "flexDirection", "row");
    _$setProp(_el$8, "gap", 2);
    _$setProp(_el$8, "alignItems", "center");
    _$insertNode(_el$9, _$createTextNode(`A fatal error occurred!`));
    _$insertNode(_el$1, _el$10);
    _$setProp(_el$1, "padding", 1);
    _$insertNode(_el$10, _$createTextNode(`Reset TUI`));
    _$insertNode(_el$12, _el$13);
    _$setProp(_el$12, "onMouseUp", handleExit);
    _$setProp(_el$12, "padding", 1);
    _$insertNode(_el$13, _$createTextNode(`Exit`));
    _$insertNode(_el$15, _el$16);
    _$insert(_el$16, () => props.error.stack);
    _$insert(_el$17, () => props.error.message);
    _$effect(_p$ => {
      var _v$ = colors.bg,
        _v$2 = TextAttributes.BOLD,
        _v$3 = colors.text,
        _v$4 = colors.primary,
        _v$5 = TextAttributes.BOLD,
        _v$6 = colors.bg,
        _v$7 = colors.text,
        _v$8 = props.reset,
        _v$9 = colors.primary,
        _v$0 = colors.bg,
        _v$1 = colors.primary,
        _v$10 = colors.bg,
        _v$11 = Math.floor(term().height * 0.7),
        _v$12 = getScrollAcceleration(),
        _v$13 = colors.muted,
        _v$14 = colors.text;
      _v$ !== _p$.e && (_p$.e = _$setProp(_el$, "backgroundColor", _v$, _p$.e));
      _v$2 !== _p$.t && (_p$.t = _$setProp(_el$3, "attributes", _v$2, _p$.t));
      _v$3 !== _p$.a && (_p$.a = _$setProp(_el$3, "fg", _v$3, _p$.a));
      _v$4 !== _p$.o && (_p$.o = _$setProp(_el$5, "backgroundColor", _v$4, _p$.o));
      _v$5 !== _p$.i && (_p$.i = _$setProp(_el$6, "attributes", _v$5, _p$.i));
      _v$6 !== _p$.n && (_p$.n = _$setProp(_el$6, "fg", _v$6, _p$.n));
      _v$7 !== _p$.s && (_p$.s = _$setProp(_el$9, "fg", _v$7, _p$.s));
      _v$8 !== _p$.h && (_p$.h = _$setProp(_el$1, "onMouseUp", _v$8, _p$.h));
      _v$9 !== _p$.r && (_p$.r = _$setProp(_el$1, "backgroundColor", _v$9, _p$.r));
      _v$0 !== _p$.d && (_p$.d = _$setProp(_el$10, "fg", _v$0, _p$.d));
      _v$1 !== _p$.l && (_p$.l = _$setProp(_el$12, "backgroundColor", _v$1, _p$.l));
      _v$10 !== _p$.u && (_p$.u = _$setProp(_el$13, "fg", _v$10, _p$.u));
      _v$11 !== _p$.c && (_p$.c = _$setProp(_el$15, "height", _v$11, _p$.c));
      _v$12 !== _p$.w && (_p$.w = _$setProp(_el$15, "scrollAcceleration", _v$12, _p$.w));
      _v$13 !== _p$.m && (_p$.m = _$setProp(_el$16, "fg", _v$13, _p$.m));
      _v$14 !== _p$.f && (_p$.f = _$setProp(_el$17, "fg", _v$14, _p$.f));
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
      f: undefined
    });
    return _el$;
  })();
}