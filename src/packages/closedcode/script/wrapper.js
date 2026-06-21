#!/usr/bin/env node
/** @file Build script that generates the thin npm wrapper package (dist/closedcode/): a launcher plus optionalDependencies on the per-platform SEA binary packages. */
/* Generate the npm wrapper package `closedcode` (dist/closedcode/). It carries no
 * code of its own — only optionalDependencies on the per-platform packages
 * (closedcode-<os>-<arch>, each holding a Node SEA binary) and a tiny launcher
 * that resolves the installed platform package and exec's its binary. npm installs
 * only the matching optional dep (os/cpu/libc gated), so `npm i -g closedcode`
 * lands the right SEA binary and `closedcode` just runs it.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { Script } from "script";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.resolve(__dirname, "..");
const require = createRequire(import.meta.url);
const pkg = require(path.join(dir, "package.json"));
const version = Script.version;

// Platform packages produced by `build.js --sea` + `sea.js` on each target.
// Declared as optionalDependencies so npm fetches the one matching the host's
// os/cpu/libc. Linux ships glibc only (Debian/Ubuntu/RHEL/Fedora/...); musl/Alpine
// is not a build target. linux-arm64 is declared for completeness / forward
// compatibility (and to satisfy the launcher's arch-derived name) even though a
// given release may not actually build/publish arm64 — npm skips any optional
// dependency that isn't published, so x64/darwin installs are unaffected.
const PLATFORMS = ["windows-x64", "linux-x64", "linux-arm64", "darwin-x64", "darwin-arm64"];

const out = path.join(dir, "dist", "closedcode");
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, "bin"), { recursive: true });

// Launcher: plain CJS (runs under the user's Node, present since they used npm).
// It resolves the installed platform package and spawns its SEA binary, passing
// args through and inheriting stdio so the TUI keeps its TTY. Linux tries the
// musl-specific package first (only the libc-matching one is actually installed).
const launcher = `#!/usr/bin/env node
"use strict";
const path = require("path");
const { spawnSync } = require("child_process");
const os = process.platform === "win32" ? "windows" : process.platform;
const exe = os === "windows" ? "closedcode.exe" : "closedcode";
const candidates = os === "linux"
  ? ["closedcode-linux-" + process.arch + "-musl", "closedcode-linux-" + process.arch]
  : ["closedcode-" + os + "-" + process.arch];
let bin;
for (const name of candidates) {
  try { bin = path.join(path.dirname(require.resolve(name + "/package.json")), "bin", exe); break; } catch {}
}
if (!bin) {
  console.error("closedcode: no prebuilt binary for " + os + "-" + process.arch +
    ". Install the matching optional dependency (" + candidates.join(" or ") + ").");
  process.exit(1);
}
const r = spawnSync(bin, process.argv.slice(2), { stdio: "inherit" });
if (r.error) { console.error(r.error.message); process.exit(1); }
process.exit(r.status == null ? 1 : r.status);
`;
fs.writeFileSync(path.join(out, "bin", "closedcode"), launcher, { mode: 0o755 });

fs.writeFileSync(path.join(out, "package.json"), JSON.stringify({
  name: "closedcode",
  version,
  description: pkg.description ?? "closedcode CLI",
  bin: { closedcode: "./bin/closedcode" },
  optionalDependencies: Object.fromEntries(PLATFORMS.map(p => [`closedcode-${p}`, version])),
  license: pkg.license,
  repository: pkg.repository,
  homepage: pkg.homepage,
}, null, 2));

console.log(`wrapper package -> ${path.relative(dir, out)} (optionalDeps: ${PLATFORMS.map(p => "closedcode-" + p).join(", ")})`);
