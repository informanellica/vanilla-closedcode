/** @file Lazily creates and caches electron-store instances for persisted settings, with a one-time migration from the legacy opencode.settings file. */
import Store from "electron-store";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { SETTINGS_STORE } from "./constants.js";
const require = createRequire(import.meta.url);
const { app } = require("electron");
const cache = new Map();

// We cannot instantiate the electron-store at module load time because
// module import hoisting causes this to run before app.setPath("userData", ...)
// in index.ts has executed, which would result in files being written to the default directory
// (e.g. bad: %APPDATA%\desktop-electron\closedcode.settings vs good: %APPDATA%\ai.closedcode.desktop.dev\closedcode.settings).
/**
 * Get (creating and caching on first use) the electron-store instance for the given store name, lazily so it runs after app.setPath("userData").
 * @param {string} name - The store file name; defaults to SETTINGS_STORE. The settings store also triggers a one-time migration from the legacy opencode.settings file.
 * @returns {Store} The cached electron-store instance for that name.
 */
export function getStore(name = SETTINGS_STORE) {
  const cached = cache.get(name);
  if (cached) return cached;
  // One-time migration: seed the settings store from a legacy opencode.settings file.
  if (name === SETTINGS_STORE) {
    try {
      const dir = app.getPath("userData");
      const dest = path.join(dir, name);
      const legacy = path.join(dir, "opencode.settings");
      if (!fs.existsSync(dest) && fs.existsSync(legacy)) fs.copyFileSync(legacy, dest);
    } catch {}
  }
  const next = new Store({
    name,
    fileExtension: "",
    accessPropertiesByDotNotation: false
  });
  cache.set(name, next);
  return next;
}