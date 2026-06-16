/** @file Renderer entry point for the Electron desktop wrapper: wires Sentry, i18n, deep links, the desktop platform adapter, persisted-locale loading, and mounts the shared AppInterface into the boot shell. */
import { createComponent as _$createComponent } from "../../../app/src/lib/reactivity.js";
// @refresh reload

import { ACCEPTED_FILE_EXTENSIONS, ACCEPTED_FILE_TYPES, AppBaseProviders, AppInterface, handleNotificationClick, loadLocaleDict, normalizeLocale, PlatformProvider, ServerConnection, useCommand } from "app";
import * as Sentry from "@sentry/browser";
import { MemoryRouter } from "../../../app/src/lib/router/index.js";
import { createEffect, render } from "../../../app/src/lib/reactivity.js";
import pkg from "../../package.json" with { type: "json" };
import { initI18n, t } from "./i18n/index.js";
import { webviewZoom } from "./webview-zoom.js";
import { env } from "@/lib/env.js";
import { useTheme } from "@/vendor/ui/theme/index.js";
const root = document.getElementById("root");
if (env("DEV") && !(root instanceof HTMLElement)) {
  throw new Error(t("error.dev.rootNotFound"));
}
if (env("VITE_SENTRY_DSN")) {
  Sentry.init({
    dsn: env("VITE_SENTRY_DSN"),
    environment: env("VITE_SENTRY_ENVIRONMENT") ?? env("MODE"),
    release: env("VITE_SENTRY_RELEASE") ?? `desktop-electron@${pkg.version}`,
    initialScope: {
      tags: {
        platform: "desktop-electron"
      }
    },
    integrations: integrations => {
      return integrations.filter(i => i.name !== "Breadcrumbs" && !(env("CLOSEDCODE_CHANNEL") === "prod" && i.name === "GlobalHandlers"));
    }
  });
}
void initI18n();
const deepLinkEvent = "closedcode:deep-link";
/**
 * Queue incoming deep-link URLs on the global ClosedCode bridge and dispatch a window event so listeners can react.
 * No-op when the list is empty.
 * @param {Array} urls - Deep-link URL strings received from the main process.
 * @returns {void}
 */
const emitDeepLinks = urls => {
  if (urls.length === 0) return;
  window.__CLOSEDCODE__ ??= {};
  const pending = window.__CLOSEDCODE__.deepLinks ?? [];
  window.__CLOSEDCODE__.deepLinks = [...pending, ...urls];
  window.dispatchEvent(new CustomEvent(deepLinkEvent, {
    detail: {
      urls
    }
  }));
};
/**
 * Drain any deep links captured before the renderer was ready, then subscribe to future ones.
 * @returns {Function} Unsubscribe callback returned by the deep-link listener registration.
 */
const listenForDeepLinks = () => {
  void window.api.consumeInitialDeepLinks().then(urls => emitDeepLinks(urls));
  return window.api.onDeepLink(urls => emitDeepLinks(urls));
};
/**
 * Build the desktop platform adapter consumed by the shared app (PlatformProvider value).
 * Bridges renderer features (OS detection, WSL path translation, file/folder pickers, persisted
 * key/value storage, updater, notifications, clipboard, navigation) onto the preload `window.api`.
 * @returns {Object} Platform implementation object exposing desktop capabilities to the shared app.
 */
