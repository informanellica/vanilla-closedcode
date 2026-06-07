import { template as _$template } from "solid-js/web";
import { memo as _$memo } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { spread as _$spread } from "solid-js/web";
import { mergeProps as _$mergeProps } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<div>`),
  _tmpl$2 = /*#__PURE__*/_$template(`<form>`);
import { splitProps } from "solid-js";
export function DockShell(props) {
  const [split, rest] = splitProps(props, ["children", "class", "classList"]);
  return (() => {
    var _el$ = _tmpl$();
    _$spread(_el$, _$mergeProps(rest, {
      "data-dock-surface": "shell",
      get classList() {
        return {
          ...split.classList,
          [split.class ?? ""]: !!split.class
        };
      }
    }), false, true);
    _$insert(_el$, () => split.children);
    return _el$;
  })();
}
export function DockShellForm(props) {
  const [split, rest] = splitProps(props, ["children", "class", "classList"]);
  return (() => {
    var _el$2 = _tmpl$2();
    _$spread(_el$2, _$mergeProps(rest, {
      "data-dock-surface": "shell",
      get classList() {
        return {
          ...split.classList,
          [split.class ?? ""]: !!split.class
        };
      }
    }), false, true);
    _$insert(_el$2, () => split.children);
    return _el$2;
  })();
}
export function DockTray(props) {
  const [split, rest] = splitProps(props, ["attach", "children", "class", "classList"]);
  return (() => {
    var _el$3 = _tmpl$();
    _$spread(_el$3, _$mergeProps(rest, {
      "data-dock-surface": "tray",
      get ["data-dock-attach"]() {
        return split.attach || "none";
      },
      get classList() {
        return {
          ...split.classList,
          [split.class ?? ""]: !!split.class
        };
      }
    }), false, true);
    _$insert(_el$3, () => split.children);
    return _el$3;
  })();
}