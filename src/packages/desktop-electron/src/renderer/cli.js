/** @file Renderer-side helper that triggers CLI installation via the preload bridge and reports the outcome to the user with a localized alert. */
import { initI18n, t } from "./i18n/index.js";
/**
 * Install the command-line tool via the main process, alerting the user with a localized success or failure message.
 * @returns {Promise<void>} Resolves after the install attempt and the resulting alert.
 */
export async function installCli() {
  await initI18n();
  try {
    const path = await window.api.installCli();
    window.alert(t("desktop.cli.installed.message", {
      path
    }));
  } catch (e) {
    window.alert(t("desktop.cli.failed.message", {
      error: String(e)
    }));
  }
}