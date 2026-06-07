#!/usr/bin/env node
// closedcode's TUI uses @opentui/solid (a non-DOM Solid renderer). The initial
// pass compiled its .tsx with the default "dom" generator, which produced
// imports for `template`/`setAttribute`/`delegateEvents`/etc. that @opentui/solid
// doesn't expose. Re-transform those files with the universal generator pointed
// at @opentui/solid so the emitted code uses createElement/createTextNode/etc.
//
// Originals are recovered from git HEAD.

import fs from "node:fs/promises"
import path from "node:path"
import { execSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import babel from "@babel/core"

// Repo root (this script lives in <root>/src/scripts-strip).
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..")

const TUI_TSX = execSync(
  `git -C "${ROOT}" ls-tree -r HEAD --name-only | grep -E '^src/packages/closedcode/src/cli/cmd/tui/.*\\.tsx$'`,
  { encoding: "utf-8" },
).trim().split("\n").filter(Boolean)

console.log(`re-transforming ${TUI_TSX.length} TUI .tsx files with universal generator + @opentui/solid`)

const failures = []
let ok = 0
for (const rel of TUI_TSX) {
  const original = execSync(`git -C "${ROOT}" show HEAD:"${rel}"`, { encoding: "utf-8" })
  const abs = path.join(ROOT, rel)
  const targetJs = abs.replace(/\.tsx$/, ".js")
  try {
    const result = await babel.transformAsync(original, {
      filename: abs,
      babelrc: false,
      configFile: false,
      sourceType: "module",
      presets: [
        ["@babel/preset-typescript", { isTSX: true, allExtensions: true, allowDeclareFields: true }],
        ["babel-preset-solid", { generate: "universal", moduleName: "@opentui/solid" }],
      ],
    })
    if (!result || result.code == null) throw new Error("babel produced no output")
    await fs.writeFile(targetJs, result.code)
    ok++
  } catch (e) {
    failures.push({ file: rel, error: e.message.split("\n")[0] })
  }
}

console.log(`done. ok=${ok} fail=${failures.length}`)
if (failures.length) {
  for (const f of failures.slice(0, 10)) console.log(" -", f.file, ":", f.error)
}
