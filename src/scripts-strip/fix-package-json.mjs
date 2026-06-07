#!/usr/bin/env node
// Sweep every package.json:
//   - Drop TypeScript/babel-related deps: typescript, tsx, ts-jest, @tsconfig/*, @types/*,
//     @typescript/native-preview, oxlint-tsgolint
//   - Drop "typecheck" scripts and replace tsx/tsgo usages in scripts
//   - Update exports / imports / main / module / types / bin paths .ts → .js, .tsx → .js
//   - Delete "types" / "typings" fields
//
// Also drops jest-related deps if tests stay (we keep jest itself but drop ts-jest).

import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, "..")

const PKG_FILES = [
  "package.json",
  "sdks/vscode/package.json",
  "packages/ui/package.json",
  "packages/desktop-electron/package.json",
  "packages/storybook/package.json",
  "packages/core/package.json",
  "packages/app/package.json",
  "packages/enterprise/package.json",
  "packages/plugin/package.json",
  "packages/closedcode/package.json",
  "packages/function/package.json",
  "packages/script/package.json",
  "packages/slack/package.json",
  "packages/sdk/js/package.json",
]

const DEP_REMOVALS = new Set([
  "typescript",
  "tsx",
  "ts-jest",
  "@typescript/native-preview",
  "oxlint-tsgolint",
  "@types/babel__core",
  "@types/bun",
  "@types/cross-spawn",
  "@types/jest",
  "@types/katex",
  "@types/luxon",
  "@types/mime-types",
  "@types/node",
  "@types/npm-package-arg",
  "@types/semver",
  "@types/turndown",
  "@types/which",
  "@types/yargs",
  "@tsconfig/node22",
  "@tsconfig/bun",
])

function isTypeDep(name) {
  if (DEP_REMOVALS.has(name)) return true
  if (name.startsWith("@types/")) return true
  if (name.startsWith("@tsconfig/")) return true
  return false
}

function convertScript(s) {
  if (typeof s !== "string") return s
  let out = s
  // tsgo / tsc / typecheck commands → noop
  out = out.replace(/\btsgo (?:-b\s+)?--noEmit\b/g, "echo 'typecheck disabled'")
  out = out.replace(/\btsgo -b\b/g, "echo 'typecheck disabled'")
  out = out.replace(/\btsc(\s+--noEmit)?\b/g, "echo 'typecheck disabled'")
  // tsx → node (we still need TS-aware runner for our scripts; but they are .js now)
  out = out.replace(/\btsx\b(?=\s|$)/g, "node")
  // jest stays; the runner config will be updated separately
  return out
}

function fixPathString(v) {
  if (typeof v !== "string") return v
  if (v.endsWith(".tsx")) return v.slice(0, -4) + ".js"
  if (v.endsWith(".ts")) return v.slice(0, -3) + ".js"
  return v
}

function walkPaths(node) {
  if (node == null) return node
  if (typeof node === "string") return fixPathString(node)
  if (Array.isArray(node)) return node.map(walkPaths)
  if (typeof node === "object") {
    const out = {}
    for (const [k, v] of Object.entries(node)) out[k] = walkPaths(v)
    return out
  }
  return node
}

async function main() {
  for (const rel of PKG_FILES) {
    const full = path.join(ROOT, rel)
    let raw
    try {
      raw = await fs.readFile(full, "utf8")
    } catch {
      continue
    }
    const pkg = JSON.parse(raw)
    const before = JSON.stringify(pkg)

    // Convert scripts
    if (pkg.scripts) {
      for (const [k, v] of Object.entries(pkg.scripts)) {
        const next = convertScript(v)
        if (next !== v) pkg.scripts[k] = next
      }
      // Drop typecheck/typecheck:* if they only run tsgo/tsc and now noop
      if (pkg.scripts.typecheck && /^echo /.test(pkg.scripts.typecheck)) delete pkg.scripts.typecheck
    }

    // Remove TS deps
    for (const field of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
      const deps = pkg[field]
      if (!deps) continue
      for (const name of Object.keys(deps)) {
        if (isTypeDep(name)) delete deps[name]
      }
    }

    // Drop top-level types/typings
    delete pkg.types
    delete pkg.typings

    // Fix paths in exports/imports/main/module/bin
    for (const key of ["main", "module", "bin"]) {
      if (pkg[key]) pkg[key] = walkPaths(pkg[key])
    }
    if (pkg.exports) pkg.exports = walkPaths(pkg.exports)
    if (pkg.imports) pkg.imports = walkPaths(pkg.imports)

    if (JSON.stringify(pkg) !== before) {
      await fs.writeFile(full, JSON.stringify(pkg, null, 2) + "\n")
      console.log("updated:", rel)
    }
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
