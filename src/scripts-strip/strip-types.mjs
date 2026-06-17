#!/usr/bin/env node
/** @file Build-tooling script that converts every `.ts`/`.tsx` file in the repo into plain `.js` via babel (stripping types and compiling Solid/React JSX per package), deletes the originals and `.d.ts` files. */
// Convert every .ts/.tsx in the repo into plain .js.
//
// Pipeline:
//   1. @babel/preset-typescript  →  strip type syntax + emit imports as plain ESM
//   2. babel-preset-solid (Solid packages) OR @babel/preset-react (mail) OR none
//      (TUI uses @opentui/solid, which uses the same babel-preset-solid plumbing
//      but with `moduleName` set to "@opentui/solid"; we mirror its config.)
//   3. Strip the `type` keyword from `import { type Foo }` (handled by the TS preset)
//   4. Delete original .ts/.tsx, write equivalent .js
//
// Solid JSX gets fully compiled into hyperscript-style runtime calls so the
// emitted .js files contain no JSX syntax.

import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import babel from "@babel/core"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.resolve(__dirname, "..")

const EXCLUDE_DIRS = new Set(["node_modules", ".git", "dist", "build", ".output", ".turbo", ".next"])

// Per-package JSX configuration. Keys are absolute path prefixes; longest
// match wins.
const JSX_CONFIG = [
  { prefix: path.join(ROOT, "packages/closedcode"), kind: "solid", moduleName: "@opentui/solid" },
  { prefix: path.join(ROOT, "packages"), kind: "solid", moduleName: "solid-js" },
  { prefix: path.join(ROOT, "sdks"), kind: "none" },
  { prefix: ROOT, kind: "none" },
]

/**
 * Select the JSX/babel configuration for a file by longest matching path prefix.
 * @param {string} filepath - Absolute path of the file being transformed.
 * @returns {Object} The matching JSX_CONFIG entry, or a fallback object with kind "none".
 */
function pickJsxConfig(filepath) {
  let best = null
  for (const c of JSX_CONFIG) {
    if (filepath.startsWith(c.prefix + path.sep) || filepath === c.prefix) {
      if (!best || c.prefix.length > best.prefix.length) best = c
    }
  }
  return best ?? { kind: "none" }
}

/**
 * Recursively collect TypeScript files under a directory, splitting `.d.ts`
 * declaration files from transformable `.ts`/`.tsx` sources, skipping excluded dirs.
 * @param {string} dir - Directory to walk.
 * @param {Object} out - Accumulator with `tsfiles` and `dts` arrays that paths are pushed onto.
 * @returns {Promise<void>}
 */
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
    if (e.isDirectory()) {
      await walk(full, out)
    } else if (e.isFile()) {
      if (full.endsWith(".d.ts")) {
        out.dts.push(full)
      } else if (full.endsWith(".ts") || full.endsWith(".tsx")) {
        out.tsfiles.push(full)
      }
    }
  }
}

/**
 * Build the babel transform options for a file: always the TypeScript preset,
 * plus the Solid or React JSX preset for `.tsx` files according to the package config.
 * @param {string} filepath - Absolute path of the file being transformed.
 * @returns {Object} A babel transformAsync options object.
 */
function buildBabelOptions(filepath) {
  const isTsx = filepath.endsWith(".tsx")
  const cfg = pickJsxConfig(filepath)
  const presets = [
    [
      "@babel/preset-typescript",
      {
        isTSX: isTsx,
        allExtensions: true,
        onlyRemoveTypeImports: false,
        optimizeConstEnums: true,
        allowDeclareFields: true,
      },
    ],
  ]
  if (isTsx) {
    if (cfg.kind === "solid") {
      presets.push(["babel-preset-solid", { moduleName: cfg.moduleName ?? "solid-js" }])
    } else if (cfg.kind === "react") {
      presets.push(["@babel/preset-react", { runtime: "automatic" }])
    }
    // kind === "none": leave JSX as-is (only for .ts files this branch is unreachable).
  }
  return {
    filename: filepath,
    babelrc: false,
    configFile: false,
    sourceMaps: false,
    presets,
    // Keep ESM
    sourceType: "module",
    // Babel by default rewrites class fields etc.; we want minimal transforms.
    assumptions: { setPublicClassFields: true },
  }
}

/**
 * Read a single TypeScript file and return its babel-transformed JavaScript code.
 * @param {string} filepath - Absolute path of the file to transform.
 * @returns {Promise<string>} The emitted JavaScript source.
 */
async function transformOne(filepath) {
  const code = await fs.readFile(filepath, "utf8")
  const opts = buildBabelOptions(filepath)
  const result = await babel.transformAsync(code, opts)
  if (!result || result.code == null) throw new Error("babel produced no output")
  return result.code
}

/**
 * Compute the `.js` output path for a `.ts`/`.tsx` source file.
 * @param {string} filepath - Absolute source path.
 * @returns {string} The equivalent `.js` path (unchanged if not a `.ts`/`.tsx` file).
 */
function newPath(filepath) {
  if (filepath.endsWith(".tsx")) return filepath.slice(0, -4) + ".js"
  if (filepath.endsWith(".ts")) return filepath.slice(0, -3) + ".js"
  return filepath
}

/**
 * Entry point: collect all TypeScript files, transform `.ts`/`.tsx` sources to
 * `.js` in batches (deleting originals), remove `.d.ts` files, and report results.
 * @returns {Promise<void>}
 */
async function main() {
  const out = { tsfiles: [], dts: [] }
  await walk(ROOT, out)
  console.log("ts/tsx files :", out.tsfiles.length)
  console.log("d.ts files   :", out.dts.length)

  let ok = 0,
    fail = 0
  const failures = []

  const batchSize = 24
  for (let i = 0; i < out.tsfiles.length; i += batchSize) {
    const batch = out.tsfiles.slice(i, i + batchSize)
    await Promise.all(
      batch.map(async (file) => {
        try {
          const transformed = await transformOne(file)
          const target = newPath(file)
          if (target !== file) {
            await fs.writeFile(target, transformed)
            await fs.unlink(file)
          } else {
            await fs.writeFile(file, transformed)
          }
          ok++
        } catch (e) {
          fail++
          failures.push({ file, error: e.message })
        }
      }),
    )
    if ((i / batchSize) % 10 === 0) {
      process.stdout.write(`\r  transformed: ${ok}/${out.tsfiles.length} (failures: ${fail})`)
    }
  }
  process.stdout.write("\n")

  for (const dts of out.dts) {
    try {
      await fs.unlink(dts)
    } catch {}
  }

  console.log(`done. ok=${ok} fail=${fail} dts-removed=${out.dts.length}`)
  if (failures.length) {
    console.log(`\nFirst ${Math.min(20, failures.length)} failures:`)
    for (const f of failures.slice(0, 20)) {
      console.log(" -", path.relative(ROOT, f.file))
      console.log("    ", f.error.split("\n")[0])
    }
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
