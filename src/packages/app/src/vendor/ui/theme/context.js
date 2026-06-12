import { createEffect, onMount } from "solid-js";
import { createStore } from "solid-js/store";
import { makeEventListener } from "@/lib/primitives/event-listener.js";
import { createSimpleContext } from "../context/helper.js";

// Bootstrap 5.3 color modes only. The single source of truth for colors is the
// `data-bs-theme` attribute on <html> ("light" | "dark"). The chosen color
// scheme ("system" | "light" | "dark") is persisted in localStorage. "system"
// resolves via prefers-color-scheme and tracks live changes.
const STORAGE_KEYS = {
  COLOR_SCHEME: "closedcode-color-scheme"
};

function read(key) {
  if (typeof localStorage !== "object") return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key, value) {
  if (typeof localStorage !== "object") return;
  try {
    localStorage.setItem(key, value);
  } catch {}
}

function getSystemMode() {
  if (typeof window !== "object") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function resolveMode(scheme) {
  return scheme === "system" ? getSystemMode() : scheme;
}

function applyMode(mode) {
  if (typeof document !== "object") return;
  document.documentElement.setAttribute("data-bs-theme", mode);
}

export const {
  use: useTheme,
  provider: ThemeProvider
} = createSimpleContext({
  name: "Theme",
  init: props => {
    const stored = read(STORAGE_KEYS.COLOR_SCHEME) ?? read("opencode-color-scheme");
    const colorScheme = stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
    const [store, setStore] = createStore({
      colorScheme,
      mode: resolveMode(colorScheme),
      // Preview holds a transient scheme used while hovering options in the UI.
      previewScheme: null
    });

    // The effective mode is the preview scheme (if any), otherwise the committed one.
    const effectiveMode = () => resolveMode(store.previewScheme ?? store.colorScheme);

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

    const setColorScheme = scheme => {
      if (scheme !== "light" && scheme !== "dark" && scheme !== "system") return;
      setStore("colorScheme", scheme);
      setStore("previewScheme", null);
      setStore("mode", resolveMode(scheme));
      write(STORAGE_KEYS.COLOR_SCHEME, scheme);
    };

    const previewColorScheme = scheme => {
      if (scheme !== "light" && scheme !== "dark" && scheme !== "system") return;
      setStore("previewScheme", scheme);
      setStore("mode", resolveMode(scheme));
    };

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
