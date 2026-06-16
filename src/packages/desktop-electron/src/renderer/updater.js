/** @file Renderer-side entry point that triggers the desktop app's update check via the IPC bridge. */
import { initI18n, t } from "./i18n/index.js";
/**
 * Initializes i18n and invokes the main-process updater over the IPC bridge.
 * On failure, optionally shows a localized "check failed" alert to the user.
 * @param {Object} options - Options object.
 * @param {boolean} options.alertOnFail - When true, display a localized alert if the update check fails.
 * @returns {Promise<void>} Resolves once the updater has run (or failed silently when alertOnFail is false).
 */
export async function runUpdater({
  alertOnFail
}) {
  await initI18n();
  try {
    await window.api.runUpdater(alertOnFail);
  } catch {
    if (alertOnFail) {
      window.alert(t("desktop.updater.checkFailed.message"));
    }
  }
}