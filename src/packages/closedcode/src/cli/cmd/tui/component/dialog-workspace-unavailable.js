import { effect as _$effect } from "@opentui/solid";
import { insert as _$insert } from "@opentui/solid";
import { createComponent as _$createComponent } from "@opentui/solid";
import { createTextNode as _$createTextNode } from "@opentui/solid";
import { insertNode as _$insertNode } from "@opentui/solid";
import { setProp as _$setProp } from "@opentui/solid";
import { createElement as _$createElement } from "@opentui/solid";
import { TextAttributes } from "@opentui/core";
import { useKeyboard } from "@opentui/solid";
import { createStore } from "solid-js/store";
import { For } from "solid-js";
import { useTheme } from "../context/theme.js";
import { useDialog } from "../ui/dialog.js";
export function DialogWorkspaceUnavailable(props) {
  const dialog = useDialog();
  const {
    theme
  } = useTheme();
  const [store, setStore] = createStore({
    active: "restore"
  });
  const options = ["cancel", "restore"];
  async function confirm() {
    if (store.active === "cancel") {
      dialog.clear();
      return;
    }
    const result = await props.onRestore?.();
    if (result === false) return;
  }
  useKeyboard(evt => {
    if (evt.name === "return") {
      evt.preventDefault();
      evt.stopPropagation();
      void confirm();
      return;
    }
    if (evt.name === "left") {
      evt.preventDefault();
      evt.stopPropagation();
      setStore("active", "cancel");
      return;
    }
    if (evt.name === "right") {
      evt.preventDefault();
      evt.stopPropagation();
      setStore("active", "restore");
    }
  });
  return (() => {
    var _el$ = _$createElement("box"),
      _el$2 = _$createElement("box"),
      _el$3 = _$createElement("text"),
      _el$5 = _$createElement("text"),
      _el$7 = _$createElement("text"),
      _el$9 = _$createElement("text"),
      _el$1 = _$createElement("box");
    _$insertNode(_el$, _el$2);
    _$insertNode(_el$, _el$7);
    _$insertNode(_el$, _el$9);
    _$insertNode(_el$, _el$1);
    _$setProp(_el$, "paddingLeft", 2);
    _$setProp(_el$, "paddingRight", 2);
    _$setProp(_el$, "gap", 1);
    _$insertNode(_el$2, _el$3);
    _$insertNode(_el$2, _el$5);
    _$setProp(_el$2, "flexDirection", "row");
    _$setProp(_el$2, "justifyContent", "space-between");
    _$insertNode(_el$3, _$createTextNode(`Workspace Unavailable`));
    _$insertNode(_el$5, _$createTextNode(`esc`));
    _$setProp(_el$5, "onMouseUp", () => dialog.clear());
    _$insertNode(_el$7, _$createTextNode(`This session is attached to a workspace that is no longer available.`));
    _$setProp(_el$7, "wrapMode", "word");
    _$insertNode(_el$9, _$createTextNode(`Would you like to restore this session into a new workspace?`));
    _$setProp(_el$9, "wrapMode", "word");
    _$setProp(_el$1, "flexDirection", "row");
    _$setProp(_el$1, "justifyContent", "flex-end");
    _$setProp(_el$1, "paddingBottom", 1);
    _$setProp(_el$1, "gap", 1);
    _$insert(_el$1, _$createComponent(For, {
      each: options,
      children: item => (() => {
        var _el$10 = _$createElement("box"),
          _el$11 = _$createElement("text");
        _$insertNode(_el$10, _el$11);
        _$setProp(_el$10, "paddingLeft", 2);
        _$setProp(_el$10, "paddingRight", 2);
        _$setProp(_el$10, "onMouseUp", () => {
          setStore("active", item);
          void confirm();
        });
        _$insert(_el$11, item);
        _$effect(_p$ => {
          var _v$6 = item === store.active ? theme.primary : undefined,
            _v$7 = item === store.active ? theme.selectedListItemText : theme.textMuted;
          _v$6 !== _p$.e && (_p$.e = _$setProp(_el$10, "backgroundColor", _v$6, _p$.e));
          _v$7 !== _p$.t && (_p$.t = _$setProp(_el$11, "fg", _v$7, _p$.t));
          return _p$;
        }, {
          e: undefined,
          t: undefined
        });
        return _el$10;
      })()
    }));
    _$effect(_p$ => {
      var _v$ = TextAttributes.BOLD,
        _v$2 = theme.text,
        _v$3 = theme.textMuted,
        _v$4 = theme.textMuted,
        _v$5 = theme.textMuted;
      _v$ !== _p$.e && (_p$.e = _$setProp(_el$3, "attributes", _v$, _p$.e));
      _v$2 !== _p$.t && (_p$.t = _$setProp(_el$3, "fg", _v$2, _p$.t));
      _v$3 !== _p$.a && (_p$.a = _$setProp(_el$5, "fg", _v$3, _p$.a));
      _v$4 !== _p$.o && (_p$.o = _$setProp(_el$7, "fg", _v$4, _p$.o));
      _v$5 !== _p$.i && (_p$.i = _$setProp(_el$9, "fg", _v$5, _p$.i));
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