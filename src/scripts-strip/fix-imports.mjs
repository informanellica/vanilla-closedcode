#!/usr/bin/env node
// Rewrite relative imports that still reference .ts/.tsx into .js.
//
// We also normalize: trailing `from "./foo"` is left as-is (Node ESM accepts
// directory or extensionless if jsconfig/package.json sees it). We only
// transform explicit `.ts` / `.tsx` suffixes — those came from TS source.

import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, "..")

const EXCLUDE_DIRS = new Set(["node_modules", ".git", "dist", "build", ".output", ".turbo", ".next"])

const TARGET_EXTS = new Set([".js", ".mjs", ".cjs", ".jsx", ".json"])

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
    else if (e.isFile() && TARGET_EXTS.has(path.extname(full))) out.push(full)
  }
}

const IMPORT_RE = /((?:import|export)\s+[^"';]*?from\s+|import\s*\(\s*)(["'])([^"']+)\2/g

function transformSpec(spec) {
  // Only relative paths
  if (!spec.startsWith(".") && !spec.startsWith("/") && !spec.startsWith("@/") && !spec.startsWith("@tui/") && !spec.startsWith("@test/")) return spec
  if (spec.endsWith(".tsx")) return spec.slice(0, -4) + ".js"
  if (spec.endsWith(".ts")) return spec.slice(0, -3) + ".js"
  return spec
}

async function main() {
  const files = []
  await walk(ROOT, files)
  console.log("scanning", files.length, "files")

  let touched = 0
  for (const file of files) {
    const src = await fs.readFile(file, "utf8")
    const next = src.replace(IMPORT_RE, (m, head, q, spec) => head + q + transformSpec(spec) + q)
    if (next !== src) {
      await fs.writeFile(file, next)
      touched++
    }
  }
  console.log("rewrote", touched, "files")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
