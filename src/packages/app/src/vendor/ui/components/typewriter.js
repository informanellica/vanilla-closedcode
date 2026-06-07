import { template as _$template } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
import { effect as _$effect } from "solid-js/web";
import { memo as _$memo } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<span>│`);
import { createEffect, onCleanup, Show } from "solid-js";
import { createStore } from "solid-js/store";
import { Dynamic } from "solid-js/web";
export const Typewriter = props => {
  const [store, setStore] = createStore({
    typing: false,
    displayed: "",
    cursor: true
  });
  createEffect(() => {
    const text = props.text;
    if (!text) return;
    let i = 0;
    const timeouts = [];
    setStore("typing", true);
    setStore("displayed", "");
    setStore("cursor", true);
    const getTypingDelay = () => {
      const random = Math.random();
      if (random < 0.05) return 150 + Math.random() * 100;
      if (random < 0.15) return 80 + Math.random() * 60;
      return 30 + Math.random() * 50;
    };
    const type = () => {
      if (i < text.length) {
        setStore("displayed", text.slice(0, i + 1));
        i++;
        timeouts.push(setTimeout(type, getTypingDelay()));
      } else {
        setStore("typing", false);
        timeouts.push(setTimeout(() => setStore("cursor", false), 2000));
      }
    };
    timeouts.push(setTimeout(type, 200));
    onCleanup(() => {
      for (const timeout of timeouts) clearTimeout(timeout);
    });
  });
  return _$createComponent(Dynamic, {
    get component() {
      return props.as || "p";
    },
    get ["class"]() {
      return props.class;
    },
    get children() {
      return [_$memo(() => store.displayed), _$createComponent(Show, {
        get when() {
          return store.cursor;
        },
        get children() {
          var _el$ = _tmpl$();
          _$effect(() => _el$.classList.toggle("blinking-cursor", !store.typing));
          return _el$;
        }
      })];
    }
  });
};