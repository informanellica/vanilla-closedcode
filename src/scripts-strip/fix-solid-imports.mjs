#!/usr/bin/env node
// babel-preset-solid emits imports like `import { template as _$template } from "X"`.
// We told babel `moduleName: "solid-js"` (and "@opentui/solid" for closedcode),
// but for web Solid the DOM helpers live in `solid-js/web` (not `solid-js`).
// This script retroactively rewrites the generated imports.

import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, "..")

const EXCLUDE_DIRS = new Set(["node_modules", ".git", "dist", "build", ".output", ".turbo", ".next"])

// closedcode → @opentui/solid (already correct moduleName)
// every other Solid package → solid-js/web for DOM helpers
const WEB_PREFIX = path.join(ROOT, "packages") + path.sep
const CLOSEDCODE_PREFIX = path.join(ROOT, "packages/closedcode") + path.sep

async function walk(dir, out) {
  let entries
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    if (EXCLUDE_DIRS.has(e.name)) continue
    const full = path.join(dir, e.name)
    if (e.isDirectory()) await walk(full, out)
    else if (e.isFile() && full.endsWith(".js")) out.push(full)
  }
}

// Helper names babel-preset-solid emits with `_$` prefix that come from
// `solid-js/web` rather than `solid-js`.
const WEB_HELPERS = new Set([
  "template",
  "insert",
  "spread",
  "createComponent",
  "delegateEvents",
  "addEventListener",
  "classList",
  "style",
  "setAttribute",
  "setAttributeNS",
  "setBoolAttribute",
  "setStyleProperty",
  "setStyleAttribute",
  "effect",
  "memo",
  "getNextElement",
  "getOwner",
  "use",
  "ssr",
  "ssrElement",
  "ssrHydrationKey",
  "ssrAttribute",
  "ssrClassList",
  "ssrStyle",
  "escape",
  "mergeProps",
  "splitProps",
  "getHydrationKey",
  "createDeferred",
  "renderToString",
  "render",
  "hydrate",
  "innerHTML",
  "dynamicProperty",
  "Aliases",
  "nextElement",
])

function rewriteImport(file, importLine) {
  // Match `import { X as _$Y } from "solid-js"`. The `_$` prefix is babel-preset-solid's
  // signature — whenever the line uses it and pulls from "solid-js", redirect to "solid-js/web".
  // For closedcode (OpenTUI), the source moduleName already pointed at @opentui/solid
  // so it's correct.
  const m = importLine.match(/^import\s*\{\s*([^}]+)\}\s*from\s*"(solid-js)";?\s*$/)
  if (!m) return null
  if (!/_\$/.test(m[1])) return null
  if (file.startsWith(CLOSEDCODE_PREFIX)) return null
  return importLine.replace(/from\s*"solid-js"/, `from "solid-js/web"`)
}

async function main() {
  const files = []
  await walk(ROOT, files)
  console.log("scanning", files.length, "files")
  let touched = 0
  for (const file of files) {
    const src = await fs.readFile(file, "utf8")
    const lines = src.split("\n")
    let changed = false
    for (let i = 0; i < lines.length; i++) {
      const next = rewriteImport(file, lines[i])
      if (next) {
        lines[i] = next
        changed = true
      }
    }
    if (changed) {
      await fs.writeFile(file, lines.join("\n"))
      touched++
    }
  }
  console.log("touched", touched, "files")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
