#!/usr/bin/env node
// vite-free build for desktop-electron.
//
//   1. tailwindcss CLI compiles the renderer stylesheet
//   2. esbuild bundles main / preload / renderer (with custom plugins for
//      Vite-specific patterns: `?worker&url`, `import.meta.glob`, css imports)
//   3. icons spritesheets are reused as-is (already generated under
//      packages/ui/src/components/{file,provider,app}-icons/sprite.svg)
//   4. closedcode-server sidecar is copied next to main bundle

import { build as esbuild } from "esbuild"
import { spawn, spawnSync } from "node:child_process"
import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { glob } from "glob"

function resolveBuildId() {
  if (process.env.BUILD_ID) return process.env.BUILD_ID
  const out = spawnSync("git", ["rev-parse", "--short=12", "HEAD"], { encoding: "utf8" })
  if (out.status === 0) return out.stdout.trim()
  return "unknown"
}
const buildId = resolveBuildId()

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dir = path.resolve(__dirname, "..")
process.chdir(dir)

const channel = (() => {
  const raw = process.env.CLOSEDCODE_CHANNEL
  if (raw === "dev" || raw === "beta" || raw === "prod") return raw
  return "prod"
})()

const repoRoot = path.resolve(dir, "../..")
const appDir = path.resolve(dir, "../app")
const uiDir = path.resolve(dir, "../ui")
const closedcodeServerDist = path.resolve(dir, "../closedcode/dist/node")
const nodePtyPkg = `@lydell/node-pty-${process.platform}-${process.arch}`

await fs.rm("out", { recursive: true, force: true })
await fs.mkdir("out/main/closedcode-server", { recursive: true })
await fs.mkdir("out/preload", { recursive: true })
await fs.mkdir("out/renderer/assets", { recursive: true })
await fs.mkdir("out/renderer/workers", { recursive: true })

const define = {
  "import.meta.env.CLOSEDCODE_CHANNEL": JSON.stringify(channel),
  "import.meta.env.MODE": JSON.stringify("production"),
  "import.meta.env.DEV": "false",
  "import.meta.env.PROD": "true",
  "import.meta.env.VITE_CLOSEDCODE_CHANNEL": JSON.stringify(channel),
  "import.meta.env.VITE_SENTRY_DSN": JSON.stringify(process.env.VITE_SENTRY_DSN ?? ""),
  "import.meta.env.VITE_SENTRY_RELEASE": JSON.stringify(process.env.VITE_SENTRY_RELEASE ?? ""),
  "import.meta.env.VITE_SENTRY_ENVIRONMENT": JSON.stringify(process.env.VITE_SENTRY_ENVIRONMENT ?? ""),
  "import.meta.env.VITE_BUILD_ID": JSON.stringify(buildId),
}

// ---- shared esbuild plugins for renderer build -----------------------------

// CSS imports inside JS are picked up by tailwindcss-cli, not esbuild.
// Replace them with empty modules so esbuild doesn't try to bundle CSS.
const stripCssImports = {
  name: "strip-css-imports",
  setup(b) {
    b.onResolve({ filter: /\.css$/ }, () => ({ path: "stripped:css", namespace: "stripped-css" }))
    b.onLoad({ filter: /.*/, namespace: "stripped-css" }, () => ({ contents: "export default {}", loader: "js" }))
  },
}

// Vite-specific `?worker&url` import → emit the target as a separate bundle
// under out/renderer/workers/ and substitute its URL string.
const workerUrlPlugin = {
  name: "worker-url",
  setup(b) {
    const cache = new Map()
    b.onResolve({ filter: /\?worker(?:&url)?$/ }, async (args) => {
      const cleanPath = args.path.replace(/\?worker(?:&url)?$/, "")
      // Resolve relative to importer
      let absPath
      if (cleanPath.startsWith(".") || cleanPath.startsWith("/")) {
        absPath = path.resolve(path.dirname(args.importer), cleanPath)
      } else {
        // bare specifier — let Node resolve
        const r = await b.resolve(cleanPath, { resolveDir: path.dirname(args.importer), kind: "import-statement" })
        if (r.errors.length) return { errors: r.errors }
        absPath = r.path
      }
      return { path: absPath, namespace: "worker-url", pluginData: { absPath } }
    })
    b.onLoad({ filter: /.*/, namespace: "worker-url" }, async (args) => {
      const absPath = args.pluginData.absPath
      let url = cache.get(absPath)
      if (!url) {
        const baseName = path.basename(absPath, path.extname(absPath))
        const hash = Math.random().toString(36).slice(2, 8)
        const outFile = `out/renderer/workers/${baseName}-${hash}.js`
        await esbuild({
          entryPoints: [absPath],
          outfile: outFile,
          bundle: true,
          platform: "browser",
          target: ["chrome120"],
          format: "iife",
          minify: false,
          plugins: [stripCssImports],
        })
        url = `./workers/${baseName}-${hash}.js`
        cache.set(absPath, url)
      }
      return { contents: `export default ${JSON.stringify(url)}`, loader: "js" }
    })
  },
}

