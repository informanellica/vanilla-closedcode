import { Button } from "@/bs/button.js";
import { Icon } from "@/bs/icon.js";
import { Select } from "@/bs/select.js";
import { Switch } from "@/bs/switch.js";
import { TextField } from "@/bs/text-field.js";
import { Tooltip } from "@/bs/tooltip.js";
import { createComponent, createEffect, createMemo, createResource } from "solid-js";
import { createStore } from "solid-js/store";
import { env, envAll } from "@/lib/env.js";
import { useTheme } from "@/lib/theme.js";
import { showToast } from "@/lib/toast.js";
import { useParams } from "../lib/router/index.js";
import { useLanguage } from "@/context/language.js";
import { usePermission } from "@/context/permission.js";
import { usePlatform } from "@/context/platform.js";
import { monoDefault, monoFontFamily, monoInput, sansDefault, sansFontFamily, sansInput, terminalDefault, terminalFontFamily, terminalInput, useSettings } from "@/context/settings.js";
import { useSettingsController } from "@/controllers/settings.js";
import { decode64 } from "@/utils/base64.js";
import { playSoundById, SOUND_OPTIONS } from "@/utils/sound.js";
import { Link } from "./link.js";
import { SettingsList } from "./settings-list.js";
let demoSoundState = {
  cleanup: undefined,
  timeout: undefined,
  run: 0
};
// To prevent audio from overlapping/playing very quickly when navigating the settings menus,
// delay the playback by 100ms during quick selection changes and pause existing sounds.
const stopDemoSound = () => {
  demoSoundState.run += 1;
  if (demoSoundState.cleanup) {
    demoSoundState.cleanup();
  }
  clearTimeout(demoSoundState.timeout);
  demoSoundState.cleanup = undefined;
};
const playDemoSound = id => {
  stopDemoSound();
  if (!id) return;
  const run = ++demoSoundState.run;
  demoSoundState.timeout = setTimeout(() => {
    void playSoundById(id).then(cleanup => {
      if (demoSoundState.run !== run) {
        cleanup?.();
        return;
      }
      demoSoundState.cleanup = cleanup;
    });
  }, 100);
};

function template(html) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html.trim();
  return wrapper.firstElementChild;
}

