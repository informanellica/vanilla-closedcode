#!/usr/bin/env node
/** @file Build script that packages the prebuilt CJS bundle into a Node SEA single-executable binary (with optional code signing) for the host or a cross-build target. */
/* Node SEA packaging: turn dist/<platform>/bin/closedcode.cjs (built by
 * `node script/build.js --sea`) into the platform binary closedcode(.exe) via a
 * SEA blob + postject injection.
 *
 *   node script/build.js --sea            # produce the CJS bundle + sidecars
 *   node script/sea.js                     # inject into the HOST node -> closedcode(.exe)
 *   node script/sea.js --node <path>       # cross-build: inject into a TARGET-platform node
 *
 * The blob is platform-agnostic JS; cross-platform builds just supply that
 * platform's node binary (and the matching native sidecars, installed per-target
 * in CI). macOS needs the --macho-segment-name flag (handled below).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.resolve(__dirname, "..");
const require = createRequire(import.meta.url);
const pkg = require(path.join(dir, "package.json"));

// Target identity: default = host; override OS/arch via --target-os / --target-arch
// (cross-build) so the platform package name + exe extension match the target.
/**
 * Read the value following a CLI flag in process.argv, or fall back to a default.
 * @param {string} flag - The flag name to look for (e.g. "--target-os").
 * @param {*} dflt - The value to return when the flag is absent.
 * @returns {*} The argument following the flag, or dflt.
 */
const arg = (flag, dflt) => { const i = process.argv.indexOf(flag); return i >= 0 ? process.argv[i + 1] : dflt; };
const targetOs = arg("--target-os", process.platform === "win32" ? "windows" : process.platform);
const targetArch = arg("--target-arch", process.arch);
const nodeBin = arg("--node", process.execPath); // target-platform node binary to embed into
const targetLibc = arg("--target-libc", null);    // "musl" tags the Linux musl variant
const name = [pkg.name, targetOs, targetArch, targetLibc === "musl" ? "musl" : null].filter(Boolean).join("-");
const binDir = path.join(dir, "dist", name, "bin");
const exeName = targetOs === "windows" ? "closedcode.exe" : "closedcode";
const exe = path.join(binDir, exeName);
const cjs = path.join(binDir, "closedcode.cjs");
const cfg = path.join(binDir, "sea-config.json");
const blob = path.join(binDir, "sea-prep.blob");
const FUSE = "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2";

if (!fs.existsSync(cjs)) {
  console.error(`missing ${path.relative(dir, cjs)} — run \`node script/build.js --sea\` first`);
  process.exit(1);
}

// Remove a stale binary first (avoids a Windows file lock when re-running).
fs.rmSync(exe, { force: true });

// 1. SEA preparation blob from the CJS bundle.
fs.writeFileSync(cfg, JSON.stringify({ main: "closedcode.cjs", output: "sea-prep.blob", disableExperimentalSEAWarning: true, useSnapshot: false, useCodeCache: false }));
execFileSync(process.execPath, ["--experimental-sea-config", cfg], { cwd: binDir, stdio: "inherit" });

// 2. Copy the (target) node binary and 3. inject the blob with postject.
fs.copyFileSync(nodeBin, exe);
const postject = require.resolve("postject/dist/cli.js");
const injectArgs = [postject, exe, "NODE_SEA_BLOB", blob, "--sentinel-fuse", FUSE];
if (targetOs === "darwin") injectArgs.push("--macho-segment-name", "NODE_SEA");
execFileSync(process.execPath, injectArgs, { stdio: "inherit" });

// 4. Code-sign. Blob injection invalidates the binary's existing signature, so a
// distributable build must be re-signed.
//   - Windows (Authenticode): needs the Windows SDK `signtool` + a code-signing
//     cert. Enable with CC_WIN_SIGN=1 and either CC_WIN_CERT=<pfx>[+CC_WIN_CERT_PASSWORD]
//     or CC_WIN_CERT_THUMBPRINT=<sha1 of a cert in the store>. CC_SIGNTOOL overrides
//     the signtool path; CC_WIN_TIMESTAMP overrides the RFC-3161 timestamp server.
//   - macOS: ad-hoc sign by default; set CC_MAC_IDENTITY=<Developer ID> to sign for
//     distribution (run on macOS).
// Without config the binary still runs but is unsigned (Windows SmartScreen will
// warn); we print a note rather than fail.
if (targetOs === "windows") {
  const want = process.env.CC_WIN_SIGN === "1" || process.argv.includes("--sign");
  const tool = process.env.CC_SIGNTOOL || "signtool";
  const ts = process.env.CC_WIN_TIMESTAMP || "http://timestamp.digicert.com";
  let signArgs;
  if (process.env.CC_WIN_CERT) {
    signArgs = ["sign", "/fd", "sha256", "/f", process.env.CC_WIN_CERT,
      ...(process.env.CC_WIN_CERT_PASSWORD ? ["/p", process.env.CC_WIN_CERT_PASSWORD] : []),
      "/tr", ts, "/td", "sha256", exe];
  } else if (process.env.CC_WIN_CERT_THUMBPRINT) {
    signArgs = ["sign", "/fd", "sha256", "/sha1", process.env.CC_WIN_CERT_THUMBPRINT, "/tr", ts, "/td", "sha256", exe];
  }
  if (want && signArgs) {
    execFileSync(tool, signArgs, { stdio: "inherit" });
    try { execFileSync(tool, ["verify", "/pa", exe], { stdio: "inherit" }); } catch { /* verify is best-effort */ }
    console.log("signed (Authenticode)");
  } else if (want) {
    console.error("CC_WIN_SIGN set but no cert — provide CC_WIN_CERT[+CC_WIN_CERT_PASSWORD] or CC_WIN_CERT_THUMBPRINT; left unsigned.");
  } else {
    console.log("note: unsigned (injection invalidated node's signature). Sign with CC_WIN_SIGN=1 + a code-signing cert.");
  }
} else if (targetOs === "darwin") {
  const identity = process.env.CC_MAC_IDENTITY || "-"; // "-" = ad-hoc
  try { execFileSync("codesign", ["--sign", identity, "--force", "--timestamp" + (identity === "-" ? "=none" : ""), exe], { stdio: "inherit" }); console.log(`codesigned (${identity === "-" ? "ad-hoc" : identity})`); }
  catch (e) { console.error("codesign skipped/failed:", e.message); }
}

// 5. Tidy the build inputs (keep only the binary + sidecars + assets).
fs.rmSync(cfg, { force: true });
fs.rmSync(blob, { force: true });
console.log(`SEA binary -> ${path.relative(dir, exe)}`);