const createPlatform = () => {
  const os = (() => {
    const ua = navigator.userAgent;
    if (ua.includes("Mac")) return "macos";
    if (ua.includes("Windows")) return "windows";
    if (ua.includes("Linux")) return "linux";
    return undefined;
  })();
  /**
   * Resolve whether WSL path translation is enabled (only possible on Windows).
   * @returns {Promise<boolean>} True when running on Windows with WSL config enabled.
   */
  const isWslEnabled = async () => {
    if (os !== "windows") return false;
    return window.api.getWslConfig().then(config => config.enabled).catch(() => false);
  };
  /**
   * Resolve the Windows-side path of the WSL home directory, used as a picker default path.
   * @returns {Promise<string>} The translated home path, or undefined when WSL is disabled or translation fails.
   */
  const wslHome = async () => {
    if (!(await isWslEnabled())) return undefined;
    return window.api.wslPath("~", "windows").catch(() => undefined);
  };
  /**
   * Convert picker result path(s) from Windows form to Linux form when WSL is enabled.
   * @param {*} result - Picker result: a single path string, an array of paths, or a falsy/cancelled value.
   * @returns {Promise<*>} The path(s) translated to Linux form, or the original result unchanged.
   */
  const handleWslPicker = async result => {
    if (!result || !(await isWslEnabled())) return result;
    if (Array.isArray(result)) {
      return Promise.all(result.map(path => window.api.wslPath(path, "linux").catch(() => path)));
    }
    return window.api.wslPath(result, "linux").catch(() => result);
  };
  /**
   * Factory returning a cached named key/value store backed by the main-process store API.
   * Each store name maps to a Web-Storage-like adapter; instances are memoized per name.
   * @type {Function}
   */
  const storage = (() => {
    const cache = new Map();
    /**
     * Create a Storage-like adapter for a single named store, delegating to the preload store API.
     * @param {string} name - The store file name (namespace) to read/write.
     * @returns {Object} An object with getItem, setItem, removeItem, clear, key, getLength and a length getter.
     */
    const createStorage = name => {
      const api = {
        getItem: key => window.api.storeGet(name, key),
        setItem: (key, value) => window.api.storeSet(name, key, value),
        removeItem: key => window.api.storeDelete(name, key),
        clear: () => window.api.storeClear(name),
        key: async index => (await window.api.storeKeys(name))[index],
        getLength: () => window.api.storeLength(name),
        get length() {
          return api.getLength();
        }
      };
      return api;
    };
    return (name = "default.dat") => {
      const cached = cache.get(name);
      if (cached) return cached;
      const api = createStorage(name);
      cache.set(name, api);
      return api;
    };
  })();
  return {
    platform: "desktop",
    os,
    version: pkg.version,
    async openDirectoryPickerDialog(opts) {
      const defaultPath = await wslHome();
      const result = await window.api.openDirectoryPicker({
        multiple: opts?.multiple ?? false,
        title: opts?.title ?? t("desktop.dialog.chooseFolder"),
        defaultPath
      });
      return await handleWslPicker(result);
    },
    async openFilePickerDialog(opts) {
      const result = await window.api.openFilePicker({
        multiple: opts?.multiple ?? false,
        title: opts?.title ?? t("desktop.dialog.chooseFile"),
        accept: opts?.accept ?? ACCEPTED_FILE_TYPES,
        extensions: opts?.extensions ?? ACCEPTED_FILE_EXTENSIONS
      });
      return handleWslPicker(result);
    },
    async saveFilePickerDialog(opts) {
      const result = await window.api.saveFilePicker({
        title: opts?.title ?? t("desktop.dialog.saveFile"),
        defaultPath: opts?.defaultPath
      });
      return handleWslPicker(result);
    },
    openLink(url) {
      window.api.openLink(url);
    },
    async openPath(path, app) {
      if (os === "windows") {
        const resolvedApp = app ? await window.api.resolveAppPath(app).catch(() => null) : null;
        const resolvedPath = await (async () => {
          if (await isWslEnabled()) {
            const converted = await window.api.wslPath(path, "windows").catch(() => null);
            if (converted) return converted;
          }
          return path;
        })();
        return window.api.openPath(resolvedPath, resolvedApp ?? undefined);
      }
      return window.api.openPath(path, app);
    },
    back() {
      window.history.back();
    },
    forward() {
      window.history.forward();
    },
    storage,
    checkUpdate: async () => {
      const config = await window.api.getWindowConfig().catch(() => ({
        updaterEnabled: false
      }));
      if (!config.updaterEnabled) return {
        updateAvailable: false
      };
      return window.api.checkUpdate();
    },
    updateAndRestart: async () => {
      const config = await window.api.getWindowConfig().catch(() => ({
        updaterEnabled: false
      }));
      if (!config.updaterEnabled) return;
      await window.api.installUpdate();
    },
    restart: async () => {
      await window.api.killSidecar().catch(() => undefined);
      window.api.relaunch();
    },
    notify: async (title, description, href) => {
      const focused = await window.api.getWindowFocused().catch(() => document.hasFocus());
      if (focused) return;
      const notification = new Notification(title, {
        body: description ?? ""
      });
      notification.onclick = () => {
        void window.api.showWindow();
        void window.api.setWindowFocus();
        handleNotificationClick(href);
        notification.close();
      };
    },
    fetch: (input, init) => {
      if (input instanceof Request) return fetch(input);
      return fetch(input, init);
    },
    getWslEnabled: () => isWslEnabled(),
    setWslEnabled: async enabled => {
      await window.api.setWslConfig({
        enabled
      });
    },
    getDefaultServer: async () => {
      const url = await window.api.getDefaultServerUrl().catch(() => null);
      if (!url) return null;
      return ServerConnection.Key.make(url);
    },
    setDefaultServer: async url => {
      await window.api.setDefaultServerUrl(url);
    },
    getDisplayBackend: async () => {
      return window.api.getDisplayBackend().catch(() => null);
    },
    setDisplayBackend: async backend => {
      await window.api.setDisplayBackend(backend);
    },
    parseMarkdown: markdown => window.api.parseMarkdownCommand(markdown),
    webviewZoom,
    checkAppExists: async appName => {
      return window.api.checkAppExists(appName);
    },
    async readClipboardImage() {
      const image = await window.api.readClipboardImage().catch(() => null);
      if (!image) return null;
      const blob = new Blob([image.buffer], {
        type: "image/png"
      });
      return new File([blob], `pasted-image-${Date.now()}.png`, {
        type: "image/png"
      });
    }
  };
};
let menuTrigger = null;
window.api.onMenuCommand(id => {
  menuTrigger?.(id);
});
listenForDeepLinks();

