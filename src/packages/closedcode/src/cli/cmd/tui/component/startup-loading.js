import { effect as _$effect } from "@opentui/solid";
import { insertNode as _$insertNode } from "@opentui/solid";
import { insert as _$insert } from "@opentui/solid";
import { createComponent as _$createComponent } from "@opentui/solid";
import { setProp as _$setProp } from "@opentui/solid";
import { createElement as _$createElement } from "@opentui/solid";
import { createEffect, createMemo, createSignal, onCleanup, Show } from "solid-js";
import { useTheme } from "../context/theme.js";
import { Spinner } from "./spinner.js";
export function StartupLoading(props) {
  const theme = useTheme().theme;
  const [show, setShow] = createSignal(false);
  const text = createMemo(() => props.ready() ? "Finishing startup..." : "Loading plugins...");
  let wait;
  let hold;
  let stamp = 0;
  createEffect(() => {
    if (props.ready()) {
      if (wait) {
        clearTimeout(wait);
        wait = undefined;
      }
      if (!show()) return;
      if (hold) return;
      const left = 3000 - (Date.now() - stamp);
      if (left <= 0) {
        setShow(false);
        return;
      }
      hold = setTimeout(() => {
        hold = undefined;
        setShow(false);
      }, left).unref();
      return;
    }
    if (hold) {
      clearTimeout(hold);
      hold = undefined;
    }
    if (show()) return;
    if (wait) return;
    wait = setTimeout(() => {
      wait = undefined;
      stamp = Date.now();
      setShow(true);
    }, 500).unref();
  });
  onCleanup(() => {
    if (wait) clearTimeout(wait);
    if (hold) clearTimeout(hold);
  });
  return _$createComponent(Show, {
    get when() {
      return show();
    },
    get children() {
      var _el$ = _$createElement("box"),
        _el$2 = _$createElement("box");
      _$insertNode(_el$, _el$2);
      _$setProp(_el$, "position", "absolute");
      _$setProp(_el$, "zIndex", 5000);
      _$setProp(_el$, "left", 0);
      _$setProp(_el$, "right", 0);
      _$setProp(_el$, "bottom", 1);
      _$setProp(_el$, "justifyContent", "center");
      _$setProp(_el$, "alignItems", "center");
      _$setProp(_el$2, "paddingLeft", 1);
      _$setProp(_el$2, "paddingRight", 1);
      _$insert(_el$2, _$createComponent(Spinner, {
        get color() {
          return theme.textMuted;
        },
        get children() {
          return text();
        }
      }));
      _$effect(_$p => _$setProp(_el$2, "backgroundColor", theme.backgroundPanel, _$p));
      return _el$;
    }
  });
}