// `import.meta.glob(pattern, opts?)` → expand at build time into an object
// literal mapping resolved relative paths to dynamic import functions.
const importMetaGlobPlugin = {
  name: "import-meta-glob",
  setup(b) {
    b.onLoad({ filter: /\.(?:m?js|jsx)$/, namespace: "file" }, async (args) => {
      // skip node_modules
      if (args.path.includes("/node_modules/")) return null
      const src = await fs.readFile(args.path, "utf8")
      if (!src.includes("import.meta.glob")) return null
      const re = /import\.meta\.glob\(\s*(["'`])([^"'`]+)\1(?:\s*,\s*(\{[^)]*\}))?\s*\)/g
      let m
      let next = src
      const replacements = []
      while ((m = re.exec(src)) !== null) {
        const [full, , pattern, optsRaw] = m
        // Resolve glob relative to args.path
        const dir = path.dirname(args.path)
        const absPattern = path.resolve(dir, pattern)
        const files = await glob(absPattern, { absolute: true, nodir: true })
        const eager = optsRaw?.includes("eager:true") || optsRaw?.includes("eager: true")
        const queryMatch = optsRaw?.match(/query:\s*["']([^"']+)["']/)
        const asMatch = optsRaw?.match(/as:\s*["']([^"']+)["']/)
        // Vite's `import: "default"` (or "name") option unwraps the module
        // namespace so callers get the named export directly instead of
        // `{ default: ... }`. Without this, `playSound(src)` receives the
        // module object and `new Audio(src)` blows up with String.toString.
        const importMatch = optsRaw?.match(/import:\s*["']([^"']+)["']/)
        const suffix = queryMatch ? `?${queryMatch[1]}` : asMatch ? `?${asMatch[1]}` : ""
        const unwrap = importMatch ? `.then(m => m[${JSON.stringify(importMatch[1])}])` : ""
        const eagerAccess = importMatch ? `[${JSON.stringify(importMatch[1])}]` : ""
        const entries = files.map((abs) => {
          const rel = "./" + path.relative(dir, abs)
          if (eager) return `${JSON.stringify(rel)}: (await import(${JSON.stringify(rel + suffix)}))${eagerAccess}`
          return `${JSON.stringify(rel)}: () => import(${JSON.stringify(rel + suffix)})${unwrap}`
        })
        const obj = `{${entries.join(", ")}}`
        replacements.push({ start: m.index, end: m.index + full.length, text: obj })
      }
      if (!replacements.length) return null
      replacements.sort((a, b) => b.start - a.start)
      for (const r of replacements) next = next.slice(0, r.start) + r.text + next.slice(r.end)
      return { contents: next, loader: args.path.endsWith(".jsx") ? "jsx" : "js" }
    })
  },
}

// `?url` and `?raw` import suffixes for arbitrary assets.
const assetSuffixPlugin = {
  name: "asset-suffix",
  setup(b) {
    b.onResolve({ filter: /\?(url|raw|inline)$/ }, async (args) => {
      const m = args.path.match(/^(.+?)\?(url|raw|inline)$/)
      const cleanPath = m[1]
      const suffix = m[2]
      let absPath
      if (cleanPath.startsWith(".") || cleanPath.startsWith("/")) {
        absPath = path.resolve(path.dirname(args.importer), cleanPath)
      } else {
        const r = await b.resolve(cleanPath, { resolveDir: path.dirname(args.importer), kind: "import-statement" })
        if (r.errors.length) return { errors: r.errors }
        absPath = r.path
      }
      return { path: absPath, namespace: "asset-" + suffix }
    })
    b.onLoad({ filter: /.*/, namespace: "asset-url" }, async (args) => {
      // Reuse esbuild's file loader by passing the path back through
      const buf = await fs.readFile(args.path)
      const ext = path.extname(args.path).slice(1) || "bin"
      const hash = Math.random().toString(36).slice(2, 8)
      const outName = `${path.basename(args.path, path.extname(args.path))}-${hash}.${ext}`
      await fs.writeFile(`out/renderer/assets/${outName}`, buf)
      return { contents: `export default ${JSON.stringify("./assets/" + outName)}`, loader: "js" }
    })
    b.onLoad({ filter: /.*/, namespace: "asset-raw" }, async (args) => {
      const text = await fs.readFile(args.path, "utf8")
      return { contents: `export default ${JSON.stringify(text)}`, loader: "js" }
    })
    b.onLoad({ filter: /.*/, namespace: "asset-inline" }, async (args) => {
      const buf = await fs.readFile(args.path)
      const dataUrl = `data:application/octet-stream;base64,${buf.toString("base64")}`
      return { contents: `export default ${JSON.stringify(dataUrl)}`, loader: "js" }
    })
  },
}

// ---- main + preload: NOT bundled (Stage B: build-less) ---------------------
// main runs directly from src/main/index.js (package.json "main") and preload
// from src/preload/index.js — both use createRequire()/require() for "electron",
// so no esbuild bundling is needed. We only copy the closedcode sidecar next to
// out/main so the sidecar resolver (resolveSidecarUrl in server.js) can find it.

console.log("[1/5] copy closedcode-server sidecar...")
// dist/node now ships an assets/ directory (fs-read text assets, Stage 2 of
// pure-vanilla) alongside the bundle — copy recursively, not file-by-file.
for (const f of await fs.readdir(closedcodeServerDist, { withFileTypes: true })) {
  const from = path.join(closedcodeServerDist, f.name)
  const to = `out/main/closedcode-server/${f.name}`
  if (f.isDirectory()) await fs.cp(from, to, { recursive: true })
  else await fs.copyFile(from, to)
}

// ---- renderer: NOT bundled (Stage C: build-less, native ESM) ---------------
// The renderer runs as native ESM served by the vcc:// protocol handler
// (src/main/windows.js), which serves packages/app/src + src/renderer +
// node_modules and rewrites bare import specifiers on the fly. No esbuild bundle.
// We only copy the .aac sound assets referenced by utils/sound.js (./assets/audio/).
console.log("[2/5] copy renderer audio assets...")
{
  const audioSrc = path.join(repoRoot, "packages/app/src/vendor/ui/assets/audio")
  const audioDst = "out/renderer/assets/audio"
  await fs.mkdir(audioDst, { recursive: true })
  for (const entry of await fs.readdir(audioSrc, { withFileTypes: true })) {
    if (entry.isFile()) await fs.copyFile(path.join(audioSrc, entry.name), path.join(audioDst, entry.name))
  }
}

// ---- workspace source trees for packaged build-less -------------------------
// When electron-builder packages the app, the vcc:// resolver needs the renderer
// source code inside the asar. Copy workspace packages' src trees and create
// package.json stubs so bare imports (*) resolve correctly.
console.log("[3/5] copy workspace source trees for packaged build-less...")
await copyDir(path.join(repoRoot, "packages/app/src"), "out/app-src")
await copyDir(path.join(repoRoot, "packages/sdk/js/src"), "out/sdk-src")
await copyDir(path.join(repoRoot, "packages/core/src"), "out/core-src")

// Create workspace package.json stubs — exports point back to the copied trees.
// The stub paths are relative to the stub's directory (out/node_modules/<pkg>/).
const stubs = {
  app: {
    name: "app", version: "1.0.0", type: "module",
    exports: { ".": "../../app-src/index.js", "./index.css": "../../app-src/index.css" },
  },
  sdk: {
    name: "sdk", version: "1.0.0", type: "module",
    exports: {
      ".": "../../sdk-src/index.js",
      "./client": "../../sdk-src/client.js",
      "./server": "../../sdk-src/server.js",
      "./v2": "../../sdk-src/v2/index.js",
      "./v2/client": "../../sdk-src/v2/client.js",
      "./v2/gen/client": "../../sdk-src/v2/gen/client/index.js",
      "./v2/server": "../../sdk-src/v2/server.js",
    },
  },
  core: {
    name: "core", version: "1.0.0", type: "module",
    exports: { "./*": "../../core-src/*.js" },
  },
}
for (const [name, pj] of Object.entries(stubs)) {
  const stubDir = `out/node_modules/${name}`
  await fs.mkdir(stubDir, { recursive: true })
  await fs.writeFile(path.join(stubDir, "package.json"), JSON.stringify(pj, null, 2))
}

console.log("[4/5] css (plain — no tailwind at build time)...")
// Tailwind is removed from the build. The app stylesheet is the pre-generated plain
// CSS at app/public/app.css (produced once via `npx tailwindcss -i src/index.css`,
// committed; regenerate manually when source CSS changes). It is copied to
// out/renderer/app.css by the public/ copy step below. Bootstrap + Bootstrap Icons
// are vendored under app/public/vendor/bootstrap and loaded as static <link>s.
// Here we only copy the small topbar overrides stylesheet next to the HTML.
await fs.copyFile(path.join(dir, "src/renderer/styles.css"), "out/renderer/styles.css")

// ---- HTML emit + public assets [5/5] ----------------------------------------
console.log("[5/5] emit HTML + copy public assets...")

async function emitHtml(srcName, outName, entry) {
  const html = await fs.readFile(path.join(dir, `src/renderer/${srcName}`), "utf8")
  const out = html
    .replace(/<script[^>]*src="\.\/(?:index|loading)\.js"[^>]*><\/script>/, "")
    .replace(/<\/body>/, `  <script type="module" src="/@fs/packages/desktop-electron/src/renderer/${entry}.js"></script>\n  </body>`)
  await fs.writeFile(`out/renderer/${outName}`, out)
}

// Native-ESM entries served at their canonical /@fs/ path so cross-package
// relative imports (e.g. ../../../app/src/...) resolve against the real tree.
await emitHtml("index.html", "index.html", "index")
await emitHtml("loading.html", "loading.html", "loading")

// ---- public assets ---------------------------------------------------------

async function copyDir(src, dst) {
  await fs.mkdir(dst, { recursive: true })
  for (const entry of await fs.readdir(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name)
    const d = path.join(dst, entry.name)
    if (entry.isDirectory()) await copyDir(s, d)
    else await fs.copyFile(s, d)
  }
}
await copyDir(path.join(appDir, "public"), "out/renderer")

console.log("done.")
