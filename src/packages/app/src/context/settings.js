import { createStore, reconcile } from "solid-js/store";
import { createEffect, createMemo } from "solid-js";
import { createSimpleContext } from "@/lib/context.js";
import { persisted } from "@/utils/persist.js";
export const monoDefault = "System Mono";
export const sansDefault = "System Sans";
export const terminalDefault = "JetBrainsMono Nerd Font Mono";
const monoFallback = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
const sansFallback = 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
const terminalFallback = '"JetBrainsMono Nerd Font Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
const monoBase = monoFallback;
const sansBase = sansFallback;
const terminalBase = terminalFallback;
function input(font) {
  return font ?? "";
}
function family(font) {
  if (/^[\w-]+$/.test(font)) return font;
  return `"${font.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}
function stack(font, base) {
  const value = font?.trim() ?? "";
  if (!value) return base;
  return `${family(value)}, ${base}`;
}
export function monoInput(font) {
  return input(font);
}
export function sansInput(font) {
  return input(font);
}
export function monoFontFamily(font) {
  return stack(font, monoBase);
}
export function sansFontFamily(font) {
  return stack(font, sansBase);
}
export function terminalInput(font) {
  return input(font);
}
export function terminalFontFamily(font) {
  return stack(font, terminalBase);
}
const defaultSettings = {
  general: {
    autoSave: true,
    releaseNotes: true,
    followup: "steer",
    showFileTree: false,
    showNavigation: false,
    showSearch: false,
    showStatus: false,
    showTerminal: false,
    showReasoningSummaries: false,
    shellToolPartsExpanded: false,
    editToolPartsExpanded: false,
    showSessionProgressBar: true,
    ollamaStats: false
  },
  updates: {
    startup: true
  },
  appearance: {
    fontSize: 14,
    mono: "",
    sans: "",
    terminal: ""
  },
  keybinds: {},
  permissions: {
    autoApprove: false
  },
  notifications: {
    agent: true,
    permissions: true,
    errors: false
  },
  sounds: {
    agentEnabled: true,
    agent: "staplebops-01",
    permissionsEnabled: true,
    permissions: "staplebops-02",
    errorsEnabled: true,
    errors: "nope-03"
  }
};
function withFallback(read, fallback) {
  return createMemo(() => read() ?? fallback);
}
export const {
  use: useSettings,
  provider: SettingsProvider
} = createSimpleContext({
  name: "Settings",
  init: () => {
    const [store, setStore, _, ready] = persisted("settings.v3", createStore(defaultSettings));
    createEffect(() => {
      if (typeof document === "undefined") return;
      const root = document.documentElement;
      root.style.setProperty("--font-family-mono", monoFontFamily(store.appearance?.mono));
      root.style.setProperty("--font-family-sans", sansFontFamily(store.appearance?.sans));
      root.style.setProperty("--editor-font-size", `${store.appearance?.fontSize ?? defaultSettings.appearance.fontSize}px`);
      // CodeMirror ships its own `font-family: monospace` rule, so the editor
      // ignores inherited fonts — pin it to our variables once, here, next to
      // the code that drives them (toolbar font/size selects).
      if (!document.getElementById("closedcode-editor-font")) {
        const style = document.createElement("style");
        style.id = "closedcode-editor-font";
        style.textContent = ".CodeMirror{font-family:var(--font-family-mono)!important;font-size:var(--editor-font-size,14px)!important;}";
        document.head.appendChild(style);
      }
    });
    createEffect(() => {
      if (store.general?.followup !== "queue") return;
      setStore("general", "followup", "steer");
    });
    return {
      ready,
      get current() {
        return store;
      },
      general: {
        autoSave: withFallback(() => store.general?.autoSave, defaultSettings.general.autoSave),
        setAutoSave(value) {
          setStore("general", "autoSave", value);
        },
        releaseNotes: withFallback(() => store.general?.releaseNotes, defaultSettings.general.releaseNotes),
        setReleaseNotes(value) {
          setStore("general", "releaseNotes", value);
        },
        followup: withFallback(() => store.general?.followup === "queue" ? "steer" : store.general?.followup, defaultSettings.general.followup),
        setFollowup(value) {
          setStore("general", "followup", value === "queue" ? "steer" : value);
        },
        showFileTree: withFallback(() => store.general?.showFileTree, defaultSettings.general.showFileTree),
        setShowFileTree(value) {
          setStore("general", "showFileTree", value);
        },
        showNavigation: withFallback(() => store.general?.showNavigation, defaultSettings.general.showNavigation),
        setShowNavigation(value) {
          setStore("general", "showNavigation", value);
        },
        showSearch: withFallback(() => store.general?.showSearch, defaultSettings.general.showSearch),
        setShowSearch(value) {
          setStore("general", "showSearch", value);
        },
        showStatus: withFallback(() => store.general?.showStatus, defaultSettings.general.showStatus),
        setShowStatus(value) {
          setStore("general", "showStatus", value);
        },
        showTerminal: withFallback(() => store.general?.showTerminal, defaultSettings.general.showTerminal),
        setShowTerminal(value) {
          setStore("general", "showTerminal", value);
        },
        showReasoningSummaries: withFallback(() => store.general?.showReasoningSummaries, defaultSettings.general.showReasoningSummaries),
        setShowReasoningSummaries(value) {
          setStore("general", "showReasoningSummaries", value);
        },
        shellToolPartsExpanded: withFallback(() => store.general?.shellToolPartsExpanded, defaultSettings.general.shellToolPartsExpanded),
        setShellToolPartsExpanded(value) {
          setStore("general", "shellToolPartsExpanded", value);
        },
        editToolPartsExpanded: withFallback(() => store.general?.editToolPartsExpanded, defaultSettings.general.editToolPartsExpanded),
        setEditToolPartsExpanded(value) {
          setStore("general", "editToolPartsExpanded", value);
        },
        showSessionProgressBar: withFallback(() => store.general?.showSessionProgressBar, defaultSettings.general.showSessionProgressBar),
        setShowSessionProgressBar(value) {
          setStore("general", "showSessionProgressBar", value);
        },
        ollamaStats: withFallback(() => store.general?.ollamaStats, defaultSettings.general.ollamaStats),
        setOllamaStats(value) {
          setStore("general", "ollamaStats", value);
        }
      },
      updates: {
        startup: withFallback(() => store.updates?.startup, defaultSettings.updates.startup),
        setStartup(value) {
          setStore("updates", "startup", value);
        }
      },
      appearance: {
        fontSize: withFallback(() => store.appearance?.fontSize, defaultSettings.appearance.fontSize),
        setFontSize(value) {
          setStore("appearance", "fontSize", value);
        },
        font: withFallback(() => store.appearance?.mono, defaultSettings.appearance.mono),
        setFont(value) {
          setStore("appearance", "mono", value.trim() ? value : "");
        },
        uiFont: withFallback(() => store.appearance?.sans, defaultSettings.appearance.sans),
        setUIFont(value) {
          setStore("appearance", "sans", value.trim() ? value : "");
        },
        terminalFont: withFallback(() => store.appearance?.terminal, defaultSettings.appearance.terminal),
        setTerminalFont(value) {
          setStore("appearance", "terminal", value.trim() ? value : "");
        }
      },
      keybinds: {
        get: action => store.keybinds?.[action],
        set(action, keybind) {
          setStore("keybinds", action, keybind);
        },
        reset(action) {
          setStore("keybinds", current => {
            if (!Object.prototype.hasOwnProperty.call(current, action)) return current;
            const next = {
              ...current
            };
            delete next[action];
            return next;
          });
        },
        resetAll() {
          setStore("keybinds", reconcile({}));
        }
      },
      permissions: {
        autoApprove: withFallback(() => store.permissions?.autoApprove, defaultSettings.permissions.autoApprove),
        setAutoApprove(value) {
          setStore("permissions", "autoApprove", value);
        }
      },
      notifications: {
        agent: withFallback(() => store.notifications?.agent, defaultSettings.notifications.agent),
        setAgent(value) {
          setStore("notifications", "agent", value);
        },
        permissions: withFallback(() => store.notifications?.permissions, defaultSettings.notifications.permissions),
        setPermissions(value) {
          setStore("notifications", "permissions", value);
        },
        errors: withFallback(() => store.notifications?.errors, defaultSettings.notifications.errors),
        setErrors(value) {
          setStore("notifications", "errors", value);
        }
      },
      sounds: {
        agentEnabled: withFallback(() => store.sounds?.agentEnabled, defaultSettings.sounds.agentEnabled),
        setAgentEnabled(value) {
          setStore("sounds", "agentEnabled", value);
        },
        agent: withFallback(() => store.sounds?.agent, defaultSettings.sounds.agent),
        setAgent(value) {
          setStore("sounds", "agent", value);
        },
        permissionsEnabled: withFallback(() => store.sounds?.permissionsEnabled, defaultSettings.sounds.permissionsEnabled),
        setPermissionsEnabled(value) {
          setStore("sounds", "permissionsEnabled", value);
        },
        permissions: withFallback(() => store.sounds?.permissions, defaultSettings.sounds.permissions),
        setPermissions(value) {
          setStore("sounds", "permissions", value);
        },
        errorsEnabled: withFallback(() => store.sounds?.errorsEnabled, defaultSettings.sounds.errorsEnabled),
        setErrorsEnabled(value) {
          setStore("sounds", "errorsEnabled", value);
        },
        errors: withFallback(() => store.sounds?.errors, defaultSettings.sounds.errors),
        setErrors(value) {
          setStore("sounds", "errors", value);
        }
      }
    };
  }
});