#!/usr/bin/env node
/* Node/esbuild build script */;
import { $ } from "script/shell";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";
import { glob } from "glob";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dir = path.resolve(__dirname, "..");
process.chdir(dir);
await import("./generate.js");
import { Script } from "script";
import pkg from "../package.json" with { type: "json" };
const sourcemapsFlag = process.argv.includes("--sourcemaps");
const skipEmbedWebUi = process.argv.includes("--skip-embed-web-ui");
const migrationDirs = (await fs.promises.readdir(path.join(dir, "migration"), {
  withFileTypes: true
})).filter(entry => entry.isDirectory() && /^\d{4}\d{2}\d{2}\d{2}\d{2}\d{2}/.test(entry.name)).map(entry => entry.name).sort();
const migrations = await Promise.all(migrationDirs.map(async name => {
  const file = path.join(dir, "migration", name, "migration.sql");
  const sql = await fs.promises.readFile(file, "utf8");
  const match = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/.exec(name);
  const timestamp = match ? Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]), Number(match[6])) : 0;
  return {
    sql,
    timestamp,
    name
  };
}));
console.log(`Loaded ${migrations.length} migrations`);
async function buildEmbeddedWebUI() {
  if (skipEmbedWebUi) return null;
  console.log("Building Web UI to embed");
  const appDir = path.join(dir, "../app");
  const dist = path.join(appDir, "dist");
  await $`npm --prefix ${appDir} run build`;
  const files = (await glob("**/*", {
    cwd: dist,
    nodir: true
  })).map(file => file.replaceAll("\\", "/")).filter(file => !file.endsWith(".map")).sort();
  const out = {};
  for (const file of files) {
    out[file] = await fs.promises.readFile(path.join(dist, file), "base64");
  }
  return out;
}
const embeddedFileMap = await buildEmbeddedWebUI();
const platform = process.platform === "win32" ? "windows" : process.platform;
const name = [pkg.name, platform, process.arch].join("-");
console.log(`building ${name}`);
const outDir = path.join(dir, "dist", name);
await fs.promises.rm(outDir, {
  recursive: true,
  force: true
});
await fs.promises.mkdir(path.join(outDir, "bin"), {
  recursive: true
});

// Native modules and runtime-specific packages stay external; everything else
// is bundled so Node's strict ESM resolver doesn't trip on extension-less
// imports inside CJS-era dependencies (vscode-jsonrpc/node, @parcel/watcher/wrapper).
// terminal-kit (the vanilla TUI's terminal library) dynamically loads its
// termconfig/* files (incl. a non-JS README), which esbuild cannot bundle — keep
// it + its string-kit dep external and resolve them from node_modules at runtime.
const EXTERNAL_NATIVE = new Set(["@lydell/node-pty", "node-pty", "tree-sitter", "tree-sitter-bash", "tree-sitter-powershell", "web-tree-sitter", "koffi", "terminal-kit", "string-kit"]);
const externalize = {
  name: "externalize-natives",
  setup(build) {
    build.onResolve({
      filter: /.*/
    }, args => {
      if (args.kind === "entry-point") return null;
      if (args.path.startsWith(".") || args.path.startsWith("/")) return null;
      if (args.path.startsWith("#")) return null;
      const pkgName = args.path.startsWith("@") ? args.path.split("/").slice(0, 2).join("/") : args.path.split("/")[0];
      if (EXTERNAL_NATIVE.has(pkgName)) {
        return {
          path: args.path,
          external: true
        };
      }
      return null;
    });
  }
};
// Alias plugin: rewrite our path aliases (@/, @tui/, @test/, #db/#pty) at
// resolve time since we no longer have tsconfig paths to drive them.
const ALIASES = [
  { prefix: "#pty", replace: path.join(dir, "src/pty/pty.node.js") },
  { prefix: "#tui/", replace: path.join(dir, "src/cli/cmd/tui") + "/" },
  { prefix: "#test/", replace: path.join(dir, "test") + "/" },
  { prefix: "#", replace: path.join(dir, "src") + "/" },
]
const pathAliases = {
  name: "path-aliases",
  setup(build) {
    build.onResolve({ filter: /^#/ }, async (args) => {
      for (const a of ALIASES) {
        if (a.prefix === "#db" || a.prefix === "#pty") {
          if (args.path === a.prefix) return { path: a.replace }
        } else if (args.path.startsWith(a.prefix)) {
          let p = a.replace + args.path.slice(a.prefix.length)
          if (!p.endsWith(".js") && !p.endsWith(".jsx") && !p.endsWith(".json")) p += ".js"
          return { path: p }
        }
      }
      return null
    })
  },
}

// Optional peer deps that some transitive packages reference behind feature
// flags we never exercise.  Esbuild rejects missing modules even when behind
// dead code branches, so swap them for empty stubs that throw if anything
// actually reaches in.  (Same pattern as build-node.js.)
const optionalStubs = new Set([
  "ioredis",
  "@babel/preset-typescript",
]);

