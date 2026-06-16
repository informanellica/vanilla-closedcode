/** @file Archive helpers: extract ZIP files using platform-native tooling (PowerShell on Windows, `unzip` elsewhere). */
import path from "path";
import * as Process from "./process.js";
/**
 * Extracts a ZIP archive into a destination directory, overwriting existing files.
 *
 * On Windows uses PowerShell's `Expand-Archive`; on other platforms uses the `unzip` CLI.
 *
 * @param {string} zipPath - Path to the source ZIP file
 * @param {string} destDir - Directory to extract the archive contents into
 * @returns {Promise<void>} Resolves once extraction completes
 */
export async function extractZip(zipPath, destDir) {
  if (process.platform === "win32") {
    const winZipPath = path.resolve(zipPath);
    const winDestDir = path.resolve(destDir);
    // $global:ProgressPreference suppresses PowerShell's blue progress bar popup
    const cmd = `$global:ProgressPreference = 'SilentlyContinue'; Expand-Archive -Path '${winZipPath}' -DestinationPath '${winDestDir}' -Force`;
    await Process.run(["powershell", "-NoProfile", "-NonInteractive", "-Command", cmd]);
    return;
  }
  await Process.run(["unzip", "-o", "-q", zipPath, "-d", destDir]);
}
export * as Archive from "./archive.js";