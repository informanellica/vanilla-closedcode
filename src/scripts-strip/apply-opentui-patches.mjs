#!/usr/bin/env node
// Re-applies the @opentui/* tweaks needed for Node interop.
// Safe to run more than once.

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

// Source root (this script lives in <root>/scripts-strip); node_modules sits here.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

function patchCore() {
  const file = path.join(ROOT, "node_modules/@opentui/core/index-jv9g79dk.js")
  let s = fs.readFileSync(file, "utf8")

  // 1) static `with { type: "file" }` imports → plain const declarations.
  s = s.replace(
    /import\s+(\w+)\s+from\s+(\"[^\"]+\")\s+with\s+\{\s*type:\s*\"file\"\s*\};/g,
    "const $1 = $2;",
  )

  // 2) importModule (no-arg) routes node:ffi to globalThis polyfill.
  s = s.replace(
    /function importModule\(specifier\) \{\s*return import\(specifier\);\s*\}/,
    'function importModule(specifier) { if (specifier === "node:ffi" && globalThis.__closedcodeNodeFfi) { return Promise.resolve(globalThis.__closedcodeNodeFfi); } return import(specifier); }',
  )

  // 3) importModule2 (with .default ?? module).
  s = s.replace(
    /function importModule2\(specifier\) \{\s*return import\(specifier\)\.then\(\(module\) => module\.default \?\? module\);\s*\}/,
    'function importModule2(specifier) { if (specifier === "node:ffi" && globalThis.__closedcodeNodeFfi) { const m = globalThis.__closedcodeNodeFfi; return Promise.resolve(m.default ?? m); } return import(specifier).then((module) => module.default ?? module); }',
  )

  // 4) Dynamic platform import: .ts → .js
  s = s.replace(
    "`@opentui/core-${process.platform}-${process.arch}/index.ts`",
    "`@opentui/core-${process.platform}-${process.arch}/index.js`",
  )

  fs.writeFileSync(file, s)
}

function patchSolid() {
  const file = path.join(ROOT, "node_modules/@opentui/solid/scripts/runtime-plugin-support-configure.ts")
  fs.writeFileSync(
    file,
    `// Node-only build: Bun's plugin() runtime JIT hook is not available, so the
// Solid plugin cannot be installed at runtime. User-authored plugins must be
// pre-compiled to plain JS rather than relying on the on-the-fly transform.
import type { RuntimeModuleEntry, RuntimePluginRewriteOptions } from "@opentui/core/runtime-plugin"

export interface SolidRuntimePluginSupportOptions {
  additional?: Record<string, RuntimeModuleEntry>
  core?: RuntimeModuleEntry
  rewrite?: RuntimePluginRewriteOptions
}

export function ensureRuntimePluginSupport(_options: SolidRuntimePluginSupportOptions = {}): boolean {
  return false
}
`,
  )
}

function patchDarwinArm64() {
  const dir = path.join(ROOT, "node_modules/@opentui/core-darwin-arm64")
  const tsFile = path.join(dir, "index.ts")
  const jsFile = path.join(dir, "index.js")
  const body = `import { fileURLToPath } from "url"
const path = fileURLToPath(new URL("./libopentui.dylib", import.meta.url))
export default path
`
  fs.writeFileSync(tsFile, body)
  fs.writeFileSync(jsFile, body)
}

patchCore()
patchSolid()
patchDarwinArm64()
console.log("@opentui patches applied")