// (@opentui-specific esbuild plugins removed — @opentui is no longer a dependency)

await esbuild({
  entryPoints: [path.join(dir, "src/index.js")],
  outfile: path.join(outDir, "bin/closedcode.js"),
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  minify: true,
  sourcemap: sourcemapsFlag ? "linked" : false,
  plugins: [pathAliases, externalize, {
    name: "optional-stubs",
    setup(b) {
      b.onResolve({ filter: /.*/ }, (args) => {
        const pkgName = args.path.startsWith("@") ? args.path.split("/").slice(0, 2).join("/") : args.path.split("/")[0];
        if (optionalStubs.has(pkgName)) return { path: args.path, namespace: "optional-stub" };
        return null;
      });
      b.onLoad({ filter: /.*/, namespace: "optional-stub" }, (args) => ({
        contents: `module.exports = new Proxy({}, { get(target, prop) { if (prop === '__esModule' || typeof prop === 'symbol') return undefined; throw new Error('Optional dep ${args.path} (.' + String(prop) + ') not bundled; install it at runtime if you need it.'); } });`,
        loader: "js",
      }));
    },
  }],
  alias: {
    "bun": path.join(dir, "src/util/bun-stub.js"),
    "jsonc-parser": path.join(dir, "../../node_modules/jsonc-parser/lib/esm/main.js"),
    // `conditions: ["browser"]` (below) otherwise resolves `ws` to its browser
    // stub (./browser.js) which exports no WebSocketServer — breaking the server
    // WS adapter (`new WebSocketServer(...)` throws, killing `serve`). Pin `ws`
    // to its real Node entry so the bundled server can create a WebSocket server.
    "ws": path.join(dir, "node_modules/ws/index.js")
  },
  conditions: ["browser"],
  banner: {
    // The bundle is ESM but some bundled CJS deps (e.g. swagger-ui-dist via
    // swagger-ui-express) reference require/__dirname/__filename. Without the
    // __dirname/__filename shims, Node sees both __dirname and top-level await
    // and bails with ERR_AMBIGUOUS_MODULE_SYNTAX. Shim all three.
    js: "import { createRequire as __createRequire_banner } from 'node:module'; import { fileURLToPath as __fileURLToPath_banner } from 'node:url'; import { dirname as __dirname_banner } from 'node:path'; const require = __createRequire_banner(import.meta.url); const __filename = __fileURLToPath_banner(import.meta.url); const __dirname = __dirname_banner(__filename);"
  },
  define: {
    CLOSEDCODE_VERSION: JSON.stringify(Script.version),
    CLOSEDCODE_MIGRATIONS: JSON.stringify(migrations),
    CLOSEDCODE_CHANNEL: JSON.stringify(Script.channel),
    CLOSEDCODE_LIBC: JSON.stringify("glibc"),
    CLOSEDCODE_WORKER_PATH: JSON.stringify("./src/cli/cmd/tui/worker.js"),
    OTUI_TREE_SITTER_WORKER_PATH: JSON.stringify(""),
    CLOSEDCODE_EMBEDDED_WEB_UI: JSON.stringify(embeddedFileMap ?? {})
  },
  loader: {
    ".wav": "file",
    ".node": "file"
  }
});

// Wrapper script that invokes the bundle via node.
const wrapperPath = path.join(outDir, "bin/closedcode");
await fs.promises.writeFile(wrapperPath, `#!/usr/bin/env node\nimport(new URL("./closedcode.js", import.meta.url).href).catch((err) => { console.error(err); process.exit(1); });\n`, {
  mode: 0o755
});
await fs.promises.writeFile(path.join(outDir, "package.json"), JSON.stringify({
  name,
  version: Script.version,
  type: "module",
  bin: {
    closedcode: "./bin/closedcode"
  },
  os: [process.platform],
  cpu: [process.arch]
}, null, 2));

// Stage 2 (pure-vanilla): prompts/tool descriptions are read via fs at runtime
// (src/util/asset.js) instead of bundler text imports — ship every src/**/*.txt
// next to the bundle under assets/, preserving the src/-relative layout.
function copyTextAssets(outRoot) {
  const srcRoot = path.join(dir, "src");
  const walk = d =>
    fs.readdirSync(d, { withFileTypes: true }).flatMap(e =>
      e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith(".txt") ? [path.join(d, e.name)] : []);
  let count = 0;
  for (const file of walk(srcRoot)) {
    const dest = path.join(outRoot, "assets", path.relative(srcRoot, file));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(file, dest);
    count++;
  }
  console.log(`copied ${count} text assets -> ${path.relative(dir, outRoot)}/assets`);
}

copyTextAssets(path.join(outDir, "bin"));
console.log(`built ${name} → ${outDir}`);
export const binaries = {
  [name]: Script.version
};