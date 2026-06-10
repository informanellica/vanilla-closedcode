export * as ConfigManaged from "./managed.js";
import { existsSync } from "fs";
import os from "os";
import path from "path";
import * as Log from "core/util/log";
import { Process } from "#util/process.js";
const log = Log.create({
  service: "config"
});
// macOS managed-preferences domains: prefer the closedcode domain, fall back to
// the legacy opencode one so existing MDM profiles keep working.
const MANAGED_PLIST_DOMAINS = ["ai.closedcode.managed", "ai.opencode.managed"];

// Keys injected by macOS/MDM into the managed plist that are not closedcode config
const PLIST_META = new Set(["PayloadDisplayName", "PayloadIdentifier", "PayloadType", "PayloadUUID", "PayloadVersion", "_manualProfile"]);
function systemManagedConfigDir() {
  // Prefer the closedcode dir; fall back to a pre-existing legacy opencode dir.
  const pick = (next, legacy) => (!existsSync(next) && existsSync(legacy) ? legacy : next);
  switch (process.platform) {
    case "darwin":
      return pick("/Library/Application Support/closedcode", "/Library/Application Support/opencode");
    case "win32": {
      const pd = process.env.ProgramData || "C:\\ProgramData";
      return pick(path.join(pd, "closedcode"), path.join(pd, "opencode"));
    }
    default:
      return pick("/etc/closedcode", "/etc/opencode");
  }
}
export function managedConfigDir() {
  return process.env.CLOSEDCODE_TEST_MANAGED_CONFIG_DIR || systemManagedConfigDir();
}
export function parseManagedPlist(json) {
  const raw = JSON.parse(json);
  for (const key of Object.keys(raw)) {
    if (PLIST_META.has(key)) delete raw[key];
  }
  return JSON.stringify(raw);
}
export async function readManagedPreferences() {
  if (process.platform !== "darwin") return;
  const user = os.userInfo().username;
  const paths = MANAGED_PLIST_DOMAINS.flatMap(domain => [path.join("/Library/Managed Preferences", user, `${domain}.plist`), path.join("/Library/Managed Preferences", `${domain}.plist`)]);
  for (const plist of paths) {
    if (!existsSync(plist)) continue;
    log.info("reading macOS managed preferences", {
      path: plist
    });
    const result = await Process.run(["plutil", "-convert", "json", "-o", "-", plist], {
      nothrow: true
    });
    if (result.code !== 0) {
      log.warn("failed to convert managed preferences plist", {
        path: plist
      });
      continue;
    }
    return {
      source: `mobileconfig:${plist}`,
      text: parseManagedPlist(result.stdout.toString())
    };
  }
  return;
}