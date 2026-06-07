import { initI18n, t } from "./i18n/index.js";
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