import { effect as _$effect } from "@opentui/solid";
import { createTextNode as _$createTextNode } from "@opentui/solid";
import { insertNode as _$insertNode } from "@opentui/solid";
import { insert as _$insert } from "@opentui/solid";
import { createComponent as _$createComponent } from "@opentui/solid";
import { setProp as _$setProp } from "@opentui/solid";
import { use as _$use } from "@opentui/solid";
import { createElement as _$createElement } from "@opentui/solid";
import { RGBA, TextAttributes } from "@opentui/core";
import { useKeyboard } from "@opentui/solid";
import open from "open";
import { createSignal, onCleanup, onMount } from "solid-js";
import { selectedForeground, useTheme } from "@tui/context/theme.js";
import { useDialog } from "@tui/ui/dialog.js";
import { Link } from "@tui/ui/link.js";
import { GoLogo } from "./logo.js";
import { BgPulse } from "./bg-pulse.js";
const GO_URL = "";
const PAD_X = 3;
const PAD_TOP_OUTER = 1;
function subscribe(props, dialog) {
  open(GO_URL).catch(() => {});
  props.onClose?.();
  dialog.clear();
}
function dismiss(props, dialog) {
  props.onClose?.(true);
  dialog.clear();
}
export function DialogGoUpsell(props) {
  const dialog = useDialog();
  const {
    theme
  } = useTheme();
  const fg = selectedForeground(theme);
  const [selected, setSelected] = createSignal("subscribe");
  const [center, setCenter] = createSignal();
  const [masks, setMasks] = createSignal([]);
  let content;
  let logoBox;
  let headingBox;
  let descBox;
  let buttonsBox;
  const sync = () => {
    if (!content || !logoBox) return;
    setCenter({
      x: logoBox.x - content.x + logoBox.width / 2,
      y: logoBox.y - content.y + logoBox.height / 2 + PAD_TOP_OUTER
    });
    const next = [];
    const baseY = PAD_TOP_OUTER;
    for (const b of [headingBox, descBox, buttonsBox]) {
      if (!b) continue;
      next.push({
        x: b.x - content.x,
        y: b.y - content.y + baseY,
        width: b.width,
        height: b.height,
        pad: 2,
        strength: 0.78
      });
    }
    setMasks(next);
  };
  onMount(() => {
    sync();
    for (const b of [content, logoBox, headingBox, descBox, buttonsBox]) b?.on("resize", sync);
  });
  onCleanup(() => {
    for (const b of [content, logoBox, headingBox, descBox, buttonsBox]) b?.off("resize", sync);
  });
  useKeyboard(evt => {
    if (evt.name === "left" || evt.name === "right" || evt.name === "tab") {
      setSelected(s => s === "subscribe" ? "dismiss" : "subscribe");
      return;
    }
    if (evt.name === "return") {
      evt.preventDefault();
      evt.stopPropagation();
      if (selected() === "subscribe") subscribe(props, dialog);else dismiss(props, dialog);
    }
  });
  return (() => {
    var _el$ = _$createElement("box"),
      _el$2 = _$createElement("box"),
      _el$3 = _$createElement("box"),
      _el$4 = _$createElement("box"),
      _el$5 = _$createElement("text"),
      _el$7 = _$createElement("text"),
      _el$9 = _$createElement("box"),
      _el$0 = _$createElement("box"),
      _el$1 = _$createElement("text"),
      _el$11 = _$createElement("text"),
      _el$13 = _$createElement("text"),
      _el$15 = _$createElement("text"),
      _el$17 = _$createElement("box"),
      _el$18 = _$createElement("box"),
      _el$19 = _$createElement("box"),
      _el$20 = _$createElement("box"),
      _el$21 = _$createElement("text"),
      _el$23 = _$createElement("box"),
      _el$24 = _$createElement("text");
    _$insertNode(_el$, _el$2);
    _$insertNode(_el$, _el$3);
    _$use(item => content = item, _el$);
    _$setProp(_el$2, "position", "absolute");
    _$setProp(_el$2, "top", -1);
    _$setProp(_el$2, "left", 0);
    _$setProp(_el$2, "right", 0);
    _$setProp(_el$2, "bottom", 0);
    _$setProp(_el$2, "zIndex", 0);
    _$insert(_el$2, _$createComponent(BgPulse, {
      get centerX() {
        return center()?.x;
      },
      get centerY() {
        return center()?.y;
      },
      get masks() {
        return masks();
      }
    }));
    _$insertNode(_el$3, _el$4);
    _$insertNode(_el$3, _el$9);
    _$insertNode(_el$3, _el$17);
    _$insertNode(_el$3, _el$19);
    _$setProp(_el$3, "paddingLeft", 3);
    _$setProp(_el$3, "paddingRight", 3);
    _$setProp(_el$3, "paddingBottom", 1);
    _$setProp(_el$3, "gap", 1);
    _$insertNode(_el$4, _el$5);
    _$insertNode(_el$4, _el$7);
    _$use(item => headingBox = item, _el$4);
    _$setProp(_el$4, "flexDirection", "row");
    _$setProp(_el$4, "justifyContent", "space-between");
    _$insertNode(_el$5, _$createTextNode(`Free limit reached`));
    _$insertNode(_el$7, _$createTextNode(`esc`));
    _$setProp(_el$7, "onMouseUp", () => dialog.clear());
    _$insertNode(_el$9, _el$0);
    _$insertNode(_el$9, _el$15);
    _$use(item => descBox = item, _el$9);
    _$setProp(_el$9, "gap", 0);
    _$insertNode(_el$0, _el$1);
    _$insertNode(_el$0, _el$11);
    _$insertNode(_el$0, _el$13);
    _$setProp(_el$0, "flexDirection", "row");
    _$insertNode(_el$1, _$createTextNode(`Subscribe to `));
    _$insertNode(_el$11, _$createTextNode(`ClosedCode Go`));
    _$insertNode(_el$13, _$createTextNode(` for reliable access to the`));
    _$insertNode(_el$15, _$createTextNode(`best open-source models, starting at $5/month.`));
    _$insertNode(_el$17, _el$18);
    _$setProp(_el$17, "alignItems", "center");
    _$setProp(_el$17, "gap", 1);
    _$setProp(_el$17, "paddingBottom", 1);
    _$use(item => logoBox = item, _el$18);
    _$insert(_el$18, _$createComponent(GoLogo, {}));
    _$insert(_el$17, _$createComponent(Link, {
      href: GO_URL,
      get fg() {
        return theme.primary;
      }
    }), null);
    _$insertNode(_el$19, _el$20);
    _$insertNode(_el$19, _el$23);
    _$use(item => buttonsBox = item, _el$19);
    _$setProp(_el$19, "flexDirection", "row");
    _$setProp(_el$19, "justifyContent", "space-between");
    _$insertNode(_el$20, _el$21);
    _$setProp(_el$20, "paddingLeft", 2);
    _$setProp(_el$20, "paddingRight", 2);
    _$setProp(_el$20, "onMouseOver", () => setSelected("dismiss"));
    _$setProp(_el$20, "onMouseUp", () => dismiss(props, dialog));
    _$insertNode(_el$21, _$createTextNode(`don't show again`));
    _$insertNode(_el$23, _el$24);
    _$setProp(_el$23, "paddingLeft", 2);
    _$setProp(_el$23, "paddingRight", 2);
    _$setProp(_el$23, "onMouseOver", () => setSelected("subscribe"));
    _$setProp(_el$23, "onMouseUp", () => subscribe(props, dialog));
    _$insertNode(_el$24, _$createTextNode(`subscribe`));
    _$effect(_p$ => {
      var _v$ = TextAttributes.BOLD,
        _v$2 = theme.text,
        _v$3 = theme.textMuted,
        _v$4 = theme.textMuted,
        _v$5 = TextAttributes.BOLD,
        _v$6 = theme.textMuted,
        _v$7 = theme.textMuted,
        _v$8 = theme.textMuted,
        _v$9 = selected() === "dismiss" ? theme.primary : RGBA.fromInts(0, 0, 0, 0),
        _v$0 = selected() === "dismiss" ? fg : theme.textMuted,
        _v$1 = selected() === "dismiss" ? TextAttributes.BOLD : undefined,
        _v$10 = selected() === "subscribe" ? theme.primary : RGBA.fromInts(0, 0, 0, 0),
        _v$11 = selected() === "subscribe" ? fg : theme.text,
        _v$12 = selected() === "subscribe" ? TextAttributes.BOLD : undefined;
      _v$ !== _p$.e && (_p$.e = _$setProp(_el$5, "attributes", _v$, _p$.e));
      _v$2 !== _p$.t && (_p$.t = _$setProp(_el$5, "fg", _v$2, _p$.t));
      _v$3 !== _p$.a && (_p$.a = _$setProp(_el$7, "fg", _v$3, _p$.a));
      _v$4 !== _p$.o && (_p$.o = _$setProp(_el$1, "fg", _v$4, _p$.o));
      _v$5 !== _p$.i && (_p$.i = _$setProp(_el$11, "attributes", _v$5, _p$.i));
      _v$6 !== _p$.n && (_p$.n = _$setProp(_el$11, "fg", _v$6, _p$.n));
      _v$7 !== _p$.s && (_p$.s = _$setProp(_el$13, "fg", _v$7, _p$.s));
      _v$8 !== _p$.h && (_p$.h = _$setProp(_el$15, "fg", _v$8, _p$.h));
      _v$9 !== _p$.r && (_p$.r = _$setProp(_el$20, "backgroundColor", _v$9, _p$.r));
      _v$0 !== _p$.d && (_p$.d = _$setProp(_el$21, "fg", _v$0, _p$.d));
      _v$1 !== _p$.l && (_p$.l = _$setProp(_el$21, "attributes", _v$1, _p$.l));
      _v$10 !== _p$.u && (_p$.u = _$setProp(_el$23, "backgroundColor", _v$10, _p$.u));
      _v$11 !== _p$.c && (_p$.c = _$setProp(_el$24, "fg", _v$11, _p$.c));
      _v$12 !== _p$.w && (_p$.w = _$setProp(_el$24, "attributes", _v$12, _p$.w));
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
      w: undefined
    });
    return _el$;
  })();
}
DialogGoUpsell.show = dialog => {
  return new Promise(resolve => {
    dialog.replace(() => _$createComponent(DialogGoUpsell, {
      onClose: dontShow => resolve(dontShow ?? false)
    }), () => resolve(false));
  });
};