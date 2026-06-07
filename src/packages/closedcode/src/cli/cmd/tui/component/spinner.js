import { createTextNode as _$createTextNode } from "@opentui/solid";
import { insertNode as _$insertNode } from "@opentui/solid";
import { createComponent as _$createComponent } from "@opentui/solid";
import { effect as _$effect } from "@opentui/solid";
import { insert as _$insert } from "@opentui/solid";
import { setProp as _$setProp } from "@opentui/solid";
import { createElement as _$createElement } from "@opentui/solid";
import { Show } from "solid-js";
import { useTheme } from "../context/theme.js";
import { useKV } from "../context/kv.js";
import "opentui-spinner/solid";
const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
export function Spinner(props) {
  const {
    theme
  } = useTheme();
  const kv = useKV();
  const color = () => props.color ?? theme.textMuted;
  return _$createComponent(Show, {
    get when() {
      return kv.get("animations_enabled", true);
    },
    get fallback() {
      return (() => {
        var _el$4 = _$createElement("text"),
          _el$5 = _$createTextNode(`⋯ `);
        _$insertNode(_el$4, _el$5);
        _$insert(_el$4, () => props.children, null);
        _$effect(_$p => _$setProp(_el$4, "fg", color(), _$p));
        return _el$4;
      })();
    },
    get children() {
      var _el$ = _$createElement("box"),
        _el$2 = _$createElement("spinner");
      _$insertNode(_el$, _el$2);
      _$setProp(_el$, "flexDirection", "row");
      _$setProp(_el$, "gap", 1);
      _$setProp(_el$2, "frames", frames);
      _$setProp(_el$2, "interval", 80);
      _$insert(_el$, _$createComponent(Show, {
        get when() {
          return props.children;
        },
        get children() {
          var _el$3 = _$createElement("text");
          _$insert(_el$3, () => props.children);
          _$effect(_$p => _$setProp(_el$3, "fg", color(), _$p));
          return _el$3;
        }
      }), null);
      _$effect(_$p => _$setProp(_el$2, "color", color(), _$p));
      return _el$;
    }
  });
}