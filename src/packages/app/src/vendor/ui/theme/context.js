/** @file Theme context provider managing the Bootstrap color scheme (system/light/dark), persistence, and live system-preference tracking. */
import { createEffect, onMount } from "../../../lib/reactivity.js";
import { createStore } from "../../../lib/store.js";
import { makeEventListener } from "../../../lib/primitives/event-listener.js";
import { createSimpleContext } from "../context/helper.js";

// Bootstrap 5.3 color modes only. The single source of truth for colors is the
// `data-bs-theme` attribute on <html> ("light" | "dark"). The chosen color
// scheme ("system" | "light" | "dark") is persisted in localStorage. "system"
// resolves via prefers-color-scheme and tracks live changes.
const STORAGE_KEYS = {
  COLOR_SCHEME: "closedcode-color-scheme"
};

/**
 * Read a value from localStorage, returning null on absence or access error.
 * @param {string} key - The storage key.
 * @returns {string} The stored value, or null if unavailable.
 */
function read(key) {
  if (typeof localStorage !== "object") return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * Write a value to localStorage, silently ignoring unavailability or errors.
 * @param {string} key - The storage key.
 * @param {string} value - The value to store.
 * @returns {void}
 */
function write(key, value) {
  if (typeof localStorage !== "object") return;
  try {
    localStorage.setItem(key, value);
  } catch {}
}

/**
 * Resolve the operating-system color preference via `prefers-color-scheme`.
 * @returns {string} "dark" when the system prefers dark, otherwise "light".
 */
function getSystemMode() {
  if (typeof window !== "object") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/**
 * Resolve a chosen color scheme to a concrete mode, mapping "system" to the OS preference.
 * @param {string} scheme - "system", "light", or "dark".
 * @returns {string} The resolved mode ("light" or "dark").
 */
function resolveMode(scheme) {
  return scheme === "system" ? getSystemMode() : scheme;
}

/**
 * Apply a concrete mode to the document root via the Bootstrap `data-bs-theme` attribute.
 * @param {string} mode - The mode to apply ("light" or "dark").
 * @returns {void}
 */
function applyMode(mode) {
  if (typeof document !== "object") return;
  document.documentElement.setAttribute("data-bs-theme", mode);
}

/**
 * Theme context exposing `useTheme` (hook to read the theme API) and `ThemeProvider`
 * (the provider component). The provided value exposes the color-scheme API (colorScheme,
 * mode, setColorScheme, previewColorScheme, cancelPreview, commitPreview) plus harmless
 * legacy stubs for the removed 37-theme system.
 */
export const {
  use: useTheme,
  provider: ThemeProvider
} = createSimpleContext({
  name: "Theme",
  /**
   * Initialize the theme context value: restore the persisted scheme, set up storage and
   * media-query listeners, drive `data-bs-theme` reactively, and return the theme API.
   * @param {Object} props - Provider props; supports an optional `onThemeApplied` callback.
   * @returns {Object} The theme API consumed via `useTheme`.
   */
  init: props => {
    const stored = read(STORAGE_KEYS.COLOR_SCHEME);
    const colorScheme = stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
    const [store, setStore] = createStore({
      colorScheme,
      mode: resolveMode(colorScheme),
      // Preview holds a transient scheme used while hovering options in the UI.
      previewScheme: null
    });

    // The effective mode is the preview scheme (if any), otherwise the committed one.
    const effectiveMode = () => resolveMode(store.previewScheme ?? store.colorScheme);

    /**
     * Storage event handler that syncs the color scheme across tabs/windows.
     * @param {StorageEvent} e - The storage event.
     * @returns {void}
     */
    const onStorage = e => {
      if (e.key !== STORAGE_KEYS.COLOR_SCHEME || !e.newValue) return;
      const next = e.newValue;
      if (next !== "light" && next !== "dark" && next !== "system") return;
      setStore("colorScheme", next);
      setStore("mode", resolveMode(next));
    };

    onMount(() => {
      makeEventListener(window, "storage", onStorage);
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const onMedia = () => {
        // Only react to system changes when the effective scheme follows the system.
        const scheme = store.previewScheme ?? store.colorScheme;
        if (scheme !== "system") return;
        setStore("mode", getSystemMode());
      };
      makeEventListener(mediaQuery, "change", onMedia);
    });

    // On mount and whenever the (effective) mode changes, drive data-bs-theme.
    createEffect(() => {
      const mode = effectiveMode();
      // Track store.mode so live system changes re-run this effect.
      void store.mode;
      applyMode(mode);
      props.onThemeApplied?.(undefined, mode);
    });

    /**
     * Commit a new color scheme: update the store, clear any preview, resolve the mode, and persist it.
     * Ignores invalid scheme values.
     * @param {string} scheme - "light", "dark", or "system".
     * @returns {void}
     */
    const setColorScheme = scheme => {
      if (scheme !== "light" && scheme !== "dark" && scheme !== "system") return;
      setStore("colorScheme", scheme);
      setStore("previewScheme", null);
      setStore("mode", resolveMode(scheme));
      write(STORAGE_KEYS.COLOR_SCHEME, scheme);
    };

    /**
     * Apply a transient preview scheme (e.g. while hovering an option) without persisting it.
     * Ignores invalid scheme values.
     * @param {string} scheme - "light", "dark", or "system".
     * @returns {void}
     */
    const previewColorScheme = scheme => {
      if (scheme !== "light" && scheme !== "dark" && scheme !== "system") return;
      setStore("previewScheme", scheme);
      setStore("mode", resolveMode(scheme));
    };

    /**
     * Cancel any active preview and restore the mode derived from the committed color scheme.
     * @returns {void}
     */
    const cancelPreview = () => {
      setStore("previewScheme", null);
      setStore("mode", resolveMode(store.colorScheme));
    };

    return {
      // Color scheme API (Bootstrap color modes).
      colorScheme: () => store.colorScheme,
      mode: () => store.mode,
      setColorScheme,
      previewColorScheme,
      cancelPreview,
      commitPreview: () => {
        if (store.previewScheme) setColorScheme(store.previewScheme);
        setStore("previewScheme", null);
      },
      // Legacy 37-theme concept is gone. These are harmless stubs so existing
      // consumers (settings-general.js) keep working; the Adapt phase hides the row.
      themeId: () => "bootstrap",
      ids: () => ["bootstrap"],
      name: () => "Bootstrap",
      themes: () => ({}),
      loadThemes: () => Promise.resolve({}),
      setTheme: () => {},
      previewTheme: () => {},
      registerTheme: () => {}
    };
  }
});
