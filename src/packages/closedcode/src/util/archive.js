import path from "path";
import * as Process from "./process.js";
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