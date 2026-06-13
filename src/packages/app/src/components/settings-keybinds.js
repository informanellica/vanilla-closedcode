import { createComponent, createEffect, createMemo, onCleanup, onMount } from "solid-js";
import { createStore } from "solid-js/store";
import { makeEventListener } from "../lib/primitives/event-listener.js";
import { Button } from "@/bs/button.js";
import { Icon } from "@/bs/icon.js";
import { IconButton } from "@/bs/icon-button.js";
import { TextField } from "@/bs/text-field.js";
import { showToast } from "@/lib/toast.js";
import fuzzysort from "fuzzysort";
import { formatKeybind, parseKeybind, useCommand } from "@/context/command.js";
import { useLanguage } from "@/context/language.js";
import { useSettings } from "@/context/settings.js";
import { SettingsList } from "./settings-list.js";

const IS_MAC = typeof navigator === "object" && /(Mac|iPod|iPhone|iPad)/.test(navigator.platform);
const PALETTE_ID = "command.palette";
const DEFAULT_PALETTE_KEYBIND = "mod+shift+p";
const GROUPS = ["General", "Session", "Navigation", "Model and agent", "Terminal", "Prompt"];
const groupKey = {
  General: "settings.shortcuts.group.general",
  Session: "settings.shortcuts.group.session",
  Navigation: "settings.shortcuts.group.navigation",
  "Model and agent": "settings.shortcuts.group.modelAndAgent",
  Terminal: "settings.shortcuts.group.terminal",
  Prompt: "settings.shortcuts.group.prompt"
};
function groupFor(id) {
  if (id === PALETTE_ID) return "General";
  if (id.startsWith("terminal.")) return "Terminal";
  if (id.startsWith("model.") || id.startsWith("agent.") || id.startsWith("mcp.")) return "Model and agent";
  if (id.startsWith("file.") || id.startsWith("fileTree.")) return "Navigation";
  if (id.startsWith("prompt.")) return "Prompt";
  if (id.startsWith("session.") || id.startsWith("message.") || id.startsWith("permissions.") || id.startsWith("steps.") || id.startsWith("review.")) return "Session";
  return "General";
}
function isModifier(key) {
  return key === "Shift" || key === "Control" || key === "Alt" || key === "Meta";
}
function normalizeKey(key) {
  if (key === ",") return "comma";
  if (key === "+") return "plus";
  if (key === " ") return "space";
  return key.toLowerCase();
}
function recordKeybind(event) {
  if (isModifier(event.key)) return;
  const parts = [];
  const mod = IS_MAC ? event.metaKey : event.ctrlKey;
  if (mod) parts.push("mod");
  if (IS_MAC && event.ctrlKey) parts.push("ctrl");
  if (!IS_MAC && event.metaKey) parts.push("meta");
  if (event.altKey) parts.push("alt");
  if (event.shiftKey) parts.push("shift");
  const key = normalizeKey(event.key);
  if (!key) return;
  parts.push(key);
  return parts.join("+");
}
function signatures(config) {
  if (!config) return [];
  const sigs = [];
  for (const kb of parseKeybind(config)) {
    const parts = [];
    if (kb.ctrl) parts.push("ctrl");
    if (kb.alt) parts.push("alt");
    if (kb.shift) parts.push("shift");
    if (kb.meta) parts.push("meta");
    if (kb.key) parts.push(kb.key);
    if (parts.length === 0) continue;
    sigs.push(parts.join("+"));
  }
  return sigs;
}
function keybinds(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}
function listFor(command, map, palette) {
  const out = new Map();
  out.set(PALETTE_ID, {
    title: palette,
    group: "General"
  });
  for (const opt of command.catalog) {
    if (opt.id.startsWith("suggested.")) continue;
    out.set(opt.id, {
      title: opt.title,
      group: groupFor(opt.id)
    });
  }
  for (const opt of command.options) {
    if (opt.id.startsWith("suggested.")) continue;
    out.set(opt.id, {
      title: opt.title,
      group: groupFor(opt.id)
    });
  }
  for (const [id, value] of Object.entries(map)) {
    if (typeof value !== "string") continue;
    if (out.has(id)) continue;
    out.set(id, {
      title: id,
      group: groupFor(id)
    });
  }
  return out;
}
function groupedFor(list) {
  const out = new Map();
  for (const group of GROUPS) out.set(group, []);
  for (const [id, item] of list) {
    const ids = out.get(item.group);
    if (!ids) continue;
    ids.push(id);
  }
  for (const group of GROUPS) {
    const ids = out.get(group);
    if (!ids) continue;
    ids.sort((a, b) => (list.get(a)?.title ?? "").localeCompare(list.get(b)?.title ?? ""));
  }
  return out;
}
function filteredFor(query, list, grouped, keybind) {
  const value = query.toLowerCase().trim();
  if (!value) return grouped;
  const out = new Map();
  for (const group of GROUPS) out.set(group, []);
  const items = Array.from(list.entries()).map(([id, meta]) => ({
    id,
    title: meta.title,
    group: meta.group,
    keybind: keybind(id)
  }));
  const results = fuzzysort.go(value, items, {
    keys: ["title", "keybind"],
    threshold: -10000
  });
  for (const result of results) {
    const ids = out.get(result.obj.group);
    if (!ids) continue;
    ids.push(result.obj.id);
  }
  return out;
}
function useKeyCapture(input) {
  onMount(() => {
    const handle = event => {
      const id = input.active();
      if (!id) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      if (event.key === "Escape") {
        input.stop();
        return;
      }
      const clear = (event.key === "Backspace" || event.key === "Delete") && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey;
      if (clear) {
        input.set(id, "none");
        input.stop();
        return;
      }
      const next = recordKeybind(event);
      if (!next) return;
      const conflicts = new Map();
      for (const sig of signatures(next)) {
        for (const item of input.used().get(sig) ?? []) {
          if (item.id === id) continue;
          conflicts.set(item.id, item.title);
        }
      }
      if (conflicts.size > 0) {
        showToast({
          title: input.language.t("settings.shortcuts.conflict.title"),
          description: input.language.t("settings.shortcuts.conflict.description", {
            keybind: formatKeybind(next, input.language.t),
            titles: [...conflicts.values()].join(", ")
          })
        });
        return;
      }
      input.set(id, next);
      input.stop();
    };
    makeEventListener(document, "keydown", handle, {
      capture: true
    });
  });
}

