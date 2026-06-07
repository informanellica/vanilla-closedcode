import { template as _$template } from "solid-js/web";
import { mergeProps as _$mergeProps } from "solid-js/web";
import { memo as _$memo } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<div data-action=settings-auto-accept-permissions>`),
  _tmpl$2 = /*#__PURE__*/_$template(`<div data-action=settings-feed-reasoning-summaries>`),
  _tmpl$3 = /*#__PURE__*/_$template(`<div data-action=settings-feed-shell-tool-parts-expanded>`),
  _tmpl$4 = /*#__PURE__*/_$template(`<div data-action=settings-feed-edit-tool-parts-expanded>`),
  _tmpl$5 = /*#__PURE__*/_$template(`<div data-action=settings-show-session-progress-bar>`),
  _tmpl$6 = /*#__PURE__*/_$template(`<div class="d-flex flex-column gap-1">`),
  _tmpl$7 = /*#__PURE__*/_$template(`<div data-action=settings-show-file-tree>`),
  _tmpl$8 = /*#__PURE__*/_$template(`<div data-action=settings-show-navigation>`),
  _tmpl$9 = /*#__PURE__*/_$template(`<div data-action=settings-show-search>`),
  _tmpl$0 = /*#__PURE__*/_$template(`<div data-action=settings-show-terminal>`),
  _tmpl$1 = /*#__PURE__*/_$template(`<div data-action=settings-show-status>`),
  _tmpl$10 = /*#__PURE__*/_$template(`<div class="d-flex flex-column gap-1"><h3 class="fw-medium text-body-emphasis pb-2">`),
  _tmpl$11 = /*#__PURE__*/_$template(`<div style="width:220px;max-width:100%">`),
  _tmpl$12 = /*#__PURE__*/_$template(`<div data-action=settings-notifications-agent>`),
  _tmpl$13 = /*#__PURE__*/_$template(`<div data-action=settings-notifications-permissions>`),
  _tmpl$14 = /*#__PURE__*/_$template(`<div data-action=settings-notifications-errors>`),
  _tmpl$15 = /*#__PURE__*/_$template(`<div data-action=settings-updates-startup>`),
  _tmpl$16 = /*#__PURE__*/_$template(`<div data-action=settings-release-notes>`),
  _tmpl$17 = /*#__PURE__*/_$template(`<div data-action=settings-wayland>`),
  _tmpl$18 = /*#__PURE__*/_$template(`<div class="d-flex flex-column h-full overflow-y-auto no-scrollbar px-4 pb-10 sm:px-10 sm:pb-10"><div class="sticky top-0 z-10 bg-[linear-gradient(to_bottom,var(--surface-stronger-non-alpha)_calc(100%_-_24px),transparent)]"><div class="d-flex flex-column gap-1 pt-6 pb-8"><h2 class="fs-6 fw-medium text-body-emphasis"></h2></div></div><div class="d-flex flex-column gap-8 w-100">`),
  _tmpl$19 = /*#__PURE__*/_$template(`<span class=text-secondary>`),
  _tmpl$20 = /*#__PURE__*/_$template(`<div class="d-flex align-items-center gap-2"><span>`),
  _tmpl$21 = /*#__PURE__*/_$template(`<div class="d-flex align-items-center gap-4 p-4 rounded-3 bg-body-tertiary"><div class="d-flex min-w-0 flex-1 flex-column gap-0.5"><span class="fw-medium text-body-emphasis"></span><span class="small fw-normal text-secondary"></span></div><div class="d-flex justify-content-end flex-shrink-0">`);
import { Show, createMemo, createResource, onMount } from "solid-js";
import { createStore } from "solid-js/store";
import { Button } from "@/bs/button.js";
import { Icon } from "@/bs/icon.js";
import { Select } from "@/bs/select.js";
import { Switch } from "@/bs/switch.js";
import { TextField } from "@/bs/text-field.js";
import { Tooltip } from "@/bs/tooltip.js";
import { env, envAll } from "@/lib/env.js";
import { useTheme } from "@/lib/theme.js";
import { showToast } from "@/lib/toast.js";
import { useParams } from "@solidjs/router";
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
  const GeneralSection = () => (() => {
    var _el$ = _tmpl$6();
    _$insert(_el$, _$createComponent(SettingsList, {
      get children() {
        return [_$createComponent(SettingsRow, {
          get title() {
            return language.t("settings.general.row.language.title");
          },
          get description() {
            return language.t("settings.general.row.language.description");
          },
          get children() {
            return _$createComponent(Select, {
              "data-action": "settings-language",
              get options() {
                return languageOptions();
              },
              get current() {
                return languageOptions().find(o => o.value === language.locale());
              },
              value: o => o.value,
              label: o => o.label,
              onSelect: option => option && language.setLocale(option.value),
              variant: "secondary",
              size: "small",
              triggerVariant: "settings"
            });
          }
        }), _$createComponent(SettingsRow, {
          get title() {
            return language.t("command.permissions.autoaccept.enable");
          },
          get description() {
            return language.t("toast.permissions.autoaccept.on.description");
          },
          get children() {
            var _el$2 = _tmpl$();
            _$insert(_el$2, _$createComponent(Switch, {
              get checked() {
                return accepting();
              },
              get disabled() {
                return !dir();
              },
              onChange: toggleAccept
            }));
            return _el$2;
          }
        }), _$createComponent(SettingsRow, {
          get title() {
            return language.t("settings.general.row.shell.title");
          },
          get description() {
            return language.t("settings.general.row.shell.description");
          },
          get children() {
            return _$createComponent(Select, {
              "data-action": "settings-shell",
              get options() {
                return shellOptions();
              },
              get current() {
                return shellOptions().find(o => o.value === currentShell()) ?? autoOption;
              },
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
            });
          }
        }), _$createComponent(SettingsRow, {
          get title() {
            return language.t("settings.general.row.reasoningSummaries.title");
          },
          get description() {
            return language.t("settings.general.row.reasoningSummaries.description");
          },
          get children() {
            var _el$3 = _tmpl$2();
            _$insert(_el$3, _$createComponent(Switch, {
              get checked() {
                return settings.general.showReasoningSummaries();
              },
              onChange: checked => settings.general.setShowReasoningSummaries(checked)
            }));
            return _el$3;
          }
        }), _$createComponent(SettingsRow, {
          get title() {
            return language.t("settings.general.row.shellToolPartsExpanded.title");
          },
          get description() {
            return language.t("settings.general.row.shellToolPartsExpanded.description");
          },
          get children() {
            var _el$4 = _tmpl$3();
            _$insert(_el$4, _$createComponent(Switch, {
              get checked() {
                return settings.general.shellToolPartsExpanded();
              },
              onChange: checked => settings.general.setShellToolPartsExpanded(checked)
            }));
            return _el$4;
          }
        }), _$createComponent(SettingsRow, {
          get title() {
            return language.t("settings.general.row.editToolPartsExpanded.title");
          },
          get description() {
            return language.t("settings.general.row.editToolPartsExpanded.description");
          },
          get children() {
            var _el$5 = _tmpl$4();
            _$insert(_el$5, _$createComponent(Switch, {
              get checked() {
                return settings.general.editToolPartsExpanded();
              },
              onChange: checked => settings.general.setEditToolPartsExpanded(checked)
            }));
            return _el$5;
          }
        }), _$createComponent(SettingsRow, {
          get title() {
            return language.t("settings.general.row.showSessionProgressBar.title");
          },
          get description() {
            return language.t("settings.general.row.showSessionProgressBar.description");
          },
          get children() {
            var _el$6 = _tmpl$5();
            _$insert(_el$6, _$createComponent(Switch, {
              get checked() {
                return settings.general.showSessionProgressBar();
              },
              onChange: checked => settings.general.setShowSessionProgressBar(checked)
            }));
            return _el$6;
          }
        }), _$createComponent(SettingsRow, {
          title: "Ollama GPU/CPU 配置を表示",
          description: "ステータスバーに、Ollama でロード中のモデルの VRAM/RAM 配置比率（GPU/CPU）を定期取得して表示します。",
          get children() {
            var _ollamaToggle = document.createElement("div");
            _ollamaToggle.setAttribute("data-action", "settings-ollama-stats");
            _$insert(_ollamaToggle, _$createComponent(Switch, {
              get checked() {
                return settings.general.ollamaStats();
              },
              onChange: checked => settings.general.setOllamaStats(checked)
            }));
            return _ollamaToggle;
          }
        })];
      }
    }));
    return _el$;
  })();
  const AdvancedSection = () => (() => {
    var _el$7 = _tmpl$10(),
      _el$8 = _el$7.firstChild;
    _$insert(_el$8, () => language.t("settings.general.section.advanced"));
    _$insert(_el$7, _$createComponent(SettingsList, {
      get children() {
        return [_$createComponent(SettingsRow, {
          get title() {
            return language.t("settings.general.row.showFileTree.title");
          },
          get description() {
            return language.t("settings.general.row.showFileTree.description");
          },
          get children() {
            var _el$9 = _tmpl$7();
            _$insert(_el$9, _$createComponent(Switch, {
              get checked() {
                return settings.general.showFileTree();
              },
              onChange: checked => settings.general.setShowFileTree(checked)
            }));
            return _el$9;
          }
        }), _$createComponent(SettingsRow, {
          get title() {
            return language.t("settings.general.row.showNavigation.title");
          },
          get description() {
            return language.t("settings.general.row.showNavigation.description");
          },
          get children() {
            var _el$0 = _tmpl$8();
            _$insert(_el$0, _$createComponent(Switch, {
              get checked() {
                return settings.general.showNavigation();
              },
              onChange: checked => settings.general.setShowNavigation(checked)
            }));
            return _el$0;
          }
        }), _$createComponent(SettingsRow, {
          get title() {
            return language.t("settings.general.row.showSearch.title");
          },
          get description() {
            return language.t("settings.general.row.showSearch.description");
          },
          get children() {
            var _el$1 = _tmpl$9();
            _$insert(_el$1, _$createComponent(Switch, {
              get checked() {
                return settings.general.showSearch();
              },
              onChange: checked => settings.general.setShowSearch(checked)
            }));
            return _el$1;
          }
        }), _$createComponent(SettingsRow, {
          get title() {
            return language.t("settings.general.row.showTerminal.title");
          },
          get description() {
            return language.t("settings.general.row.showTerminal.description");
          },
          get children() {
            var _el$10 = _tmpl$0();
            _$insert(_el$10, _$createComponent(Switch, {
              get checked() {
                return settings.general.showTerminal();
              },
              onChange: checked => settings.general.setShowTerminal(checked)
            }));
            return _el$10;
          }
        }), _$createComponent(SettingsRow, {
          get title() {
            return language.t("settings.general.row.showStatus.title");
          },
          get description() {
            return language.t("settings.general.row.showStatus.description");
          },
          get children() {
            var _el$11 = _tmpl$1();
            _$insert(_el$11, _$createComponent(Switch, {
              get checked() {
                return settings.general.showStatus();
              },
              onChange: checked => settings.general.setShowStatus(checked)
            }));
            return _el$11;
          }
        })];
      }
    }), null);
    return _el$7;
  })();
  const AppearanceSection = () => (() => {
    var _el$12 = _tmpl$10(),
      _el$13 = _el$12.firstChild;
    _$insert(_el$13, () => language.t("settings.general.section.appearance"));
    _$insert(_el$12, _$createComponent(SettingsList, {
      get children() {
        return [_$createComponent(SettingsRow, {
          get title() {
            return language.t("settings.general.row.colorScheme.title");
          },
          get description() {
            return language.t("settings.general.row.colorScheme.description");
          },
          get children() {
            return _$createComponent(Select, {
              "data-action": "settings-color-scheme",
              get options() {
                return colorSchemeOptions();
              },
              get current() {
                return colorSchemeOptions().find(o => o.value === theme.colorScheme());
              },
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
            });
          }
        }), _$createComponent(SettingsRow, {
          get title() {
            return language.t("settings.general.row.uiFont.title");
          },
          get description() {
            return language.t("settings.general.row.uiFont.description");
          },
          get children() {
            var _el$14 = _tmpl$11();
            _$insert(_el$14, _$createComponent(TextField, {
              "data-action": "settings-ui-font",
              get label() {
                return language.t("settings.general.row.uiFont.title");
              },
              hideLabel: true,
              type: "text",
              get value() {
                return sans();
              },
              onChange: value => settings.appearance.setUIFont(value),
              placeholder: sansDefault,
              spellcheck: false,
              autocorrect: "off",
              autocomplete: "off",
              autocapitalize: "off",
              "class": "small fw-normal",
              get style() {
                return {
                  "font-family": sansFontFamily(settings.appearance.uiFont())
                };
              }
            }));
            return _el$14;
          }
        }), _$createComponent(SettingsRow, {
          get title() {
            return language.t("settings.general.row.font.title");
          },
          get description() {
            return language.t("settings.general.row.font.description");
          },
          get children() {
            var _el$15 = _tmpl$11();
            _$insert(_el$15, _$createComponent(TextField, {
              "data-action": "settings-code-font",
              get label() {
                return language.t("settings.general.row.font.title");
              },
              hideLabel: true,
              type: "text",
              get value() {
                return mono();
              },
              onChange: value => settings.appearance.setFont(value),
              placeholder: monoDefault,
              spellcheck: false,
              autocorrect: "off",
              autocomplete: "off",
              autocapitalize: "off",
              "class": "small fw-normal",
              get style() {
                return {
                  "font-family": monoFontFamily(settings.appearance.font())
                };
              }
            }));
            return _el$15;
          }
        }), _$createComponent(SettingsRow, {
          get title() {
            return language.t("settings.general.row.terminalFont.title");
          },
          get description() {
            return language.t("settings.general.row.terminalFont.description");
          },
          get children() {
            var _el$16 = _tmpl$11();
            _$insert(_el$16, _$createComponent(TextField, {
              "data-action": "settings-terminal-font",
              get label() {
                return language.t("settings.general.row.terminalFont.title");
              },
              hideLabel: true,
              type: "text",
              get value() {
                return terminal();
              },
              onChange: value => settings.appearance.setTerminalFont(value),
              placeholder: terminalDefault,
              spellcheck: false,
              autocorrect: "off",
              autocomplete: "off",
              autocapitalize: "off",
              "class": "small fw-normal",
              get style() {
                return {
                  "font-family": terminalFontFamily(settings.appearance.terminalFont())
                };
              }
            }));
            return _el$16;
          }
        })];
      }
    }), null);
    return _el$12;
  })();
  const NotificationsSection = () => (() => {
    var _el$17 = _tmpl$10(),
      _el$18 = _el$17.firstChild;
    _$insert(_el$18, () => language.t("settings.general.section.notifications"));
    _$insert(_el$17, _$createComponent(SettingsList, {
      get children() {
        return [_$createComponent(SettingsRow, {
          get title() {
            return language.t("settings.general.notifications.agent.title");
          },
          get description() {
            return language.t("settings.general.notifications.agent.description");
          },
          get children() {
            var _el$19 = _tmpl$12();
            _$insert(_el$19, _$createComponent(Switch, {
              get checked() {
                return settings.notifications.agent();
              },
              onChange: checked => settings.notifications.setAgent(checked)
            }));
            return _el$19;
          }
        }), _$createComponent(SettingsRow, {
          get title() {
            return language.t("settings.general.notifications.permissions.title");
          },
          get description() {
            return language.t("settings.general.notifications.permissions.description");
          },
          get children() {
            var _el$20 = _tmpl$13();
            _$insert(_el$20, _$createComponent(Switch, {
              get checked() {
                return settings.notifications.permissions();
              },
              onChange: checked => settings.notifications.setPermissions(checked)
            }));
            return _el$20;
          }
        }), _$createComponent(SettingsRow, {
          get title() {
            return language.t("settings.general.notifications.errors.title");
          },
          get description() {
            return language.t("settings.general.notifications.errors.description");
          },
          get children() {
            var _el$21 = _tmpl$14();
            _$insert(_el$21, _$createComponent(Switch, {
              get checked() {
                return settings.notifications.errors();
              },
              onChange: checked => settings.notifications.setErrors(checked)
            }));
            return _el$21;
          }
        })];
      }
    }), null);
    return _el$17;
  })();
  const SoundsSection = () => (() => {
    var _el$22 = _tmpl$10(),
      _el$23 = _el$22.firstChild;
    _$insert(_el$23, () => language.t("settings.general.section.sounds"));
    _$insert(_el$22, _$createComponent(SettingsList, {
      get children() {
        return [_$createComponent(SettingsRow, {
          get title() {
            return language.t("settings.general.sounds.agent.title");
          },
          get description() {
            return language.t("settings.general.sounds.agent.description");
          },
          get children() {
            return _$createComponent(Select, _$mergeProps({
              "data-action": "settings-sounds-agent"
            }, () => soundSelectProps(() => settings.sounds.agentEnabled(), () => settings.sounds.agent(), value => settings.sounds.setAgentEnabled(value), id => settings.sounds.setAgent(id))));
          }
        }), _$createComponent(SettingsRow, {
          get title() {
            return language.t("settings.general.sounds.permissions.title");
          },
          get description() {
            return language.t("settings.general.sounds.permissions.description");
          },
          get children() {
            return _$createComponent(Select, _$mergeProps({
              "data-action": "settings-sounds-permissions"
            }, () => soundSelectProps(() => settings.sounds.permissionsEnabled(), () => settings.sounds.permissions(), value => settings.sounds.setPermissionsEnabled(value), id => settings.sounds.setPermissions(id))));
          }
        }), _$createComponent(SettingsRow, {
          get title() {
            return language.t("settings.general.sounds.errors.title");
          },
          get description() {
            return language.t("settings.general.sounds.errors.description");
          },
          get children() {
            return _$createComponent(Select, _$mergeProps({
              "data-action": "settings-sounds-errors"
            }, () => soundSelectProps(() => settings.sounds.errorsEnabled(), () => settings.sounds.errors(), value => settings.sounds.setErrorsEnabled(value), id => settings.sounds.setErrors(id))));
          }
        })];
      }
    }), null);
    return _el$22;
  })();
  const UpdatesSection = () => (() => {
    var _el$24 = _tmpl$10(),
      _el$25 = _el$24.firstChild;
    _$insert(_el$25, () => language.t("settings.general.section.updates"));
    _$insert(_el$24, _$createComponent(SettingsList, {
      get children() {
        return [_$createComponent(SettingsRow, {
          get title() {
            return language.t("settings.updates.row.startup.title");
          },
          get description() {
            return language.t("settings.updates.row.startup.description");
          },
          get children() {
            var _el$26 = _tmpl$15();
            _$insert(_el$26, _$createComponent(Switch, {
              get checked() {
                return settings.updates.startup();
              },
              get disabled() {
                return !platform.checkUpdate;
              },
              onChange: checked => settings.updates.setStartup(checked)
            }));
            return _el$26;
          }
        }), _$createComponent(SettingsRow, {
          get title() {
            return language.t("settings.general.row.releaseNotes.title");
          },
          get description() {
            return language.t("settings.general.row.releaseNotes.description");
          },
          get children() {
            var _el$27 = _tmpl$16();
            _$insert(_el$27, _$createComponent(Switch, {
              get checked() {
                return settings.general.releaseNotes();
              },
              onChange: checked => settings.general.setReleaseNotes(checked)
            }));
            return _el$27;
          }
        }), _$createComponent(SettingsRow, {
          get title() {
            return language.t("settings.updates.row.check.title");
          },
          get description() {
            return language.t("settings.updates.row.check.description");
          },
          get children() {
            return _$createComponent(Button, {
              size: "small",
              variant: "secondary",
              get disabled() {
                return store.checking || !platform.checkUpdate;
              },
              onClick: check,
              get children() {
                return _$memo(() => !!store.checking)() ? language.t("settings.updates.action.checking") : language.t("settings.updates.action.checkNow");
              }
            });
          }
        })];
      }
    }), null);
    return _el$24;
  })();
  console.log(envAll());
  return (() => {
    var _el$28 = _tmpl$18(),
      _el$29 = _el$28.firstChild,
      _el$30 = _el$29.firstChild,
      _el$31 = _el$30.firstChild,
      _el$32 = _el$29.nextSibling;
    _$insert(_el$31, () => language.t("settings.tab.general"));
    _$insert(_el$32, _$createComponent(GeneralSection, {}), null);
    _$insert(_el$32, _$createComponent(AppearanceSection, {}), null);
    _$insert(_el$32, _$createComponent(NotificationsSection, {}), null);
    _$insert(_el$32, _$createComponent(SoundsSection, {}), null);
    _$insert(_el$32, _$createComponent(UpdatesSection, {}), null);
    _$insert(_el$32, _$createComponent(Show, {
      get when() {
        return linux();
      },
      get children() {
        var _el$33 = _tmpl$10(),
          _el$34 = _el$33.firstChild;
        _$insert(_el$34, () => language.t("settings.general.section.display"));
        _$insert(_el$33, _$createComponent(SettingsList, {
          get children() {
            return _$createComponent(SettingsRow, {
              get title() {
                return (() => {
                  var _el$36 = _tmpl$20(),
                    _el$37 = _el$36.firstChild;
                  _$insert(_el$37, () => language.t("settings.general.row.wayland.title"));
                  _$insert(_el$36, _$createComponent(Tooltip, {
                    get value() {
                      return language.t("settings.general.row.wayland.tooltip");
                    },
                    placement: "top",
                    get children() {
                      var _el$38 = _tmpl$19();
                      _$insert(_el$38, _$createComponent(Icon, {
                        name: "help",
                        size: "small"
                      }));
                      return _el$38;
                    }
                  }), null);
                  return _el$36;
                })();
              },
              get description() {
                return language.t("settings.general.row.wayland.description");
              },
              get children() {
                var _el$35 = _tmpl$17();
                _$insert(_el$35, _$createComponent(Switch, {
                  get checked() {
                    return displayBackend.latest === "wayland";
                  },
                  onChange: onDisplayBackendChange
                }));
                return _el$35;
              }
            });
          }
        }), null);
        return _el$33;
      }
    }), null);
    _$insert(_el$32, _$createComponent(Show, {
      get when() {
        return _$memo(() => !!desktop())() && env("VITE_CLOSEDCODE_CHANNEL") === "beta";
      },
      get children() {
        return _$createComponent(AdvancedSection, {});
      }
    }), null);
    return _el$28;
  })();
};
const SettingsRow = props => {
  return (() => {
    var _el$39 = _tmpl$21(),
      _el$40 = _el$39.firstChild,
      _el$41 = _el$40.firstChild,
      _el$42 = _el$41.nextSibling,
      _el$43 = _el$40.nextSibling;
    _$insert(_el$41, () => props.title);
    _$insert(_el$42, () => props.description);
    _$insert(_el$43, () => props.children);
    return _el$39;
  })();
};