#!/usr/bin/env node
/** @file Prepare step: runs prebuild and syncs package.json version to the shared Script.version. */
import { readFile, writeFile } from "node:fs/promises"
import { Script } from "script"
await import("./prebuild.js")
const pkg = JSON.parse(await readFile("./package.json", "utf8"))
pkg.version = Script.version
await writeFile("./package.json", JSON.stringify(pkg, null, 2) + "\n")
console.log(`Updated package.json version to ${Script.version}`)
