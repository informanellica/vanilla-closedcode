/** @file Self-update entry point; disabled in this signed private build but retains the legacy flow. */
import { Bus } from "#bus/index.js";
import { Config } from "#config/config.js";
import { AppRuntime } from "#effect/app-runtime.js";
import { Flag } from "core/flag/flag";
import { Installation } from "#installation/index.js";
import { InstallationVersion } from "core/installation/version";
/**
 * Perform the auto-update check and, where enabled, upgrade or publish an update-available event.
 * In this build self-update is disabled and the function returns immediately; the remaining
 * (unreachable) code is the legacy flow that consulted config/flags, queried the latest release,
 * and either notified or upgraded depending on the configured autoupdate mode and release type.
 * @returns {Promise<void>}
 */
export async function upgrade() {
  // Self-update is disabled: this is a privately distributed, signed build, not
  // a package-managed CLI. The legacy update path would hit a non-existent
  // remote endpoint or npm-install the upstream package.
  return;
  // eslint-disable-next-line no-unreachable
  const config = await AppRuntime.runPromise(Config.Service.use(cfg => cfg.getGlobal()));
  if (config.autoupdate === false || Flag.CLOSEDCODE_DISABLE_AUTOUPDATE) return;
  const method = await Installation.method();
  const latest = await Installation.latest(method).catch(() => {});
  if (!latest) return;
  if (Flag.CLOSEDCODE_ALWAYS_NOTIFY_UPDATE) {
    await Bus.publish(Installation.Event.UpdateAvailable, {
      version: latest
    });
    return;
  }
  if (InstallationVersion === latest) return;
  const kind = Installation.getReleaseType(InstallationVersion, latest);
  if (config.autoupdate === "notify" || kind !== "patch") {
    await Bus.publish(Installation.Event.UpdateAvailable, {
      version: latest
    });
    return;
  }
  if (method === "unknown") return;
  await Installation.upgrade(method, latest).then(() => Bus.publish(Installation.Event.Updated, {
    version: latest
  })).catch(() => {});
}