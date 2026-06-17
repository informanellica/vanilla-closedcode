#!/usr/bin/env node
/** @file Build-tooling script that rewrites `.ts`/`.tsx` file paths embedded in package.json `scripts` entries to `.js` after the type-strip pass. */
// After the type-strip pass, package.json scripts like "node script/build.ts" still
// reference the old TS path. Rewrite those to .js.

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

const PATH_RE = /(\S+)\.tsx?(?=\s|$|"|')/g

/**
 * Rewrite any `.ts`/`.tsx` file path tokens in a script command to `.js`.
 * @param {string} s - The original script command (non-strings pass through unchanged).
 * @returns {string} The rewritten script command.
 */
function fixScript(s) {
  if (typeof s !== "string") return s
  return s.replace(PATH_RE, "$1.js")
}

/**
 * Entry point: for each known package.json, rewrite `.ts`/`.tsx` paths in its
 * `scripts` entries to `.js` and write back any file that changed.
 * @returns {Promise<void>}
 */
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
    let changed = false
    if (pkg.scripts) {
      for (const [k, v] of Object.entries(pkg.scripts)) {
        const next = fixScript(v)
        if (next !== v) {
          pkg.scripts[k] = next
          changed = true
        }
      }
    }
    if (changed) {
      await fs.writeFile(full, JSON.stringify(pkg, null, 2) + "\n")
      console.log("updated:", rel)
    }
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
