import { createSimpleContext } from "@/lib/context.js";
import { useDialog } from "@/lib/dialog.js";
import { createEffect, createMemo, onCleanup, onMount } from "solid-js";
import { createStore } from "solid-js/store";
import { makeEventListener } from "../lib/primitives/event-listener.js";
import { useLanguage } from "@/context/language.js";
import { useSettings } from "@/context/settings.js";
import { dict as en } from "@/i18n/en.js";
import { Persist, persisted } from "@/utils/persist.js";
import { env } from "@/lib/env.js";
const IS_MAC = typeof navigator === "object" && /(Mac|iPod|iPhone|iPad)/.test(navigator.platform);
const PALETTE_ID = "command.palette";
const DEFAULT_PALETTE_KEYBIND = "mod+shift+p";
const SUGGESTED_PREFIX = "suggested.";
const EDITABLE_KEYBIND_IDS = new Set(["terminal.toggle", "terminal.new", "file.attach"]);
function keyText(key, t) {
  return t ? t(key) : en[key];
}
function actionId(id) {
  if (!id.startsWith(SUGGESTED_PREFIX)) return id;
  return id.slice(SUGGESTED_PREFIX.length);
}
function normalizeKey(key) {
  if (key === ",") return "comma";
  if (key === "+") return "plus";
  if (key === " ") return "space";
  return key.toLowerCase();
}
function signature(key, ctrl, meta, shift, alt) {
  const mask = (ctrl ? 1 : 0) | (meta ? 2 : 0) | (shift ? 4 : 0) | (alt ? 8 : 0);
  return `${key}:${mask}`;
}
function signatureFromEvent(event) {
  return signature(normalizeKey(event.key), event.ctrlKey, event.metaKey, event.shiftKey, event.altKey);
}
function isAllowedEditableKeybind(id) {
  if (!id) return false;
  return EDITABLE_KEYBIND_IDS.has(actionId(id));
}
export function upsertCommandRegistration(registrations, entry) {
  if (entry.key === undefined) return [entry, ...registrations];
  return [entry, ...registrations.filter(x => x.key !== entry.key)];
}
export function parseKeybind(config) {
  if (!config || config === "none") return [];
  return config.split(",").map(combo => {
    const parts = combo.trim().toLowerCase().split("+");
    const keybind = {
      key: "",
      ctrl: false,
      meta: false,
      shift: false,
      alt: false
    };
    for (const part of parts) {
      switch (part) {
        case "ctrl":
        case "control":
          keybind.ctrl = true;
          break;
        case "meta":
        case "cmd":
        case "command":
          keybind.meta = true;
          break;
        case "mod":
          if (IS_MAC) keybind.meta = true;else keybind.ctrl = true;
          break;
        case "alt":
        case "option":
          keybind.alt = true;
          break;
        case "shift":
          keybind.shift = true;
          break;
        default:
          keybind.key = part;
          break;
      }
    }
    return keybind;
  });
}
export function matchKeybind(keybinds, event) {
  const eventKey = normalizeKey(event.key);
  for (const kb of keybinds) {
    const keyMatch = kb.key === eventKey;
    const ctrlMatch = kb.ctrl === (event.ctrlKey || false);
    const metaMatch = kb.meta === (event.metaKey || false);
    const shiftMatch = kb.shift === (event.shiftKey || false);
    const altMatch = kb.alt === (event.altKey || false);
    if (keyMatch && ctrlMatch && metaMatch && shiftMatch && altMatch) {
      return true;
    }
  }
  return false;
}
export function formatKeybind(config, t) {
  if (!config || config === "none") return "";
  const keybinds = parseKeybind(config);
  if (keybinds.length === 0) return "";
  const kb = keybinds[0];
  const parts = [];
  if (kb.ctrl) parts.push(IS_MAC ? "⌃" : keyText("common.key.ctrl", t));
  if (kb.alt) parts.push(IS_MAC ? "⌥" : keyText("common.key.alt", t));
  if (kb.shift) parts.push(IS_MAC ? "⇧" : keyText("common.key.shift", t));
  if (kb.meta) parts.push(IS_MAC ? "⌘" : keyText("common.key.meta", t));
  if (kb.key) {
    const keys = {
      arrowup: "↑",
      arrowdown: "↓",
      arrowleft: "←",
      arrowright: "→",
      comma: ",",
      plus: "+"
    };
    const named = {
      backspace: "common.key.backspace",
      delete: "common.key.delete",
      end: "common.key.end",
      enter: "common.key.enter",
      esc: "common.key.esc",
      escape: "common.key.esc",
      home: "common.key.home",
      insert: "common.key.insert",
      pagedown: "common.key.pageDown",
      pageup: "common.key.pageUp",
      space: "common.key.space",
      tab: "common.key.tab"
    };
    const key = kb.key.toLowerCase();
    const displayKey = keys[key] ?? (named[key] ? keyText(named[key], t) : key.length === 1 ? key.toUpperCase() : key.charAt(0).toUpperCase() + key.slice(1));
    parts.push(displayKey);
  }
  return IS_MAC ? parts.join("") : parts.join("+");
}
function isEditableTarget(target) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target.closest("[contenteditable='true']")) return true;
  if (target.closest("input, textarea, select")) return true;
  return false;
}
export const {
  use: useCommand,
  provider: CommandProvider
} = createSimpleContext({
  name: "Command",
  init: () => {
    const dialog = useDialog();
    const settings = useSettings();
    const language = useLanguage();
    const [store, setStore] = createStore({
      registrations: [],
      suspendCount: 0
    });
    const warnedDuplicates = new Set();
    const [catalog, setCatalog, _, catalogReady] = persisted(Persist.global("command.catalog.v1"), createStore({}));
    const bind = (id, def) => {
      const custom = settings.keybinds.get(actionId(id));
      const config = custom ?? def;
      if (!config || config === "none") return;
      return config;
    };
    const registered = createMemo(() => {
      const seen = new Set();
      const all = [];
      for (const reg of store.registrations) {
        for (const opt of reg.options()) {
          if (seen.has(opt.id)) {
            if (env("DEV") && !warnedDuplicates.has(opt.id)) {
              warnedDuplicates.add(opt.id);
              console.warn(`[command] duplicate command id "${opt.id}" registered; keeping first entry`);
            }
            continue;
          }
          seen.add(opt.id);
          all.push(opt);
        }
      }
      return all;
    });
    createEffect(() => {
      if (!catalogReady()) return;
      setCatalog(registered().reduce((acc, opt) => {
        const id = actionId(opt.id);
        acc[id] = {
          title: opt.title,
          description: opt.description,
          category: opt.category,
          keybind: opt.keybind,
          slash: opt.slash
        };
        return acc;
      }, {}));
    });
    const catalogOptions = createMemo(() => Object.entries(catalog).map(([id, meta]) => ({
      id,
      ...meta
    })));
    const options = createMemo(() => {
      const resolved = registered().map(opt => ({
        ...opt,
        keybind: bind(opt.id, opt.keybind)
      }));
      const suggested = resolved.filter(x => x.suggested && !x.disabled);
      return [...suggested.map(x => ({
        ...x,
        id: SUGGESTED_PREFIX + x.id,
        category: language.t("command.category.suggested")
      })), ...resolved];
    });
    const suspended = () => store.suspendCount > 0;
    const palette = createMemo(() => {
      const config = settings.keybinds.get(PALETTE_ID) ?? DEFAULT_PALETTE_KEYBIND;
      const keybinds = parseKeybind(config);
      return new Set(keybinds.map(kb => signature(kb.key, kb.ctrl, kb.meta, kb.shift, kb.alt)));
    });
    const keymap = createMemo(() => {
      const map = new Map();
      for (const option of options()) {
        if (option.id.startsWith(SUGGESTED_PREFIX)) continue;
        if (option.disabled) continue;
        if (!option.keybind) continue;
        const keybinds = parseKeybind(option.keybind);
        for (const kb of keybinds) {
          if (!kb.key) continue;
          const sig = signature(kb.key, kb.ctrl, kb.meta, kb.shift, kb.alt);
          if (map.has(sig)) continue;
          map.set(sig, option);
        }
      }
      return map;
    });
    const optionMap = createMemo(() => {
      const map = new Map();
      for (const option of options()) {
        map.set(option.id, option);
        map.set(actionId(option.id), option);
      }
      return map;
    });
    const run = (id, source) => {
      const option = optionMap().get(id);
      option?.onSelect?.(source);
    };
    const showPalette = () => {
      run("file.open", "palette");
    };
    const handleKeyDown = event => {
      if (suspended() || dialog.active) return;
      const sig = signatureFromEvent(event);
      const isPalette = palette().has(sig);
      const option = keymap().get(sig);
      const modified = event.ctrlKey || event.metaKey || event.altKey;
      const isTab = event.key === "Tab";
      if (isEditableTarget(event.target) && !isPalette && !isAllowedEditableKeybind(option?.id) && !modified && !isTab) return;
      if (isPalette) {
        event.preventDefault();
        showPalette();
        return;
      }
      if (!option) return;
      event.preventDefault();
      option.onSelect?.("keybind");
    };
    onMount(() => {
      makeEventListener(document, "keydown", handleKeyDown);
    });
    function register(key, cb) {
      const id = typeof key === "string" ? key : undefined;
      const next = typeof key === "function" ? key : cb;
      if (!next) return;
      const options = createMemo(next);
      const entry = {
        key: id,
        options
      };
      setStore("registrations", arr => upsertCommandRegistration(arr, entry));
      onCleanup(() => {
        setStore("registrations", arr => arr.filter(x => x !== entry));
      });
    }
    return {
      register,
      trigger(id, source) {
        run(id, source);
      },
      keybind(id) {
        if (id === PALETTE_ID) {
          return formatKeybind(settings.keybinds.get(PALETTE_ID) ?? DEFAULT_PALETTE_KEYBIND, language.t);
        }
        const base = actionId(id);
        const option = options().find(x => actionId(x.id) === base);
        if (option?.keybind) return formatKeybind(option.keybind, language.t);
        const meta = catalog[base];
        const config = bind(base, meta?.keybind);
        if (!config) return "";
        return formatKeybind(config, language.t);
      },
      show: showPalette,
      keybinds(enabled) {
        setStore("suspendCount", count => Math.max(0, count + (enabled ? -1 : 1)));
      },
      suspended,
      get catalog() {
        return catalogOptions();
      },
      get options() {
        return options();
      }
    };
  }
});