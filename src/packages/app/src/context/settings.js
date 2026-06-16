/** @file Settings context: persisted user preferences (general/appearance/keybinds/notifications/sounds) plus font-family helpers and CSS variable wiring. */
import { createStore, reconcile } from "../lib/store.js";
import { createEffect, createMemo } from "../lib/reactivity.js";
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
/**
 * Normalize a stored font value into a form-input string (empty string when unset).
 * @param {string} font - The stored font name, or undefined.
 * @returns {string} The font name, or an empty string when not set.
 */
function input(font) {
  return font ?? "";
}
/**
 * Quote a font name for use in a CSS font-family stack, escaping backslashes and quotes.
 * @param {string} font - The font name to format.
 * @returns {string} The bare name (if a simple identifier) or a quoted, escaped name.
 */
function family(font) {
  if (/^[\w-]+$/.test(font)) return font;
  return `"${font.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}
/**
 * Build a CSS font-family stack from a chosen font and a fallback stack.
 * @param {string} font - The user-chosen font name; falls back to base when empty.
 * @param {string} base - The fallback font stack to append.
 * @returns {string} The chosen font prepended to the base stack, or just the base.
 */
function stack(font, base) {
  const value = font?.trim() ?? "";
  if (!value) return base;
  return `${family(value)}, ${base}`;
}
/**
 * Get the monospace font value for a form input.
 * @param {string} font - The stored monospace font name.
 * @returns {string} The input string for the monospace font.
 */
export function monoInput(font) {
  return input(font);
}
/**
 * Get the sans-serif font value for a form input.
 * @param {string} font - The stored sans-serif font name.
 * @returns {string} The input string for the sans-serif font.
 */
export function sansInput(font) {
  return input(font);
}
/**
 * Build the CSS monospace font-family stack for the chosen font.
 * @param {string} font - The user-chosen monospace font name.
 * @returns {string} The CSS font-family value (chosen font + monospace fallback).
 */
export function monoFontFamily(font) {
  return stack(font, monoBase);
}
/**
 * Build the CSS sans-serif font-family stack for the chosen font.
 * @param {string} font - The user-chosen sans-serif font name.
 * @returns {string} The CSS font-family value (chosen font + sans-serif fallback).
 */
export function sansFontFamily(font) {
  return stack(font, sansBase);
}
/**
 * Get the terminal font value for a form input.
 * @param {string} font - The stored terminal font name.
 * @returns {string} The input string for the terminal font.
 */
export function terminalInput(font) {
  return input(font);
}
/**
 * Build the CSS terminal font-family stack for the chosen font.
 * @param {string} font - The user-chosen terminal font name.
 * @returns {string} The CSS font-family value (chosen font + terminal fallback).
 */
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
    terminal: "",
    // Toolbar customization. toolbarOrder is the user-chosen ordering of the
    // toolbar item ids (see app-toolbar.js TOOLBAR_ITEMS); an empty array means
    // "use the built-in default order". toolbarHidden lists item ids the user
    // has hidden. Both are plain arrays (replaced wholesale on change).
    toolbarOrder: [],
    toolbarHidden: []
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
/**
 * Wrap a reactive accessor with a default, returning the fallback when the read is nullish.
 * @param {Function} read - Reactive accessor returning the stored value (or nullish).
 * @param {*} fallback - Value to use when the read returns null/undefined.
 * @returns {Function} A memo accessor yielding the value or the fallback.
 */
function withFallback(read, fallback) {
  return createMemo(() => read() ?? fallback);
}
/**
 * Settings context. `useSettings` returns the settings store with reactive
 * accessors and setters grouped by section (general, updates, appearance,
 * keybinds, permissions, notifications, sounds); `SettingsProvider` provides it.
 * The init effect mirrors appearance settings onto CSS custom properties and
 * pins the CodeMirror editor font.
 */
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
        },
        toolbarOrder: withFallback(() => store.appearance?.toolbarOrder, defaultSettings.appearance.toolbarOrder),
        setToolbarOrder(value) {
          setStore("appearance", "toolbarOrder", Array.isArray(value) ? [...value] : []);
        },
        toolbarHidden: withFallback(() => store.appearance?.toolbarHidden, defaultSettings.appearance.toolbarHidden),
        setToolbarHidden(value) {
          setStore("appearance", "toolbarHidden", Array.isArray(value) ? [...value] : []);
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