// Resolve the persisted UI locale (plain async — no reactive resource).
/**
 * Read the user's persisted UI locale from desktop storage (with legacy opencode/v1 fallbacks),
 * normalize it, and eagerly load its dictionary when it is not English.
 * @param {Object} platform - The platform adapter providing a `storage(name)` accessor.
 * @returns {Promise<string>} The normalized locale code, or undefined when none is persisted.
 */
async function loadLocale(platform) {
  const current = await platform.storage?.("closedcode.global.dat").getItem("language");
  const legacy = current ? undefined : (await platform.storage?.("opencode.global.dat").getItem("language")) ?? (await platform.storage?.().getItem("language.v1"));
  const raw = current ?? legacy;
  if (!raw) return undefined;
  const locale = raw.match(/"locale"\s*:\s*"([^"]+)"/)?.[1];
  if (!locale) return undefined;
  const next = normalizeLocale(locale);
  if (next !== "en") await loadLocaleDict(next);
  return next;
}

/**
 * Surface a fatal renderer-startup failure on the static boot shell so the window is never blank.
 * Logs to the console and writes the error stack/message into the `#app-boot-msg` element.
 * @param {*} error - The error thrown during boot (Error instance or any value).
 * @returns {void}
 */
function showBootError(error) {
  console.error("[boot] renderer failed to start:", error);
  const msg = document.getElementById("app-boot-msg");
  if (msg) {
    msg.textContent = "Failed to start: " + (error && (error.stack || error.message) || String(error));
    msg.style.cssText = "white-space:pre-wrap;max-width:80ch;padding:16px;font-family:var(--font-family-mono,monospace);text-align:left";
  }
}

// Top-level startup is PLAIN async, not reactive: load the data the app needs,
// keep the static #app-boot shell visible meanwhile, then mount ONLY AppInterface
// into #app-mount. No top-level <Show>/createResource gate — so the whole window is
// never a blank #root, and a reactive-mount issue can't wipe the screen.
/**
 * Plain-async renderer startup: builds the platform, awaits window config, sidecar init, default
 * server and persisted locale, wires external-link handling, mounts AppInterface into the boot
 * shell, and reveals the app only once it has actually rendered DOM (with a no-DOM timeout guard).
 * @returns {Promise<void>} Resolves once mounting and reveal/observation have been set up.
 */
