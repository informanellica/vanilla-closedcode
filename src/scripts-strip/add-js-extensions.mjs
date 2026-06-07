#!/usr/bin/env node
// Node ESM rejects relative/path-alias imports without a file extension.
// Walk every .js/.mjs/.jsx file in the repo and add `.js` (or expand to
// `index.js` for directories) to:
//   - `./foo`, `../bar`
//   - `@/foo`, `@tui/foo`, `@test/foo`  (project path aliases)
// Skip:
//   - bare module specifiers (no leading dot/@)
//   - imports that already have a file extension
//   - `#db` / `#pty` (subpath imports, resolved by package.json)

import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, "..")

const EXCLUDE_DIRS = new Set(["node_modules", ".git", "dist", "build", ".output", ".turbo", ".next"])
const SOURCE_EXTS = new Set([".js", ".mjs", ".cjs"])

// Per-project alias roots. Resolved relative to the importing file.
const PATH_ALIASES = {
  "@/": (file) => findPackageRoot(file, "src"),
  "@tui/": (file) => findPackageRoot(file, "src/cli/cmd/tui"),
  "@test/": (file) => findPackageRoot(file, "test"),
}

function findPackageRoot(file, sub) {
  // Walk up until we find a package.json sibling
  let dir = path.dirname(file)
  while (dir.length > ROOT.length) {
    try {
      const pkg = path.join(dir, "package.json")
      if (existsSync(pkg)) return path.join(dir, sub)
    } catch {}
    dir = path.dirname(dir)
  }
  return null
}

import * as fsSync from "node:fs"

function existsSync(p) {
  try {
    return fsSync.statSync(p) !== undefined
  } catch {
    return false
  }
}

function statSafe(p) {
  try {
    return fsSync.statSync(p)
  } catch {
    return null
  }
}

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
    else if (e.isFile() && SOURCE_EXTS.has(path.extname(full))) out.push(full)
  }
}

const IMPORT_RE = /((?:^|\W)(?:import|export)\s+(?:[^"';]*?from\s+)?|(?:^|\W)import\s*\(\s*)(["'])([^"']+)\2/gm

function hasExt(spec) {
  return /\.(?:m?[jt]sx?|json|wasm|css|node|wav|scm|html)(?:\?[^"']*)?$/.test(spec)
}

function resolveRelative(importingFile, spec) {
  const dir = path.dirname(importingFile)
  return path.resolve(dir, spec)
}

function tryResolve(absPath) {
  // Try absPath.js
  let stat = statSafe(absPath + ".js")
  if (stat && stat.isFile()) return ".js"
  // Try directory/index.js
  stat = statSafe(absPath)
  if (stat && stat.isDirectory()) {
    const idx = statSafe(path.join(absPath, "index.js"))
    if (idx && idx.isFile()) return "/index.js"
  }
  // Try .jsx (we should have already converted, but defensive)
  stat = statSafe(absPath + ".jsx")
  if (stat && stat.isFile()) return ".jsx"
  return null
}

function transformSpec(importingFile, spec) {
  if (hasExt(spec)) return spec
  // Skip absolute http(s)
  if (spec.startsWith("http:") || spec.startsWith("https:")) return spec
  // Subpath imports stay
  if (spec.startsWith("#")) return spec
  // Path aliases
  for (const [prefix, rootResolver] of Object.entries(PATH_ALIASES)) {
    if (spec.startsWith(prefix)) {
      const root = rootResolver(importingFile)
      if (!root) return spec
      const sub = spec.slice(prefix.length)
      const abs = path.join(root, sub)
      const ext = tryResolve(abs)
      if (ext) return spec + ext
      return spec
    }
  }
  // Relative imports
  if (spec.startsWith(".")) {
    const abs = resolveRelative(importingFile, spec)
    const ext = tryResolve(abs)
    if (ext) return spec + ext
    return spec
  }
  return spec
}

async function main() {
  const files = []
  await walk(ROOT, files)
  console.log("scanning", files.length, "files")

  let touched = 0
  for (const file of files) {
    const src = await fs.readFile(file, "utf8")
    const next = src.replace(IMPORT_RE, (m, head, q, spec) => head + q + transformSpec(file, spec) + q)
    if (next !== src) {
      await fs.writeFile(file, next)
      touched++
    }
  }
  console.log("touched", touched, "files")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
