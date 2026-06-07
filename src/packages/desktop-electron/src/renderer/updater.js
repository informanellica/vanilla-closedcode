import { initI18n, t } from "./i18n/index.js";
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