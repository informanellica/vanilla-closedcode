import { createMemo } from "solid-js";
import { Keybind } from "@/util/keybind.js";
import { pipe, mapValues } from "remeda";
import { createStore } from "solid-js/store";
import { useKeyboard, useRenderer } from "@opentui/solid";
import { createSimpleContext } from "./helper.js";
import { useTuiConfig } from "./tui-config.js";
export const {
  use: useKeybind,
  provider: KeybindProvider
} = createSimpleContext({
  name: "Keybind",
  init: () => {
    const config = useTuiConfig();
    const keybinds = createMemo(() => {
      return pipe(config.keybinds ?? {}, mapValues(value => Keybind.parse(value)));
    });
    const [store, setStore] = createStore({
      leader: false
    });
    const renderer = useRenderer();
    let focus;
    let timeout;
    function leader(active) {
      if (active) {
        setStore("leader", true);
        focus = renderer.currentFocusedRenderable;
        focus?.blur();
        if (timeout) clearTimeout(timeout);
        timeout = setTimeout(() => {
          if (!store.leader) return;
          leader(false);
          if (!focus || focus.isDestroyed) return;
          focus.focus();
        }, 2000);
        return;
      }
      if (!active) {
        if (focus && !renderer.currentFocusedRenderable) {
          focus.focus();
        }
        setStore("leader", false);
      }
    }
    useKeyboard(async evt => {
      if (!store.leader && result.match("leader", evt)) {
        leader(true);
        return;
      }
      if (store.leader && evt.name) {
        setImmediate(() => {
          if (focus && renderer.currentFocusedRenderable === focus) {
            focus.focus();
          }
          leader(false);
        });
      }
    });
    const result = {
      get all() {
        return keybinds();
      },
      get leader() {
        return store.leader;
      },
      parse(evt) {
        // Handle special case for Ctrl+Underscore (represented as \x1F)
        if (evt.name === "\x1F") {
          return Keybind.fromParsedKey({
            ...evt,
            name: "_",
            ctrl: true
          }, store.leader);
        }
        return Keybind.fromParsedKey(evt, store.leader);
      },
      match(key, evt) {
        const list = keybinds()[key] ?? Keybind.parse(key);
        if (!list.length) return false;
        const parsed = result.parse(evt);
        for (const item of list) {
          if (Keybind.match(item, parsed)) {
            return true;
          }
        }
        return false;
      },
      print(key) {
        const first = keybinds()[key]?.at(0) ?? Keybind.parse(key).at(0);
        if (!first) return "";
        const text = Keybind.toString(first);
        const lead = keybinds().leader?.[0];
        if (!lead) return text;
        return text.replace("<leader>", Keybind.toString(lead));
      }
    };
    return result;
  }
});