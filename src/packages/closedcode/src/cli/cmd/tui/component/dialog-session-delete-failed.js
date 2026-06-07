import { effect as _$effect } from "@opentui/solid";
import { createComponent as _$createComponent } from "@opentui/solid";
import { insert as _$insert } from "@opentui/solid";
import { createTextNode as _$createTextNode } from "@opentui/solid";
import { insertNode as _$insertNode } from "@opentui/solid";
import { setProp as _$setProp } from "@opentui/solid";
import { createElement as _$createElement } from "@opentui/solid";
import { TextAttributes } from "@opentui/core";
import { useTheme } from "../context/theme.js";
import { useDialog } from "../ui/dialog.js";
import { createStore } from "solid-js/store";
import { For } from "solid-js";
import { useKeyboard } from "@opentui/solid";
export function DialogSessionDeleteFailed(props) {
  const dialog = useDialog();
  const {
    theme
  } = useTheme();
  const [store, setStore] = createStore({
    active: "delete"
  });
  const options = [{
    id: "delete",
    title: "Delete workspace",
    description: "Delete the workspace and all sessions attached to it.",
    run: props.onDelete
  }, {
    id: "restore",
    title: "Restore to new workspace",
    description: "Try to restore this session into a new workspace.",
    run: props.onRestore
  }];
  async function confirm() {
    const result = await options.find(item => item.id === store.active)?.run?.();
    if (result === false) return;
    props.onDone?.();
    if (!props.onDone) dialog.clear();
  }
  useKeyboard(evt => {
    if (evt.name === "return") {
      evt.preventDefault();
      evt.stopPropagation();
      void confirm();
    }
    if (evt.name === "left" || evt.name === "up") {
      setStore("active", "delete");
    }
    if (evt.name === "right" || evt.name === "down") {
      setStore("active", "restore");
    }
  });
  return (() => {
    var _el$ = _$createElement("box"),
      _el$2 = _$createElement("box"),
      _el$3 = _$createElement("text"),
      _el$5 = _$createElement("text"),
      _el$7 = _$createElement("text"),
      _el$8 = _$createElement("text"),
      _el$0 = _$createElement("box");
    _$insertNode(_el$, _el$2);
    _$insertNode(_el$, _el$7);
    _$insertNode(_el$, _el$8);
    _$insertNode(_el$, _el$0);
    _$setProp(_el$, "paddingLeft", 2);
    _$setProp(_el$, "paddingRight", 2);
    _$setProp(_el$, "gap", 1);
    _$insertNode(_el$2, _el$3);
    _$insertNode(_el$2, _el$5);
    _$setProp(_el$2, "flexDirection", "row");
    _$setProp(_el$2, "justifyContent", "space-between");
    _$insertNode(_el$3, _$createTextNode(`Failed to Delete Session`));
    _$insertNode(_el$5, _$createTextNode(`esc`));
    _$setProp(_el$5, "onMouseUp", () => dialog.clear());
    _$setProp(_el$7, "wrapMode", "word");
    _$insert(_el$7, () => `The session "${props.session}" could not be deleted because the workspace "${props.workspace}" is not available.`);
    _$insertNode(_el$8, _$createTextNode(`Choose how you want to recover this broken workspace session.`));
    _$setProp(_el$8, "wrapMode", "word");
    _$setProp(_el$0, "flexDirection", "column");
    _$setProp(_el$0, "paddingBottom", 1);
    _$setProp(_el$0, "gap", 1);
    _$insert(_el$0, _$createComponent(For, {
      each: options,
      children: item => (() => {
        var _el$1 = _$createElement("box"),
          _el$10 = _$createElement("text"),
          _el$11 = _$createElement("text");
        _$insertNode(_el$1, _el$10);
        _$insertNode(_el$1, _el$11);
        _$setProp(_el$1, "flexDirection", "column");
        _$setProp(_el$1, "paddingLeft", 1);
        _$setProp(_el$1, "paddingRight", 1);
        _$setProp(_el$1, "paddingTop", 1);
        _$setProp(_el$1, "paddingBottom", 1);
        _$setProp(_el$1, "onMouseUp", () => {
          setStore("active", item.id);
          void confirm();
        });
        _$insert(_el$10, () => item.title);
        _$setProp(_el$11, "wrapMode", "word");
        _$insert(_el$11, () => item.description);
        _$effect(_p$ => {
          var _v$6 = item.id === store.active ? theme.primary : undefined,
            _v$7 = TextAttributes.BOLD,
            _v$8 = item.id === store.active ? theme.selectedListItemText : theme.text,
            _v$9 = item.id === store.active ? theme.selectedListItemText : theme.textMuted;
          _v$6 !== _p$.e && (_p$.e = _$setProp(_el$1, "backgroundColor", _v$6, _p$.e));
          _v$7 !== _p$.t && (_p$.t = _$setProp(_el$10, "attributes", _v$7, _p$.t));
          _v$8 !== _p$.a && (_p$.a = _$setProp(_el$10, "fg", _v$8, _p$.a));
          _v$9 !== _p$.o && (_p$.o = _$setProp(_el$11, "fg", _v$9, _p$.o));
          return _p$;
        }, {
          e: undefined,
          t: undefined,
          a: undefined,
          o: undefined
        });
        return _el$1;
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
      _v$5 !== _p$.i && (_p$.i = _$setProp(_el$8, "fg", _v$5, _p$.i));
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