export const SettingsGeneral = () => {
  const theme = useTheme();
  const language = useLanguage();
  const permission = usePermission();
  const platform = usePlatform();
  const params = useParams();
  const settings = useSettings();
  const [store, setStore] = createStore({
    checking: false
  });
  const linux = createMemo(() => platform.platform === "desktop" && platform.os === "linux");
  const dir = createMemo(() => decode64(params.dir));
  const accepting = createMemo(() => {
    const value = dir();
    if (!value) return false;
    if (!params.id) return permission.isAutoAcceptingDirectory(value);
    return permission.isAutoAccepting(params.id, value);
  });
  const toggleAccept = checked => {
    const value = dir();
    if (!value) return;
    if (!params.id) {
      if (permission.isAutoAcceptingDirectory(value) === checked) return;
      permission.toggleAutoAcceptDirectory(value);
      return;
    }
    if (checked) {
      permission.enableAutoAccept(params.id, value);
      return;
    }
    permission.disableAutoAccept(params.id, value);
  };
  const desktop = createMemo(() => platform.platform === "desktop");
  const check = () => {
    if (!platform.checkUpdate) return;
    setStore("checking", true);
    void platform.checkUpdate().then(result => {
      if (!result.updateAvailable) {
        showToast({
          variant: "success",
          icon: "circle-check",
          title: language.t("settings.updates.toast.latest.title"),
          description: language.t("settings.updates.toast.latest.description", {
            version: platform.version ?? ""
          })
        });
        return;
      }
      const actions = platform.updateAndRestart ? [{
        label: language.t("toast.update.action.installRestart"),
        onClick: async () => {
          await platform.updateAndRestart();
        }
      }, {
        label: language.t("toast.update.action.notYet"),
        onClick: "dismiss"
      }] : [{
        label: language.t("toast.update.action.notYet"),
        onClick: "dismiss"
      }];
      showToast({
        persistent: true,
        icon: "download",
        title: language.t("toast.update.title"),
        description: language.t("toast.update.description", {
          version: result.version ?? ""
        }),
        actions
      });
    }).catch(err => {
      const message = err instanceof Error ? err.message : String(err);
      showToast({
        title: language.t("common.requestFailed"),
        description: message
      });
    }).finally(() => setStore("checking", false));
  };
  const settingsController = useSettingsController();
  const shells = settingsController.shells;
  const currentShell = settingsController.currentShell;
  const [displayBackend, {
    refetch: refetchDisplayBackend
  }] = createResource(() => linux() && platform.getDisplayBackend ? true : false, () => Promise.resolve(platform.getDisplayBackend?.() ?? null).catch(() => null), {
    initialValue: null
  });
  const autoOption = {
    id: "auto",
    value: "",
    label: language.t("settings.general.row.shell.autoDefault")
  };
  const shellOptions = createMemo(() => {
    const list = shells.latest;
    const current = currentShell();
    const nameCounts = new Map();
    for (const s of list) {
      nameCounts.set(s.name, (nameCounts.get(s.name) || 0) + 1);
    }
    const options = [autoOption, ...list.map(s => {
      const ambiguousName = (nameCounts.get(s.name) || 0) > 1;
      const text = ambiguousName ? s.path : s.name;
      const label = s.acceptable ? text : `${text} (${language.t("settings.general.row.shell.terminalOnly")})`;
      return {
        id: s.path,
        // Prefer name over path - "bash" is much cleaner than the explicit full route even when it may change due to PATH.
        value: ambiguousName ? s.path : s.name,
        label
      };
    })];
    if (current && !options.some(o => o.value === current)) {
      options.push({
        id: current,
        value: current,
        label: current
      });
    }
    return options;
  });
  const onDisplayBackendChange = checked => {
    const update = platform.setDisplayBackend?.(checked ? "wayland" : "auto");
    if (!update) return;
    void update.finally(() => {
      void refetchDisplayBackend();
    });
  };
  const colorSchemeOptions = createMemo(() => [{
    value: "system",
    label: language.t("theme.scheme.system")
  }, {
    value: "light",
    label: language.t("theme.scheme.light")
  }, {
    value: "dark",
    label: language.t("theme.scheme.dark")
  }]);
  const languageOptions = createMemo(() => language.locales.map(locale => ({
    value: locale,
    label: language.label(locale)
  })));
  const noneSound = {
    id: "none",
    label: "sound.option.none"
  };
  const soundOptions = [noneSound, ...SOUND_OPTIONS];
  const mono = () => monoInput(settings.appearance.font());
  const sans = () => sansInput(settings.appearance.uiFont());
  const terminal = () => terminalInput(settings.appearance.terminalFont());
  const soundSelectProps = (enabled, current, setEnabled, set) => ({
    options: soundOptions,
    current: enabled() ? soundOptions.find(o => o.id === current()) ?? noneSound : noneSound,
    value: o => o.id,
    label: o => language.t(o.label),
    onHighlight: option => {
      if (!option) return;
      playDemoSound(option.id === "none" ? undefined : option.id);
    },
    onSelect: option => {
      if (!option) return;
      if (option.id === "none") {
        setEnabled(false);
        stopDemoSound();
        return;
      }
      setEnabled(true);
      set(option.id);
      playDemoSound(option.id);
    },
    variant: "secondary",
    size: "small",
    triggerVariant: "settings"
  });

  // ---- vanilla building blocks ----

  // A pass-through wrapper used as a stable insertion point for nodes that
  // need to be rebuilt by an effect.
  const contentsSlot = () => {
    const el = document.createElement("div");
    el.style.display = "contents";
    return el;
  };

  // Section box with a translated (locale-live) heading.
  const section = headingKey => {
    const el = template(`
      <div class="d-flex flex-column gap-1">
        <h3 class="fw-medium text-body-emphasis pb-2" data-slot="heading"></h3>
      </div>`);
    const heading = el.querySelector('[data-slot="heading"]');
    createEffect(() => {
      heading.textContent = language.t(headingKey);
    });
    return el;
  };

  // Standard row whose title/description come from i18n keys.
  const row = (titleKey, descriptionKey, control) => createComponent(SettingsRow, {
    get title() {
      return language.t(titleKey);
    },
    get description() {
      return language.t(descriptionKey);
    },
    children: control
  });

  // The vanilla Switch wires onChange twice: on its input (called with the
  // checked boolean) and, through its generic on* prop loop, on the container
  // (called with the bubbled change Event). Accept only the boolean call so a
  // toggle never runs the handler twice (a doubled toggleAccept would undo
  // itself; a doubled setter would store the Event object).
  const onSwitchToggle = handler => value => {
    if (typeof value === "boolean") handler(value);
  };

  // A switch inside its data-action wrapper. The vanilla Switch reads props
  // once, so keep the native checkbox in sync with the controlled value in an
  // effect — external changes (e.g. auto-accept toggled via a command) must
  // update the visual state like the original reactive Switch did.
  const switchBox = (action, props) => {
    const box = document.createElement("div");
    box.setAttribute("data-action", action);
    const sw = createComponent(Switch, {
      get checked() {
        return props.checked;
      },
      get disabled() {
        return props.disabled;
      },
      onChange: onSwitchToggle(props.onChange)
    });
    const input = sw.querySelector('input[data-slot="input"]');
    createEffect(() => {
      input.checked = !!props.checked;
      input.disabled = !!props.disabled;
    });
    box.appendChild(sw);
    return box;
  };

  // The vanilla Select builds its options/selection once, so rebuild it
  // whenever anything it renders (options, current, locale) changes. build()
  // is called inside the effect so its signal reads are tracked.
  const selectSlot = (action, build) => {
    const slot = contentsSlot();
    createEffect(() => {
      // Option label functions may resolve language.t lazily inside the
      // (untracked) component build, so track the locale explicitly.
      void language.locale();
      const sel = createComponent(Select, build());
      // Set as an attribute so [data-action=...] selectors keep working.
      sel.setAttribute("data-action", action);
      slot.replaceChildren(sel);
    });
    return slot;
  };

  const soundSelect = (action, enabled, current, setEnabled, set) => selectSlot(action, () => soundSelectProps(enabled, current, setEnabled, set));

  // Font input in its fixed-width box. Built once so typing never loses
  // focus; the live font preview is applied on the field root (it cascades
  // into the input) because the vanilla TextField ignores the style prop.
  const fontField = (action, labelKey, opts) => {
    const box = template(`<div style="width:220px;max-width:100%"></div>`);
    const field = createComponent(TextField, {
      get label() {
        return language.t(labelKey);
      },
      hideLabel: true,
      type: "text",
      get value() {
        return opts.value();
      },
      onChange: opts.onChange,
      placeholder: opts.placeholder,
      spellcheck: false,
      autocorrect: "off",
      autocomplete: "off",
      autocapitalize: "off",
      class: "small fw-normal"
    });
    field.setAttribute("data-action", action);
    createEffect(() => {
      field.style.fontFamily = opts.family() ?? "";
    });
    // The vanilla TextField reads value once; push external value changes
    // into the input like the original controlled binding did. The equality
    // guard keeps the caret stable while the user is typing (their own input
    // round-trips through the setting unchanged).
    const input = field.querySelector("input");
    createEffect(() => {
      const next = opts.value() ?? "";
      if (input.value !== next) input.value = next;
    });
    box.appendChild(field);
    return box;
  };

  // ---- sections ----

  const GeneralSection = () => {
    const el = template(`<div class="d-flex flex-column gap-1"></div>`);
    el.appendChild(createComponent(SettingsList, {
      children: [row("settings.general.row.language.title", "settings.general.row.language.description", selectSlot("settings-language", () => ({
        options: languageOptions(),
        current: languageOptions().find(o => o.value === language.locale()),
        value: o => o.value,
        label: o => o.label,
        onSelect: option => option && language.setLocale(option.value),
        variant: "secondary",
        size: "small",
        triggerVariant: "settings"
      }))), row("command.permissions.autoaccept.enable", "toast.permissions.autoaccept.on.description", switchBox("settings-auto-accept-permissions", {
        get checked() {
          return accepting();
        },
        get disabled() {
          return !dir();
        },
        onChange: toggleAccept
      })), row("settings.general.row.shell.title", "settings.general.row.shell.description", selectSlot("settings-shell", () => ({
        options: shellOptions(),
        current: shellOptions().find(o => o.value === currentShell()) ?? autoOption,
        value: o => o.id,
        label: o => o.label,
        onSelect: option => {
          if (!option) return;
          settingsController.setShell(option.value);
        },
        variant: "secondary",
        size: "small",
        triggerVariant: "settings",
        triggerStyle: {
          "min-width": "180px"
        }
      }))), row("settings.general.row.reasoningSummaries.title", "settings.general.row.reasoningSummaries.description", switchBox("settings-feed-reasoning-summaries", {
        get checked() {
          return settings.general.showReasoningSummaries();
        },
        onChange: checked => settings.general.setShowReasoningSummaries(checked)
      })), row("settings.general.row.shellToolPartsExpanded.title", "settings.general.row.shellToolPartsExpanded.description", switchBox("settings-feed-shell-tool-parts-expanded", {
        get checked() {
          return settings.general.shellToolPartsExpanded();
        },
        onChange: checked => settings.general.setShellToolPartsExpanded(checked)
      })), row("settings.general.row.editToolPartsExpanded.title", "settings.general.row.editToolPartsExpanded.description", switchBox("settings-feed-edit-tool-parts-expanded", {
        get checked() {
          return settings.general.editToolPartsExpanded();
        },
        onChange: checked => settings.general.setEditToolPartsExpanded(checked)
      })), row("settings.general.row.showSessionProgressBar.title", "settings.general.row.showSessionProgressBar.description", switchBox("settings-show-session-progress-bar", {
        get checked() {
          return settings.general.showSessionProgressBar();
        },
        onChange: checked => settings.general.setShowSessionProgressBar(checked)
      })), createComponent(SettingsRow, {
        title: "Ollama GPU/CPU 配置を表示",
        description: "ステータスバーに、Ollama でロード中のモデルの VRAM/RAM 配置比率（GPU/CPU）を定期取得して表示します。",
        children: switchBox("settings-ollama-stats", {
          get checked() {
            return settings.general.ollamaStats();
          },
          onChange: checked => settings.general.setOllamaStats(checked)
        })
      })]
    }));
    return el;
  };

  const AdvancedSection = () => {
    const el = section("settings.general.section.advanced");
    el.appendChild(createComponent(SettingsList, {
      children: [row("settings.general.row.showFileTree.title", "settings.general.row.showFileTree.description", switchBox("settings-show-file-tree", {
        get checked() {
          return settings.general.showFileTree();
        },
        onChange: checked => settings.general.setShowFileTree(checked)
      })), row("settings.general.row.showNavigation.title", "settings.general.row.showNavigation.description", switchBox("settings-show-navigation", {
        get checked() {
          return settings.general.showNavigation();
        },
        onChange: checked => settings.general.setShowNavigation(checked)
      })), row("settings.general.row.showSearch.title", "settings.general.row.showSearch.description", switchBox("settings-show-search", {
        get checked() {
          return settings.general.showSearch();
        },
        onChange: checked => settings.general.setShowSearch(checked)
      })), row("settings.general.row.showTerminal.title", "settings.general.row.showTerminal.description", switchBox("settings-show-terminal", {
        get checked() {
          return settings.general.showTerminal();
        },
        onChange: checked => settings.general.setShowTerminal(checked)
      })), row("settings.general.row.showStatus.title", "settings.general.row.showStatus.description", switchBox("settings-show-status", {
        get checked() {
          return settings.general.showStatus();
        },
        onChange: checked => settings.general.setShowStatus(checked)
      }))]
    }));
    return el;
  };

  const AppearanceSection = () => {
    const el = section("settings.general.section.appearance");
    el.appendChild(createComponent(SettingsList, {
      children: [row("settings.general.row.colorScheme.title", "settings.general.row.colorScheme.description", selectSlot("settings-color-scheme", () => ({
        options: colorSchemeOptions(),
        current: colorSchemeOptions().find(o => o.value === theme.colorScheme()),
        value: o => o.value,
        label: o => o.label,
        onSelect: option => option && theme.setColorScheme(option.value),
        onHighlight: option => {
          if (!option) return;
          theme.previewColorScheme(option.value);
          return () => theme.cancelPreview();
        },
        variant: "secondary",
        size: "small",
        triggerVariant: "settings",
        triggerStyle: {
          "min-width": "220px"
        }
      }))), row("settings.general.row.uiFont.title", "settings.general.row.uiFont.description", fontField("settings-ui-font", "settings.general.row.uiFont.title", {
        value: sans,
        onChange: value => settings.appearance.setUIFont(value),
        placeholder: sansDefault,
        family: () => sansFontFamily(settings.appearance.uiFont())
      })), row("settings.general.row.font.title", "settings.general.row.font.description", fontField("settings-code-font", "settings.general.row.font.title", {
        value: mono,
        onChange: value => settings.appearance.setFont(value),
        placeholder: monoDefault,
        family: () => monoFontFamily(settings.appearance.font())
      })), row("settings.general.row.terminalFont.title", "settings.general.row.terminalFont.description", fontField("settings-terminal-font", "settings.general.row.terminalFont.title", {
        value: terminal,
        onChange: value => settings.appearance.setTerminalFont(value),
        placeholder: terminalDefault,
        family: () => terminalFontFamily(settings.appearance.terminalFont())
      }))]
    }));
    return el;
  };

  const NotificationsSection = () => {
    const el = section("settings.general.section.notifications");
    el.appendChild(createComponent(SettingsList, {
      children: [row("settings.general.notifications.agent.title", "settings.general.notifications.agent.description", switchBox("settings-notifications-agent", {
        get checked() {
          return settings.notifications.agent();
        },
        onChange: checked => settings.notifications.setAgent(checked)
      })), row("settings.general.notifications.permissions.title", "settings.general.notifications.permissions.description", switchBox("settings-notifications-permissions", {
        get checked() {
          return settings.notifications.permissions();
        },
        onChange: checked => settings.notifications.setPermissions(checked)
      })), row("settings.general.notifications.errors.title", "settings.general.notifications.errors.description", switchBox("settings-notifications-errors", {
        get checked() {
          return settings.notifications.errors();
        },
        onChange: checked => settings.notifications.setErrors(checked)
      }))]
    }));
    return el;
  };

  const SoundsSection = () => {
    const el = section("settings.general.section.sounds");
    el.appendChild(createComponent(SettingsList, {
      children: [row("settings.general.sounds.agent.title", "settings.general.sounds.agent.description", soundSelect("settings-sounds-agent", () => settings.sounds.agentEnabled(), () => settings.sounds.agent(), value => settings.sounds.setAgentEnabled(value), id => settings.sounds.setAgent(id))), row("settings.general.sounds.permissions.title", "settings.general.sounds.permissions.description", soundSelect("settings-sounds-permissions", () => settings.sounds.permissionsEnabled(), () => settings.sounds.permissions(), value => settings.sounds.setPermissionsEnabled(value), id => settings.sounds.setPermissions(id))), row("settings.general.sounds.errors.title", "settings.general.sounds.errors.description", soundSelect("settings-sounds-errors", () => settings.sounds.errorsEnabled(), () => settings.sounds.errors(), value => settings.sounds.setErrorsEnabled(value), id => settings.sounds.setErrors(id)))]
    }));
    return el;
  };

  const UpdatesSection = () => {
    const el = section("settings.general.section.updates");
    // The vanilla Button renders its children once, so rebuild the check
    // button whenever its label (checking state or locale) changes.
    const checkSlot = contentsSlot();
    createEffect(() => {
      const label = store.checking ? language.t("settings.updates.action.checking") : language.t("settings.updates.action.checkNow");
      checkSlot.replaceChildren(createComponent(Button, {
        size: "small",
        variant: "secondary",
        get disabled() {
          return store.checking || !platform.checkUpdate;
        },
        onClick: check,
        get children() {
          return label;
        }
      }));
    });
    el.appendChild(createComponent(SettingsList, {
      children: [row("settings.updates.row.startup.title", "settings.updates.row.startup.description", switchBox("settings-updates-startup", {
        get checked() {
          return settings.updates.startup();
        },
        get disabled() {
          return !platform.checkUpdate;
        },
        onChange: checked => settings.updates.setStartup(checked)
      })), row("settings.general.row.releaseNotes.title", "settings.general.row.releaseNotes.description", switchBox("settings-release-notes", {
        get checked() {
          return settings.general.releaseNotes();
        },
        onChange: checked => settings.general.setReleaseNotes(checked)
      })), row("settings.updates.row.check.title", "settings.updates.row.check.description", checkSlot)]
    }));
    return el;
  };

  const DisplaySection = () => {
    const el = section("settings.general.section.display");
    // Row title: translated label + a help icon with a tooltip.
    const title = template(`<div class="d-flex align-items-center gap-2"><span data-slot="label"></span></div>`);
    const label = title.querySelector('[data-slot="label"]');
    createEffect(() => {
      label.textContent = language.t("settings.general.row.wayland.title");
    });
    const help = template(`<span class="text-secondary"></span>`);
    help.appendChild(createComponent(Icon, {
      name: "help",
      size: "small"
    }));
    title.appendChild(createComponent(Tooltip, {
      get value() {
        return language.t("settings.general.row.wayland.tooltip");
      },
      placement: "top",
      children: help
    }));
    // The backend resolves through an async resource, so rebuild the switch
    // whenever a (re)fetch settles; this also snaps the switch back if a
    // change request failed and the refetch returns the old value.
    const control = document.createElement("div");
    control.setAttribute("data-action", "settings-wayland");
    createEffect(() => {
      void displayBackend.loading;
      const backend = displayBackend.latest;
      control.replaceChildren(createComponent(Switch, {
        checked: backend === "wayland",
        onChange: onSwitchToggle(onDisplayBackendChange)
      }));
    });
    el.appendChild(createComponent(SettingsList, {
      children: createComponent(SettingsRow, {
        title,
        get description() {
          return language.t("settings.general.row.wayland.description");
        },
        children: control
      })
    }));
    return el;
  };

  console.log(envAll());

  const root = template(`
    <div class="d-flex flex-column h-full overflow-y-auto no-scrollbar px-4 pb-10 sm:px-10 sm:pb-10">
      <div class="sticky top-0 z-10 bg-[linear-gradient(to_bottom,var(--surface-stronger-non-alpha)_calc(100%_-_24px),transparent)]">
        <div class="d-flex flex-column gap-1 pt-6 pb-8">
          <h2 class="fs-6 fw-medium text-body-emphasis" data-slot="title"></h2>
        </div>
      </div>
      <div class="d-flex flex-column gap-8 w-100" data-slot="content"></div>
    </div>`);
  const titleEl = root.querySelector('[data-slot="title"]');
  const content = root.querySelector('[data-slot="content"]');
  createEffect(() => {
    titleEl.textContent = language.t("settings.tab.general");
  });
  content.appendChild(GeneralSection());
  content.appendChild(AppearanceSection());
  content.appendChild(NotificationsSection());
  content.appendChild(SoundsSection());
  content.appendChild(UpdatesSection());
  // Show: the display (Wayland) section only exists on desktop Linux.
  const displaySlot = contentsSlot();
  content.appendChild(displaySlot);
  createEffect(() => {
    if (linux()) {
      displaySlot.replaceChildren(DisplaySection());
    } else {
      displaySlot.replaceChildren();
    }
  });
  // Show: the advanced section only exists on the desktop beta channel.
  const advancedSlot = contentsSlot();
  content.appendChild(advancedSlot);
  createEffect(() => {
    if (desktop() && env("VITE_CLOSEDCODE_CHANNEL") === "beta") {
      advancedSlot.replaceChildren(AdvancedSection());
    } else {
      advancedSlot.replaceChildren();
    }
  });
  return root;
};
const SettingsRow = props => {
  const el = template(`
    <div class="d-flex align-items-center gap-4 p-4 rounded-3 bg-body-tertiary">
      <div class="d-flex min-w-0 flex-1 flex-column gap-0.5">
        <span class="fw-medium text-body-emphasis" data-slot="title"></span>
        <span class="small fw-normal text-secondary" data-slot="description"></span>
      </div>
      <div class="d-flex justify-content-end flex-shrink-0" data-slot="control"></div>
    </div>`);
  const titleEl = el.querySelector('[data-slot="title"]');
  const descriptionEl = el.querySelector('[data-slot="description"]');
  const controlEl = el.querySelector('[data-slot="control"]');
  // Title/description may be plain (translated) strings — set via textContent,
  // never innerHTML — or prebuilt DOM nodes (the Wayland row title).
  createEffect(() => {
    const title = props.title;
    if (title instanceof Node) titleEl.replaceChildren(title);
    else titleEl.textContent = title ?? "";
  });
  createEffect(() => {
    const description = props.description;
    if (description instanceof Node) descriptionEl.replaceChildren(description);
    else descriptionEl.textContent = description ?? "";
  });
  const children = props.children;
  const nodes = (Array.isArray(children) ? children : [children]).filter(child => child != null && typeof child !== "boolean");
  controlEl.replaceChildren(...nodes.map(child => child instanceof Node ? child : document.createTextNode(String(child))));
  return el;
};
