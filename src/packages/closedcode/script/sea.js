#!/usr/bin/env node
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
const arg = (flag, dflt) => { const i = process.argv.indexOf(flag); return i >= 0 ? process.argv[i + 1] : dflt; };
const targetOs = arg("--target-os", process.platform === "win32" ? "windows" : process.platform);
const targetArch = arg("--target-arch", process.arch);
const nodeBin = arg("--node", process.execPath); // target-platform node binary to embed into
const name = [pkg.name, targetOs, targetArch].join("-");
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

// 4. Tidy the build inputs (keep only the binary + sidecars + assets).
fs.rmSync(cfg, { force: true });
fs.rmSync(blob, { force: true });
console.log(`SEA binary -> ${path.relative(dir, exe)}`);
