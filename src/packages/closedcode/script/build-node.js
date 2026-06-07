#!/usr/bin/env node
/* Node/esbuild build script */
import { Script } from "script"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { build as esbuild } from "esbuild"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const dir = path.resolve(__dirname, "..")
process.chdir(dir)
await import("./generate.js")

const migrationDirs = (
  await fs.promises.readdir(path.join(dir, "migration"), { withFileTypes: true })
)
  .filter((entry) => entry.isDirectory() && /^\d{4}\d{2}\d{2}\d{2}\d{2}\d{2}/.test(entry.name))
  .map((entry) => entry.name)
  .sort()
const migrations = await Promise.all(
  migrationDirs.map(async (name) => {
    const file = path.join(dir, "migration", name, "migration.sql")
    const sql = await fs.promises.readFile(file, "utf8")
    const match = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/.exec(name)
    const timestamp = match
      ? Date.UTC(
          Number(match[1]),
          Number(match[2]) - 1,
          Number(match[3]),
          Number(match[4]),
          Number(match[5]),
          Number(match[6]),
        )
      : 0
    return { sql, timestamp, name }
  }),
)
console.log(`Loaded ${migrations.length} migrations`)

const ALIASES = [
  { prefix: "@/", replace: path.join(dir, "src") + "/" },
  { prefix: "@tui/", replace: path.join(dir, "src/cli/cmd/tui") + "/" },
  { prefix: "@test/", replace: path.join(dir, "test") + "/" },
  { prefix: "#db", replace: path.join(dir, "src/storage/db.node.js") },
  { prefix: "#pty", replace: path.join(dir, "src/pty/pty.node.js") },
]
const pathAliases = {
  name: "path-aliases",
  setup(build) {
    build.onResolve({ filter: /^(@\/|@tui\/|@test\/|#(db|pty)$)/ }, (args) => {
      for (const a of ALIASES) {
        if (a.prefix === "#db" || a.prefix === "#pty") {
          if (args.path === a.prefix) return { path: a.replace }
        } else if (args.path.startsWith(a.prefix)) {
          let p = a.replace + args.path.slice(a.prefix.length)
          if (!p.endsWith(".js") && !p.endsWith(".json")) p += ".js"
          return { path: p }
        }
      }
      return null
    })
  },
}

const EXTERNAL_NATIVE = new Set([
  "bun",
  "@lydell/node-pty",
  "node-pty",
  "tree-sitter",
  "tree-sitter-bash",
  "tree-sitter-powershell",
  "web-tree-sitter",
  "koffi",
])
const externalize = {
  name: "externalize-natives",
  setup(build) {
    build.onResolve({ filter: /.*/ }, (args) => {
      if (args.kind === "entry-point") return null
      if (args.path.startsWith(".") || args.path.startsWith("/")) return null
      if (args.path.startsWith("@/") || args.path.startsWith("@tui/") || args.path.startsWith("#")) return null
      const pkgName = args.path.startsWith("@") ? args.path.split("/").slice(0, 2).join("/") : args.path.split("/")[0]
      if (EXTERNAL_NATIVE.has(pkgName)) return { path: args.path, external: true }
      return null
    })
  },
}

// Optional peer deps that some transitive packages reference behind feature
// flags we never exercise (e.g. Redis in @effect/platform-node NodeRedis).
// Esbuild rejects missing modules even when behind dead code branches, so
// swap them for empty stubs that throw if anything actually reaches in.
const optionalStubs = new Set([
  "ioredis",
]);

await esbuild({
  absWorkingDir: dir,
  // node.js is the sidecar entry. vcs-patch-worker.js is spawned at runtime
  // via `new Worker(new URL("./vcs-patch-worker.js", import.meta.url))` from
  // src/project/vcs.js, so esbuild needs to emit it as a sibling of node.js
  // inside dist/node/ so the URL resolves correctly. `entryNames: "[name]"`
  // flattens both outputs into outdir regardless of source subdirectory.
  entryPoints: ["./src/node.js", "./src/project/vcs-patch-worker.js"],
  entryNames: "[name]",
  outdir: "./dist/node",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  sourcemap: "linked",
  plugins: [pathAliases, externalize, {
    name: "optional-stubs",
    setup(b) {
      b.onResolve({ filter: /.*/ }, (args) => {
        const pkgName = args.path.startsWith("@") ? args.path.split("/").slice(0, 2).join("/") : args.path.split("/")[0];
        if (optionalStubs.has(pkgName)) return { path: args.path, namespace: "optional-stub" };
        return null;
      });
      b.onLoad({ filter: /.*/, namespace: "optional-stub" }, (args) => ({
        // Use CommonJS so esbuild's interop fabricates every named export
        // through the Proxy — pure ESM would require declaring each name
        // statically, and we don't know what callers import.
        contents: `module.exports = new Proxy({}, { get(target, prop) { if (prop === '__esModule' || typeof prop === 'symbol') return undefined; throw new Error('Optional dep ${args.path} (.' + String(prop) + ') not bundled; install it at runtime if you need it.'); } });`,
        loader: "js",
      }));
    },
  }],
  alias: {
    "node:ffi": path.join(dir, "src/util/node-ffi-polyfill.js"),
    "bun:ffi": path.join(dir, "src/util/bun-ffi-stub.js"),
    "jsonc-parser": path.join(dir, "../../node_modules/jsonc-parser/lib/esm/main.js"),
  },
  banner: {
    // The bundle is ESM, but some bundled CJS deps (e.g. swagger-ui-dist via
    // swagger-ui-express) reference `require`/`__dirname`/`__filename`, which
    // are undefined in ESM scope. Shim all three so importing such deps does
    // not crash the bundle at load time.
    js: "import { createRequire as __createRequire_banner } from 'node:module'; import { fileURLToPath as __fileURLToPath_banner } from 'node:url'; import { dirname as __dirname_banner } from 'node:path'; const require = __createRequire_banner(import.meta.url); const __filename = __fileURLToPath_banner(import.meta.url); const __dirname = __dirname_banner(__filename);",
  },
  define: {
    CLOSEDCODE_VERSION: JSON.stringify(Script.version),
    CLOSEDCODE_MIGRATIONS: JSON.stringify(migrations),
    CLOSEDCODE_CHANNEL: JSON.stringify(Script.channel),
    CLOSEDCODE_LIBC: JSON.stringify("glibc"),
    CLOSEDCODE_WORKER_PATH: JSON.stringify("./src/cli/cmd/tui/worker.js"),
    OTUI_TREE_SITTER_WORKER_PATH: JSON.stringify(""),
    CLOSEDCODE_EMBEDDED_WEB_UI: JSON.stringify({}),
  },
  loader: { ".wav": "file", ".node": "file" },
})
console.log("Build complete")
