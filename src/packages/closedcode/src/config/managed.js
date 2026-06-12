export * as ConfigManaged from "./managed.js";
import { existsSync } from "fs";
import os from "os";
import path from "path";
import * as Log from "core/util/log";
import { Process } from "#util/process.js";
const log = Log.create({
  service: "config"
});
// macOS managed-preferences domain. Only the closedcode domain is read; we
// never inspect a coexisting opencode install's managed configuration.
const MANAGED_PLIST_DOMAINS = ["ai.closedcode.managed"];

// Keys injected by macOS/MDM into the managed plist that are not closedcode config
const PLIST_META = new Set(["PayloadDisplayName", "PayloadIdentifier", "PayloadType", "PayloadUUID", "PayloadVersion", "_manualProfile"]);
function systemManagedConfigDir() {
  // Only the closedcode managed dir is used; never fall back to an opencode dir.
  switch (process.platform) {
    case "darwin":
      return "/Library/Application Support/closedcode";
    case "win32": {
      const pd = process.env.ProgramData || "C:\\ProgramData";
      return path.join(pd, "closedcode");
    }
    default:
      return "/etc/closedcode";
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