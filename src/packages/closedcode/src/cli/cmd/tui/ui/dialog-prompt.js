import { mergeProps as _$mergeProps } from "@opentui/solid";
import { effect as _$effect } from "@opentui/solid";
import { createComponent as _$createComponent } from "@opentui/solid";
import { memo as _$memo } from "@opentui/solid";
import { use as _$use } from "@opentui/solid";
import { createTextNode as _$createTextNode } from "@opentui/solid";
import { insertNode as _$insertNode } from "@opentui/solid";
import { insert as _$insert } from "@opentui/solid";
import { setProp as _$setProp } from "@opentui/solid";
import { createElement as _$createElement } from "@opentui/solid";
import { TextAttributes } from "@opentui/core";
import { useTheme } from "../context/theme.js";
import { useDialog } from "./dialog.js";
import { Show, createEffect, onMount } from "solid-js";
import { useKeyboard } from "@opentui/solid";
import { Spinner } from "../component/spinner.js";
export function DialogPrompt(props) {
  const dialog = useDialog();
  const {
    theme
  } = useTheme();
  let textarea;
  useKeyboard(evt => {
    if (props.busy) {
      if (evt.name === "escape") return;
      evt.preventDefault();
      evt.stopPropagation();
      return;
    }
    if (evt.name === "return") {
      evt.preventDefault();
      evt.stopPropagation();
      props.onConfirm?.(textarea.plainText);
    }
  });
  onMount(() => {
    dialog.setSize("medium");
    setTimeout(() => {
      if (!textarea || textarea.isDestroyed) return;
      if (props.busy) return;
      textarea.focus();
    }, 1);
    textarea.gotoLineEnd();
  });
  createEffect(() => {
    if (!textarea || textarea.isDestroyed) return;
    const traits = props.busy ? {
      suspend: true,
      status: "BUSY"
    } : {};
    textarea.traits = traits;
    if (props.busy) {
      textarea.blur();
      return;
    }
    textarea.focus();
  });
  return (() => {
    var _el$ = _$createElement("box"),
      _el$2 = _$createElement("box"),
      _el$3 = _$createElement("text"),
      _el$4 = _$createElement("text"),
      _el$6 = _$createElement("box"),
      _el$7 = _$createElement("textarea"),
      _el$8 = _$createElement("box");
    _$insertNode(_el$, _el$2);
    _$insertNode(_el$, _el$6);
    _$insertNode(_el$, _el$8);
    _$setProp(_el$, "paddingLeft", 2);
    _$setProp(_el$, "paddingRight", 2);
    _$setProp(_el$, "gap", 1);
    _$insertNode(_el$2, _el$3);
    _$insertNode(_el$2, _el$4);
    _$setProp(_el$2, "flexDirection", "row");
    _$setProp(_el$2, "justifyContent", "space-between");
    _$insert(_el$3, () => props.title);
    _$insertNode(_el$4, _$createTextNode(`esc`));
    _$setProp(_el$4, "onMouseUp", () => dialog.clear());
    _$insertNode(_el$6, _el$7);
    _$setProp(_el$6, "gap", 1);
    _$insert(_el$6, () => props.description, _el$7);
    _$use(val => {
      textarea = val;
    }, _el$7);
    _$setProp(_el$7, "onSubmit", () => {
      if (props.busy) return;
      props.onConfirm?.(textarea.plainText);
    });
    _$setProp(_el$7, "height", 3);
    _$insert(_el$6, _$createComponent(Show, {
      get when() {
        return props.busy;
      },
      get children() {
        return _$createComponent(Spinner, {
          get color() {
            return theme.textMuted;
          },
          get children() {
            return props.busyText ?? "Working...";
          }
        });
      }
    }), null);
    _$setProp(_el$8, "paddingBottom", 1);
    _$setProp(_el$8, "gap", 1);
    _$setProp(_el$8, "flexDirection", "row");
    _$insert(_el$8, _$createComponent(Show, {
      get when() {
        return !props.busy;
      },
      get fallback() {
        return (() => {
          var _el$11 = _$createElement("text");
          _$insertNode(_el$11, _$createTextNode(`processing...`));
          _$effect(_$p => _$setProp(_el$11, "fg", theme.textMuted, _$p));
          return _el$11;
        })();
      },
      get children() {
        var _el$9 = _$createElement("text"),
          _el$0 = _$createTextNode(`enter `),
          _el$1 = _$createElement("span");
        _$insertNode(_el$9, _el$0);
        _$insertNode(_el$9, _el$1);
        _$insertNode(_el$1, _$createTextNode(`submit`));
        _$effect(_p$ => {
          var _v$ = theme.text,
            _v$2 = {
              fg: theme.textMuted
            };
          _v$ !== _p$.e && (_p$.e = _$setProp(_el$9, "fg", _v$, _p$.e));
          _v$2 !== _p$.t && (_p$.t = _$setProp(_el$1, "style", _v$2, _p$.t));
          return _p$;
        }, {
          e: undefined,
          t: undefined
        });
        return _el$9;
      }
    }));
    _$effect(_p$ => {
      var _v$3 = TextAttributes.BOLD,
        _v$4 = theme.text,
        _v$5 = theme.textMuted,
        _v$6 = props.busy ? [] : [{
          name: "return",
          action: "submit"
        }],
        _v$7 = props.value,
        _v$8 = props.placeholder ?? "Enter text",
        _v$9 = theme.textMuted,
        _v$0 = props.busy ? theme.textMuted : theme.text,
        _v$1 = props.busy ? theme.textMuted : theme.text,
        _v$10 = props.busy ? theme.backgroundElement : theme.text;
      _v$3 !== _p$.e && (_p$.e = _$setProp(_el$3, "attributes", _v$3, _p$.e));
      _v$4 !== _p$.t && (_p$.t = _$setProp(_el$3, "fg", _v$4, _p$.t));
      _v$5 !== _p$.a && (_p$.a = _$setProp(_el$4, "fg", _v$5, _p$.a));
      _v$6 !== _p$.o && (_p$.o = _$setProp(_el$7, "keyBindings", _v$6, _p$.o));
      _v$7 !== _p$.i && (_p$.i = _$setProp(_el$7, "initialValue", _v$7, _p$.i));
      _v$8 !== _p$.n && (_p$.n = _$setProp(_el$7, "placeholder", _v$8, _p$.n));
      _v$9 !== _p$.s && (_p$.s = _$setProp(_el$7, "placeholderColor", _v$9, _p$.s));
      _v$0 !== _p$.h && (_p$.h = _$setProp(_el$7, "textColor", _v$0, _p$.h));
      _v$1 !== _p$.r && (_p$.r = _$setProp(_el$7, "focusedTextColor", _v$1, _p$.r));
      _v$10 !== _p$.d && (_p$.d = _$setProp(_el$7, "cursorColor", _v$10, _p$.d));
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
DialogPrompt.show = (dialog, title, options) => {
  return new Promise(resolve => {
    dialog.replace(() => _$createComponent(DialogPrompt, _$mergeProps({
      title: title
    }, options, {
      onConfirm: value => resolve(value),
      onCancel: () => resolve(null)
    })), () => resolve(null));
  });
};