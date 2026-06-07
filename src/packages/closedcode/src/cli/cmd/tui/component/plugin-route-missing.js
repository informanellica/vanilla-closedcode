import { effect as _$effect } from "@opentui/solid";
import { insert as _$insert } from "@opentui/solid";
import { createTextNode as _$createTextNode } from "@opentui/solid";
import { insertNode as _$insertNode } from "@opentui/solid";
import { setProp as _$setProp } from "@opentui/solid";
import { createElement as _$createElement } from "@opentui/solid";
import { useTheme } from "../context/theme.js";
export function PluginRouteMissing(props) {
  const {
    theme
  } = useTheme();
  return (() => {
    var _el$ = _$createElement("box"),
      _el$2 = _$createElement("text"),
      _el$3 = _$createTextNode(`Unknown plugin route: `),
      _el$4 = _$createElement("box"),
      _el$5 = _$createElement("text");
    _$insertNode(_el$, _el$2);
    _$insertNode(_el$, _el$4);
    _$setProp(_el$, "width", "100%");
    _$setProp(_el$, "height", "100%");
    _$setProp(_el$, "alignItems", "center");
    _$setProp(_el$, "justifyContent", "center");
    _$setProp(_el$, "flexDirection", "column");
    _$setProp(_el$, "gap", 1);
    _$insertNode(_el$2, _el$3);
    _$insert(_el$2, () => props.id, null);
    _$insertNode(_el$4, _el$5);
    _$setProp(_el$4, "paddingLeft", 1);
    _$setProp(_el$4, "paddingRight", 1);
    _$insertNode(_el$5, _$createTextNode(`go home`));
    _$effect(_p$ => {
      var _v$ = theme.warning,
        _v$2 = props.onHome,
        _v$3 = theme.backgroundElement,
        _v$4 = theme.text;
      _v$ !== _p$.e && (_p$.e = _$setProp(_el$2, "fg", _v$, _p$.e));
      _v$2 !== _p$.t && (_p$.t = _$setProp(_el$4, "onMouseUp", _v$2, _p$.t));
      _v$3 !== _p$.a && (_p$.a = _$setProp(_el$4, "backgroundColor", _v$3, _p$.a));
      _v$4 !== _p$.o && (_p$.o = _$setProp(_el$5, "fg", _v$4, _p$.o));
      return _p$;
    }, {
      e: undefined,
      t: undefined,
      a: undefined,
      o: undefined
    });
    return _el$;
  })();
}