function template(html) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html.trim();
  return wrapper.firstElementChild;
}

export const SettingsKeybinds = () => {
  const command = useCommand();
  const language = useLanguage();
  const settings = useSettings();
  const [store, setStore] = createStore({
    active: null,
    filter: ""
  });
  const stop = () => {
    if (!store.active) return;
    setStore("active", null);
    command.keybinds(true);
  };
  const start = id => {
    if (store.active === id) {
      stop();
      return;
    }
    if (store.active) stop();
    setStore("active", id);
    command.keybinds(false);
  };
  const map = createMemo(() => keybinds(settings.current.keybinds));
  const hasOverrides = createMemo(() => Object.values(map()).some(x => typeof x === "string"));
  const resetAll = () => {
    stop();
    settings.keybinds.resetAll();
    showToast({
      title: language.t("settings.shortcuts.reset.toast.title"),
      description: language.t("settings.shortcuts.reset.toast.description")
    });
  };
  const list = createMemo(() => {
    language.locale();
    return listFor(command, map(), language.t("command.palette"));
  });
  const title = id => list().get(id)?.title ?? "";
  const grouped = createMemo(() => groupedFor(list()));
  const filtered = createMemo(() => {
    return filteredFor(store.filter, list(), grouped(), id => command.keybind(id) || "");
  });
  const hasResults = createMemo(() => {
    for (const group of GROUPS) {
      const ids = filtered().get(group) ?? [];
      if (ids.length > 0) return true;
    }
    return false;
  });
  const used = createMemo(() => {
    const map = new Map();
    const add = (key, value) => {
      const list = map.get(key);
      if (!list) {
        map.set(key, [value]);
        return;
      }
      list.push(value);
    };
    const palette = settings.keybinds.get(PALETTE_ID) ?? DEFAULT_PALETTE_KEYBIND;
    for (const sig of signatures(palette)) {
      add(sig, {
        id: PALETTE_ID,
        title: title(PALETTE_ID)
      });
    }
    const valueFor = id => {
      const custom = settings.keybinds.get(id);
      if (typeof custom === "string") return custom;
      const live = command.options.find(x => x.id === id);
      if (live?.keybind) return live.keybind;
      const meta = command.catalog.find(x => x.id === id);
      return meta?.keybind;
    };
    for (const id of list().keys()) {
      if (id === PALETTE_ID) continue;
      for (const sig of signatures(valueFor(id))) {
        add(sig, {
          id,
          title: title(id)
        });
      }
    }
    return map;
  });
  const setKeybind = (id, keybind) => settings.keybinds.set(id, keybind);
  useKeyCapture({
    active: () => store.active,
    stop,
    set: setKeybind,
    used,
    language
  });
  onCleanup(() => {
    if (store.active) command.keybinds(true);
  });

  const root = template(`
    <div class="d-flex flex-column h-full overflow-y-auto no-scrollbar px-4 pb-10 sm:px-10 sm:pb-10">
      <div class="sticky top-0 z-10 bg-[linear-gradient(to_bottom,var(--surface-stronger-non-alpha)_calc(100%_-_24px),transparent)]">
        <div class="d-flex flex-column gap-4 pt-6 pb-6 max-w-[720px]">
          <div class="d-flex align-items-center justify-content-between gap-4">
            <h2 class="fs-6 fw-medium text-body-emphasis" data-slot="title"></h2>
            <div style="display: contents" data-slot="reset"></div>
          </div>
          <div class="d-flex align-items-center gap-2 px-3 h-9 rounded-3 bg-body-tertiary" data-slot="search"></div>
        </div>
      </div>
      <div class="d-flex flex-column gap-8 max-w-[720px]" data-slot="content"></div>
    </div>`);
  const titleEl = root.querySelector('[data-slot="title"]');
  const resetSlot = root.querySelector('[data-slot="reset"]');
  const search = root.querySelector('[data-slot="search"]');
  const content = root.querySelector('[data-slot="content"]');

  createEffect(() => { titleEl.textContent = language.t("settings.shortcuts.title"); });

  // Reset-all button: the vanilla Button renders children once, so rebuild it
  // when the label (locale) changes; disabled tracks hasOverrides reactively.
  createEffect(() => {
    const label = language.t("settings.shortcuts.reset.button");
    resetSlot.replaceChildren(createComponent(Button, {
      size: "small",
      variant: "secondary",
      onClick: resetAll,
      get disabled() { return !hasOverrides(); },
      get children() { return label; }
    }));
  });

  search.appendChild(createComponent(Icon, {
    name: "magnifying-glass",
    class: "text-secondary flex-shrink-0"
  }));
  search.appendChild(createComponent(TextField, {
    variant: "ghost",
    type: "text",
    get value() { return store.filter; },
    onChange: v => setStore("filter", v),
    get placeholder() { return language.t("settings.shortcuts.search.placeholder"); },
    spellcheck: false,
    autocorrect: "off",
    autocomplete: "off",
    autocapitalize: "off",
    class: "flex-fill"
  }));
  const clearSlot = document.createElement("div");
  clearSlot.style.display = "contents";
  search.appendChild(clearSlot);
  createEffect(() => {
    if (store.filter) {
      clearSlot.replaceChildren(createComponent(IconButton, {
        icon: "circle-x",
        variant: "ghost",
        onClick: () => setStore("filter", "")
      }));
    } else {
      clearSlot.replaceChildren();
    }
  });

  const buildRow = id => {
    const row = template(`
      <div class="d-flex align-items-center justify-content-between gap-4 p-4 rounded-3 bg-body-tertiary">
        <span class="fw-normal text-body-emphasis" data-slot="name"></span>
        <button type="button" data-slot="bind"></button>
      </div>`);
    row.querySelector('[data-slot="name"]').textContent = title(id);
    const btn = row.querySelector('[data-slot="bind"]');
    btn.setAttribute("data-keybind-id", id);
    btn.addEventListener("click", () => start(id));
    // The recording state changes the label and the styling of THIS row only.
    createEffect(() => {
      const recording = store.active === id;
      btn.textContent = recording
        ? language.t("settings.shortcuts.pressKeys")
        : (command.keybind(id) || language.t("settings.shortcuts.unassigned"));
      btn.className = "h-8 px-3 rounded-2 small fw-normal " + (recording
        ? "border bg-body-tertiary text-secondary"
        : "bg-body-tertiary text-body-secondary");
    });
    return row;
  };

  // Grouped shortcut list + the empty-search state. Rebuilt when the filter
  // result set or the locale changes; per-row recording state stays reactive
  // through each row's own effect.
  createEffect(() => {
    const sections = [];
    for (const group of GROUPS) {
      const ids = filtered().get(group) ?? [];
      if (ids.length === 0) continue;
      const section = template(`
        <div class="d-flex flex-column gap-1">
          <h3 class="fw-medium text-body-emphasis pb-2" data-slot="group"></h3>
        </div>`);
      section.querySelector('[data-slot="group"]').textContent = language.t(groupKey[group]);
      section.appendChild(createComponent(SettingsList, { children: ids.map(buildRow) }));
      sections.push(section);
    }
    if (store.filter && !hasResults()) {
      const empty = template(`
        <div class="d-flex flex-column align-items-center justify-content-center py-12 text-center">
          <span class="fw-normal text-secondary" data-slot="message"></span>
          <span class="fw-normal text-body-emphasis mt-1" data-slot="query"></span>
        </div>`);
      empty.querySelector('[data-slot="message"]').textContent = language.t("settings.shortcuts.search.empty");
      empty.querySelector('[data-slot="query"]').textContent = `"${store.filter}"`;
      sections.push(empty);
    }
    content.replaceChildren(...sections);
  });

  return root;
};