async function boot() {
  const platform = createPlatform();

  // windowConfig/windowCount were only the old reactive gate's `when` inputs; we
  // still await them for parity (the app shouldn't start before they settle), but
  // only sidecar/defaultServer/locale feed the component tree.
  const [, , sidecar, defaultServer, locale] = await Promise.all([
    window.api.getWindowConfig().catch(() => ({ updaterEnabled: false })),
    window.api.getWindowCount().catch(() => 1),
    // Don't let a sidecar-init failure reject the whole boot — that would drop to
    // showBootError and pin the window on an error screen with no app at all. The
    // app must still mount (sidecar -> undefined -> servers: []) so the user can
    // reach Settings -> サーバー・プロバイダ and connect/configure a server.
    window.api.awaitInitialization(() => undefined).catch(() => undefined),
    Promise.resolve(platform.getDefaultServer?.())
      .then(url => (url ? ServerConnection.key({ type: "http", http: { url } }) : undefined))
      .catch(() => undefined),
    loadLocale(platform).catch(() => undefined),
  ]);

  const servers = (() => {
    if (!sidecar) return [];
    return [{
      displayName: "Local Server",
      type: "sidecar",
      variant: "base",
      http: { url: sidecar.url, username: sidecar.username ?? undefined, password: sidecar.password ?? undefined },
    }];
  })();

  document.addEventListener("click", e => {
    const link = e.target.closest("a.external-link");
    if (link?.href) {
      e.preventDefault();
      platform.openLink(link.href);
    }
  });

  /**
   * Headless component mounted inside the provider tree: binds the menu-command trigger and syncs
   * the OS window background color to the active theme's `--background-base` via an effect.
   * @returns {null} Renders no DOM.
   */
  function Inner() {
    const cmd = useCommand();
    menuTrigger = id => cmd.trigger(id);
    const theme = useTheme();
    createEffect(() => {
      theme.themeId();
      theme.mode();
      const bg = getComputedStyle(document.documentElement).getPropertyValue("--background-base").trim();
      if (bg) void window.api.setBackgroundColor(bg);
    });
    return null;
  }

  const mount = document.getElementById("app-mount") ?? root;
  render(() => _$createComponent(PlatformProvider, {
    value: platform,
    get children() {
      return _$createComponent(AppBaseProviders, {
        locale,
        get children() {
          return _$createComponent(AppInterface, {
            defaultServer: defaultServer ?? ServerConnection.Key.make("sidecar"),
            servers,
            router: MemoryRouter,
            get children() {
              return _$createComponent(Inner, {});
            },
          });
        },
      });
    },
  }), mount);

  // Reveal the app only once it has actually rendered DOM; otherwise keep the
  // static shell up (so a reactive-mount failure shows loading, never a blank
  // screen) and surface it. render() returns synchronously, but the first paint
  // is gated on async work (persisted settings/server resources settle a few
  // hundred ms later), so a single rAF check fires before any element exists.
  // Watch #app-mount and reveal as soon as content appears, with a timeout that
  // surfaces a genuine no-DOM failure.
  const reveal = () => document.getElementById("app-boot")?.remove();
  if (mount.childElementCount > 0) {
    reveal();
  } else {
    const observer = new MutationObserver(() => {
      if (mount.childElementCount > 0) { observer.disconnect(); reveal(); }
    });
    observer.observe(mount, { childList: true, subtree: true });
    setTimeout(() => {
      if (mount.childElementCount > 0) return;
      observer.disconnect();
      console.error("[boot] AppInterface mounted no DOM into #app-mount");
      const msg = document.getElementById("app-boot-msg");
      if (msg) msg.textContent = "App mounted no content (reactive render produced no DOM).";
    }, 10000);
  }
}

boot().catch(showBootError);