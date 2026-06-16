/** @file Packaging helpers: release-channel resolution and sidecar (opencode CLI) binary placement for builds. */
import { $ } from "script/shell";
// Default channel is "prod" so a plain `npm run package:mac` produces an
// artefact without a "Dev" suffix — dev/beta exist only when someone
// explicitly opts in (e.g. `CLOSEDCODE_CHANNEL=dev npm run package:mac`) to
// install a side-by-side pre-release build alongside the production one.
/**
 * Resolve the release channel from CLOSEDCODE_CHANNEL, defaulting to "prod".
 * @returns {string} One of "dev", "beta", or "prod".
 */
export function resolveChannel() {
  const raw = process.env.CLOSEDCODE_CHANNEL;
  if (raw === "dev" || raw === "beta" || raw === "prod") return raw;
  return "prod";
}
export const SIDECAR_BINARIES = [{
  rustTarget: "aarch64-apple-darwin",
  ocBinary: "opencode-darwin-arm64",
  assetExt: "zip"
}, {
  rustTarget: "x86_64-apple-darwin",
  ocBinary: "opencode-darwin-x64-baseline",
  assetExt: "zip"
}, {
  rustTarget: "aarch64-pc-windows-msvc",
  ocBinary: "opencode-windows-arm64",
  assetExt: "zip"
}, {
  rustTarget: "x86_64-pc-windows-msvc",
  ocBinary: "opencode-windows-x64-baseline",
  assetExt: "zip"
}, {
  rustTarget: "x86_64-unknown-linux-gnu",
  ocBinary: "opencode-linux-x64-baseline",
  assetExt: "tar.gz"
}, {
  rustTarget: "aarch64-unknown-linux-gnu",
  ocBinary: "opencode-linux-arm64",
  assetExt: "tar.gz"
}];
export const RUST_TARGET = process.env.RUST_TARGET;
/**
 * Determine the Rust target triple matching the current host platform/arch.
 * @returns {string} The Rust target triple (e.g. "aarch64-apple-darwin").
 * @throws {Error} When the host platform/arch combination is unsupported.
 */
function nativeTarget() {
  const {
    platform,
    arch
  } = process;
  if (platform === "darwin") return arch === "arm64" ? "aarch64-apple-darwin" : "x86_64-apple-darwin";
  if (platform === "win32") return arch === "arm64" ? "aarch64-pc-windows-msvc" : "x86_64-pc-windows-msvc";
  if (platform === "linux") return arch === "arm64" ? "aarch64-unknown-linux-gnu" : "x86_64-unknown-linux-gnu";
  throw new Error(`Unsupported platform: ${platform}/${arch}`);
}
/**
 * Look up the sidecar binary configuration for a given Rust target.
 * @param {string} target - The Rust target triple; defaults to RUST_TARGET or the host's native target.
 * @returns {Object} The matching SIDECAR_BINARIES entry (rustTarget, ocBinary, assetExt).
 * @throws {Error} When no sidecar configuration exists for the target.
 */
export function getCurrentSidecar(target = RUST_TARGET ?? nativeTarget()) {
  const binaryConfig = SIDECAR_BINARIES.find(b => b.rustTarget === target);
  if (!binaryConfig) throw new Error(`Sidecar configuration not available for Rust target '${target}'`);
  return binaryConfig;
}
/**
 * Copy a sidecar binary into the resources folder as opencode-cli, signing it on Windows CI and macOS.
 * @param {string} source - Path to the source binary to copy.
 * @returns {Promise<void>} Resolves once the binary is copied and (where applicable) code-signed.
 */
export async function copyBinaryToSidecarFolder(source) {
  const dir = `resources`;
  await $`mkdir -p ${dir}`;
  const dest = windowsify(`${dir}/opencode-cli`);
  await $`cp ${source} ${dest}`;
  if (process.platform === "win32" && process.env.GITHUB_ACTIONS === "true") {
    await $`pwsh -NoLogo -NoProfile -ExecutionPolicy Bypass -File ../../script/sign-windows.ps1 ${dest}`;
  }
  if (process.platform === "darwin") await $`codesign --force --sign - ${dest}`;
  console.log(`Copied ${source} to ${dest}`);
}
/**
 * Append a ".exe" extension on Windows (unless one is already present).
 * @param {string} path - The base file path.
 * @returns {string} The path with ".exe" added on win32, otherwise unchanged.
 */
export function windowsify(path) {
  if (path.endsWith(".exe")) return path;
  return `${path}${process.platform === "win32" ? ".exe" : ""}`;
}