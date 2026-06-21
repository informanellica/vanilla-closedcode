/** @file Creates the main/loading BrowserWindows and registers the custom vcc:// renderer protocol, including the build-less import-rewriting module resolver. */
import windowState from "electron-window-state";
import { createRequire } from "node:module";
import { dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readFile } from "node:fs/promises";
import { readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { init as lexerInit, parse as lexerParse } from "es-module-lexer";
// Electron 41 ESM does not expose the runtime API via `import` from "electron";
// use a CommonJS require() so build-less execution from src works.
const require = createRequire(import.meta.url);
const { app, BrowserWindow, net, nativeImage, nativeTheme, protocol } = require("electron");
const root = dirname(fileURLToPath(import.meta.url));
// When main runs build-less from src/main (package.json "main": ./src/main/index.js),
// the bundled renderer still lives in out/renderer — serve from there. When packaged
// (main in out/main), "../renderer" already resolves to out/renderer.
const fromSrc = root.replace(/\\/g, "/").endsWith("/src/main");
const rendererRoot = fromSrc ? join(root, "../../out/renderer") : join(root, "../renderer");
const rendererProtocol = "vcc";
const rendererHost = "renderer";
protocol.registerSchemesAsPrivileged([{
  scheme: rendererProtocol,
  privileges: {
    secure: true,
    standard: true,
    supportFetchAPI: true
  }
}]);
let backgroundColor;
/**
 * Store the renderer-reported window background color for use when creating subsequent windows.
 * @param {string} color - The CSS color string to use as the window background.
 * @returns {void}
 */
export function setBackgroundColor(color) {
  backgroundColor = color;
}
/**
 * Get the currently stored window background color.
 * @returns {string} The stored background color, or undefined if none has been set.
 */
export function getBackgroundColor() {
  return backgroundColor;
}
// Theme-appropriate window background used BEFORE the renderer reports its real
// background via setBackgroundColor(). Without this, the loading/main windows are
// created with an undefined backgroundColor and Electron paints them white first,
// flashing white before the HTML paints. Values match loading.html / the
// theme-color meta tags (#f8f7f7 light, #131010 dark).
/**
 * Compute the theme-appropriate default window background color used before the renderer reports its real color.
 * @param {string} mode - The theme mode ("dark" or "light"); defaults to the current system tone when omitted.
 * @returns {string} The hex background color for the given mode.
 */
function defaultBackgroundColor(mode) {
  return (mode ?? tone()) === "dark" ? "#131010" : "#f8f7f7";
}
/**
 * Resolve the directory containing application icons for the current (packaged vs dev) layout.
 * @returns {string} The absolute path to the icons directory.
 */
function iconsDir() {
  return app.isPackaged ? join(process.resourcesPath, "icons") : join(root, "../../resources/icons");
}
/**
 * Resolve the platform-appropriate window icon file path (.ico on Windows, .png elsewhere).
 * @returns {string} The absolute path to the window icon file.
 */
function iconPath() {
  const ext = process.platform === "win32" ? "ico" : "png";
  return join(iconsDir(), `icon.${ext}`);
}
/**
 * Get the current system theme tone.
 * @returns {string} "dark" when the system prefers dark colors, otherwise "light".
 */
function tone() {
  return nativeTheme.shouldUseDarkColors ? "dark" : "light";
}
/**
 * Build the Windows title-bar overlay descriptor (transparent background, theme-appropriate symbol color).
 * @param {Object} theme - Optional theme object with a `mode` field ("dark"/"light"); defaults to the current tone.
 * @returns {Object} The title-bar overlay options (color, symbolColor, height).
 */
function overlay(theme = {}) {
  const mode = theme.mode ?? tone();
  return {
    color: "#00000000",
    symbolColor: mode === "dark" ? "white" : "black",
    height: 40
  };
}
/**
 * Apply the title-bar overlay (symbol color accent) to a window on Windows, swallowing errors when the window has no overlay. No-op off Windows.
 * @param {BrowserWindow} win - The target browser window.
 * @param {Object} theme - Optional theme object with a `mode` field controlling the symbol color.
 * @returns {void}
 */
export function setTitlebar(win, theme = {}) {
  if (process.platform !== "win32") return;
  // setTitleBarOverlay throws ("Titlebar overlay is not enabled") when the window
  // wasn't created with a titlebar overlay. The overlay is only a cosmetic accent
  // (symbol color) and the renderer fires this as void/fire-and-forget, so swallow
  // the error rather than surface it as an uncaught IPC rejection.
  try { win.setTitleBarOverlay(overlay(theme)); } catch {}
}
/**
 * Set the macOS dock icon from the bundled dock.png. No-op on non-darwin platforms or when the image is empty.
 * @returns {void}
 */
export function setDockIcon() {
  if (process.platform !== "darwin") return;
  const icon = nativeImage.createFromPath(join(iconsDir(), "dock.png"));
  if (!icon.isEmpty()) app.dock?.setIcon(icon);
}
/**
 * Create the main application BrowserWindow with persisted window state, CORS header rewriting, fixed zoom, and deferred show until first paint.
 * @returns {BrowserWindow} The newly created main window.
 */
export function createMainWindow(opts = {}) {
  const autoShow = opts.autoShow !== false;
  const state = windowState({
    defaultWidth: 1280,
    defaultHeight: 800
  });
  const win = new BrowserWindow({
    x: state.x,
    y: state.y,
    width: state.width,
    height: state.height,
    show: false,
    title: "vanilla-closedcode",
    icon: iconPath(),
    backgroundColor: backgroundColor ?? defaultBackgroundColor(),
    frame: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(root, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  // Native title bar (frame) but hide Electron's default File/Edit/View/Window
  // menu bar — the app provides its own in-renderer menu bar. Accelerators in
  // the application menu still work (Alt reveals it).
  win.setMenuBarVisibility(false);
  win.webContents.session.webRequest.onBeforeSendHeaders((details, callback) => {
    const {
      requestHeaders
    } = details;
    upsertKeyValue(requestHeaders, "Access-Control-Allow-Origin", ["*"]);
    callback({
      requestHeaders
    });
  });
  win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    const {
      responseHeaders = {}
    } = details;
    upsertKeyValue(responseHeaders, "Access-Control-Allow-Origin", ["*"]);
    upsertKeyValue(responseHeaders, "Access-Control-Allow-Headers", ["*"]);
    callback({
      responseHeaders
    });
  });
  state.manage(win);
  loadWindow(win, "index.html");
  wireZoom(win);
  win.once("ready-to-show", () => {
    // When autoShow is false the caller reveals the window itself (e.g. only
    // AFTER hiding the splash, so the two are never on screen together).
    if (autoShow) win.show();
  });
  return win;
}
/**
 * Create the startup splash/loading BrowserWindow, shown only after first paint to avoid a blank white flash.
 * @returns {BrowserWindow} The newly created loading window.
 */
export function createLoadingWindow() {
  const mode = tone();
  const win = new BrowserWindow({
    width: 640,
    height: 480,
    resizable: false,
    center: true,
    // show:false + ready-to-show, like the main window. The renderer process +
    // vcc:// protocol cold start takes ~1.5-2s before loading.html first paints;
    // show:true would put a near-white (backgroundColor) window on screen for
    // that whole time — the "最初だけ真っ白" splash. Showing only after first
    // paint means the user never sees the pre-paint blank window.
    show: false,
    icon: iconPath(),
    backgroundColor: backgroundColor ?? defaultBackgroundColor(mode),
    ...(process.platform === "darwin" ? {
      titleBarStyle: "hidden"
    } : {}),
    ...(process.platform === "win32" ? {
      frame: false,
      titleBarStyle: "hidden",
      titleBarOverlay: overlay({
        mode
      })
    } : {}),
    webPreferences: {
      preload: join(root, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  win.once("ready-to-show", () => {
    if (!win.isDestroyed()) win.show();
  });
  loadWindow(win, "loading.html");
  return win;
}
// ---- build-less renderer: import-rewriting vcc:// resolver -----------------
// When main runs from src, the renderer loads as native ESM (no esbuild bundle).
// Serve packages/app/src (/src/), src/renderer (/renderer/) and node_modules
// (/node_modules/), rewriting bare import specifiers in served .js to resolved
// vcc:// URLs so deep transitive imports (and module workers) resolve without an
// exhaustive import map.
//
// Packaged mode (app.isPackaged): source trees are copied into the asar by
// build.js — packages/app/src -> out/app-src, packages/sdk/js/src -> out/sdk-src,
// packages/core/src -> out/core-src. Workspace stubs in out/node_modules/
// redirect * to the copied trees. Runtime deps are in the asar
// root's node_modules/ (installed by electron-builder).
const PACKAGED = app.isPackaged;
const PKG_ROOT = resolve(root, "../..");           // asar root (always 2 levels up from src/main)
const REPO = PACKAGED ? null : resolve(root, "../../../.."); // repo root (4 levels up — dev only)
// Path mappings for packaged mode: repo-relative <-> asar-relative.
// Used by routeDisk (repo->asar) and toOcPath (asar->repo) so /@fs/ URLs stay
// consistent regardless of mode.
const PKG_MAP = PACKAGED ? [
  ["packages/app/src/", "out/app-src/"],
  ["packages/sdk/js/src/", "out/sdk-src/"],
  ["packages/core/src/", "out/core-src/"],
  ["packages/desktop-electron/src/", "src/"],
  ["packages/desktop-electron/out/", "out/"],
] : null;
const FS_ROOT = PACKAGED ? PKG_ROOT : REPO;        // base for /@fs/ URL resolution
const APP_SRC = PACKAGED ? join(PKG_ROOT, "out/app-src") : join(REPO, "packages/app/src");
const DT_RENDERER = PACKAGED ? join(PKG_ROOT, "src/renderer") : join(REPO, "packages/desktop-electron/src/renderer");
const NODE_MODULES = PACKAGED ? join(PKG_ROOT, "node_modules") : join(REPO, "node_modules");
const DT_PKG_JSON = PACKAGED ? join(PKG_ROOT, "package.json") : join(REPO, "packages/desktop-electron/package.json");
const RESOLVE_CONDITIONS = ["browser", "import", "module", "default"];
const MIME = {
  ".js": "text/javascript", ".mjs": "text/javascript", ".cjs": "text/javascript",
  ".json": "application/json", ".wasm": "application/wasm", ".css": "text/css",
  ".html": "text/html", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".ico": "image/x-icon",
  ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf", ".otf": "font/otf",
  ".aac": "audio/aac", ".mp3": "audio/mpeg", ".wav": "audio/wav", ".map": "application/json",
};
// Asset extensions that, when IMPORTED as a module (Sec-Fetch-Dest: script),
// should resolve to their URL string (esbuild `file` loader equivalent) rather
// than be parsed as JS. The same files fetched as <img>/font return their bytes.
const ASSET_EXT = new Set([".svg", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".woff", ".woff2", ".ttf", ".otf", ".aac", ".mp3", ".wav"]);
/**
 * Recursively resolve a package.json "exports" conditions value down to a concrete path, preferring the configured resolve conditions.
 * @param {*} val - An exports value: a string target, an array of alternatives, or a conditions object.
 * @returns {string} The first matching target path, or null if none matched.
 */
function pickCondition(val) {
  if (typeof val === "string") return val;
  if (Array.isArray(val)) { for (const v of val) { const r = pickCondition(v); if (r) return r; } return null; }
  if (val && typeof val === "object") {
    for (const c of RESOLVE_CONDITIONS) if (c in val) { const r = pickCondition(val[c]); if (r) return r; }
    if ("default" in val) return pickCondition(val.default);
  }
  return null;
}
/**
 * Locate the on-disk directory of an installed package, walking up node_modules from a starting directory without escaping the asar when packaged.
 * @param {string} pkg - The package name (supports scoped names like "@scope/name").
 * @param {string} fromDir - The directory to begin the node_modules walk-up from.
 * @returns {string} The resolved package directory, defaulting to the top-level node_modules path when not found.
 */
function findPkgDir(pkg, fromDir) {
  // Packaged: workspace stubs in out/node_modules/ are authoritative. Check them
  // FIRST so resolution can't escape the asar into the dev repo's node_modules —
  // which happens when dist/ lives inside the repo: the walk-up climbs out of
  // app.asar into <repo>/node_modules and resolves to paths toOcPath can't map
  // (→ the import is left bare → blank app).
  if (PACKAGED) {
    const outCand = join(PKG_ROOT, "out/node_modules", pkg);
    try { statSync(join(outCand, "package.json")); return outCand; } catch {}
  }
  let dir = fromDir;
  for (;;) {
    const cand = join(dir, "node_modules", pkg);
    try { statSync(join(cand, "package.json")); return cand; } catch {}
    const parent = dirname(dir);
    if (parent === dir) break;
    // Packaged: never walk above the asar root, or resolution escapes the asar.
    if (PACKAGED && relative(PKG_ROOT, parent).startsWith("..")) break;
    dir = parent;
  }
  return join(NODE_MODULES, pkg);
}
/**
 * Resolve a bare import specifier to an absolute on-disk file, honoring the package's "exports" map (including "*" patterns) or falling back to module/main/index.js.
 * @param {string} spec - The bare specifier (e.g. "pkg" or "@scope/pkg/sub").
 * @param {string} fromDir - The directory to resolve the package from.
 * @returns {string} The absolute resolved path, or null when the package cannot be resolved.
 */
function resolveBare(spec, fromDir) {
  let pkg, sub;
  if (spec.startsWith("@")) { const p = spec.split("/"); pkg = p[0] + "/" + p[1]; sub = p.slice(2).join("/"); }
  else { const p = spec.split("/"); pkg = p[0]; sub = p.slice(1).join("/"); }
  const pkgDir = findPkgDir(pkg, fromDir);
  let pj;
  try { pj = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8")); } catch { return null; }
  const key = sub ? "./" + sub : ".";
  let rel = null;
  const exp = pj.exports;
  if (exp != null) {
    if (typeof exp === "string") { if (!sub) rel = exp; }
    else if (exp[key] != null) rel = pickCondition(exp[key]);
    else if (!sub && !Object.keys(exp).some(k => k.startsWith("."))) rel = pickCondition(exp);
    else {
      // Match "*" patterns, preferring the MOST specific (longest prefix) — as Node does.
      let best = null;
      for (const k of Object.keys(exp)) {
        if (!k.includes("*")) continue;
        const [pre, post = ""] = k.split("*");
        if (key.startsWith(pre) && key.endsWith(post) && key.length >= pre.length + post.length) {
          if (!best || pre.length > best.pre.length) best = { k, pre, post };
        }
      }
      if (best) {
        const star = key.slice(best.pre.length, key.length - best.post.length);
        const tgt = pickCondition(exp[best.k]);
        if (tgt) rel = tgt.replace(/\*/g, star);
      }
    }
  }
  if (!rel) rel = sub ? sub : (pj.module || pj.main || "index.js");
  return join(pkgDir, rel);
}
const FS_ROOT_FWD = FS_ROOT.replace(/\\/g, "/");
// ---- Stage 3: import map for first-party modules ---------------------------
// First-party module routes (/src/, /renderer/, /@fs/ workspace trees) are
// served VERBATIM: their relative imports are extension-complete, and their
// bare / "@/" specifiers resolve through the import map injected into the
// served HTML. Only files that physically live under node_modules/ still go
// through the import-rewriting resolver (third-party CJS/UMD interop, deep
// transitive specifiers, and module workers — import maps do not apply inside
// workers). That resolver is the documented third-party interop wall.
let importMapJson = null;
/**
 * Build (and cache) the JSON import map for first-party modules by scanning the app/renderer/core/sdk trees for bare specifiers and resolving each to a vcc:// route, including the solid-free reactivity remapping.
 * @returns {Promise<string>} The cached JSON string of the import map ({imports: {...}}).
 */
async function buildImportMap() {
  if (importMapJson) return importMapJson;
  await lexerInit;
  const roots = PACKAGED
    ? [APP_SRC, DT_RENDERER, join(PKG_ROOT, "out/core-src"), join(PKG_ROOT, "out/sdk-src")]
    : [APP_SRC, DT_RENDERER, join(REPO, "packages/core/src"), join(REPO, "packages/sdk/js/src")];
  const bare = new Set();
  const walk = dir => {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!e.name.endsWith(".js") && !e.name.endsWith(".mjs")) continue;
      let code;
      try { code = readFileSync(p, "utf8"); } catch { continue; }
      let imports;
      try { [imports] = lexerParse(code); } catch { continue; }
      for (const imp of imports) {
        const spec = imp.n;
        if (!spec || imp.s < 0) continue;
        if (/^\.\.?\//.test(spec) || /^(\/|[a-z][a-z0-9+.-]*:)/i.test(spec)) continue;
        if (spec.startsWith("@/")) continue;
        bare.add(spec);
      }
    }
  };
  for (const r of roots) walk(r);
  const imports = { "@/": "/src/" };
  for (const spec of [...bare].sort()) {
    const abs = resolveBare(spec, APP_SRC);
    const file = abs ? resolveFile(abs) : null;
    const url = file ? toRouteUrl(file) : null;
    if (url) imports[spec] = url;
    // Unresolved specifiers (test-only/storybook imports collected from files
    // the app never loads) are skipped — the map only needs runtime modules.
    else process.stderr.write(`[vcc-importmap] skip "${spec}" (unresolved)\n`);
  }
  // Stage R4 (solid-free reactivity) — NOW THE PERMANENT DEFAULT: re-point
  // first-party solid-js / solid-js/web / solid-js/store at our self-written
  // core (lib/reactivity.js, lib/store.js) instead of node_modules. This affects
  // ONLY first-party modules. Every third-party that imported solid-js has been
  // internalized (Stage R3) and removed from this app's package.json, so the
  // renderer no longer needs node_modules/solid-js at all. lib/reactivity.js
  // covers the union of the solid-js core + solid-js/web runtime subset the app
  // imports, so one URL serves both specifiers. Set CLOSEDCODE_SOLID_FREE=0 to
  // opt OUT (only meaningful while node_modules/solid-js still exists — e.g. for
  // an A/B debug before the dependency is pruned).
  if (process.env.CLOSEDCODE_SOLID_FREE !== "0") {
    const coreUrl = toRouteUrl(resolveFile(join(APP_SRC, "lib/reactivity.js")));
    const storeUrl = toRouteUrl(resolveFile(join(APP_SRC, "lib/store.js")));
    if (coreUrl) { imports["solid-js"] = coreUrl; imports["solid-js/web"] = coreUrl; }
    if (storeUrl) imports["solid-js/store"] = storeUrl;
    process.stderr.write(`[vcc-importmap] SOLID-FREE: solid-js->${coreUrl} store->${storeUrl}\n`);
  }
  importMapJson = JSON.stringify({ imports });
  return importMapJson;
}
// Map any disk path under the repo (dev) or asar (packaged) to a canonical
// /@fs/<repo-relative> URL. In packaged mode, asar-internal paths are reverse-
// mapped to their repo-relative equivalents so URLs stay consistent between modes.
// realpath resolves workspace symlinks in dev (node_modules/* ->
// packages/*); in the asar there are no symlinks.
// Node-style file resolution: native ESM has no directory/extension inference,
// but esbuild did. Resolve a path to a real file (as-is, +.js/.mjs, /index.js).
/**
 * Resolve a path to a real file using Node-style inference (as-is, then +.js/.mjs, then /index.js or /index.mjs).
 * @param {string} p - The candidate path, possibly extensionless or a directory.
 * @returns {string} The resolved file path, or the original path when nothing matched.
 */
function resolveFile(p) {
  try { if (statSync(p).isFile()) return p; } catch {}
  for (const cand of [p + ".js", p + ".mjs", join(p, "index.js"), join(p, "index.mjs")]) {
    try { if (statSync(cand).isFile()) return cand; } catch {}
  }
  return p;
}
/**
 * Map an absolute disk path under the repo (dev) or asar (packaged) to a canonical /@fs/<repo-relative> URL, reverse-mapping asar paths to their repo equivalents.
 * @param {string} abs - The absolute disk path to convert.
 * @returns {string} The /@fs/ URL, or null when the path lies outside the FS root.
 */
function toOcPath(abs) {
  let real = abs;
  try { real = realpathSync(abs); } catch {}
  const a = real.replace(/\\/g, "/");
  if (a.startsWith(FS_ROOT_FWD + "/")) {
    let rel = a.slice(FS_ROOT_FWD.length + 1);
    // Reverse-map asar-relative → repo-relative so URLs are mode-independent.
    if (PKG_MAP) {
      for (const [repoRel, asarRel] of PKG_MAP) {
        if (rel.startsWith(asarRel)) { rel = repoRel + rel.slice(asarRel.length); break; }
      }
    }
    return "/@fs/" + rel;
  }
  return null;
}
// Canonical first-party URL form: files under the app/renderer trees use the
// route aliases (/src/, /renderer/) — the same form the HTML entry, relative
// imports and the import map produce. Mixing them with /@fs/ double-
// instantiates modules and breaks Solid context identity (white screen).
/**
 * Convert a file path to its canonical first-party route URL (/src/ or /renderer/), falling back to a /@fs/ URL for anything outside those trees.
 * @param {string} file - The absolute file path to convert.
 * @returns {string} The canonical route URL, or null when neither route nor /@fs/ mapping applies.
 */
function toRouteUrl(file) {
  let real = file;
  try { real = realpathSync(file); } catch {}
  for (const [base, route] of [[APP_SRC, "/src/"], [DT_RENDERER, "/renderer/"]]) {
    const rel = relative(base, real);
    if (rel && !rel.startsWith("..") && !isAbsolute(rel)) return route + rel.replace(/\\/g, "/");
  }
  return toOcPath(real);
}
/**
 * Rewrite a served module's import specifiers to canonical vcc:// route URLs, wrapping non-ESM (CJS/UMD) files for default interop and tagging asset imports.
 * @param {string} code - The raw module source code.
 * @param {string} diskPath - The on-disk path of the module (used to resolve relative imports).
 * @returns {Promise<string>} The rewritten module source, or the original code when it cannot be parsed.
 */
async function rewriteModule(code, diskPath) {
  await lexerInit;
  let imports, exports;
  try { [imports, exports] = lexerParse(code); } catch { return code; }
  // CJS/UMD interop: a file with NO ESM import/export syntax is not an ES module
  // (CJS, UMD, or side-effect script). Wrap it so `import x from "..."` gets a
  // default (= module.exports), giving classic CJS->ESM default interop.
  if (imports.length === 0 && exports.length === 0 && !/^\s*const module = \{/.test(code)) {
    return `const module = { exports: {} };\nconst exports = module.exports;\n${code}\n;export default module.exports;`;
  }
  let out = "";
  let last = 0;
  const fromDir = dirname(diskPath);
  for (const imp of imports) {
    const spec = imp.n;
    if (!spec || imp.s < 0) continue;
    const isAsset = ASSET_EXT.has(extname(spec.split("?")[0]).toLowerCase());
    const isRel = /^\.\.?\//.test(spec);
    const isAbs = /^(\/|[a-z][a-z0-9+.-]*:)/i.test(spec);
    let url = null;
    if (spec.startsWith("@/")) {
      url = toRouteUrl(resolveFile(join(APP_SRC, spec.slice(2))));
    } else if (isRel) {
      // Resolve relative imports to a real file (handles extensionless / dir/index.js).
      let resolved = resolve(fromDir, spec);
      // Packaged-layout fix: the desktop renderer is copied to <asar>/src/renderer but
      // the app source tree goes to <asar>/out/app-src, so the renderer's dev-relative
      // "../../../app/src/..." (which assumes packages/desktop-electron/src/renderer +
      // packages/app/src side by side) escapes the asar and 404s — the module graph
      // never loads, so boot() never runs (packaged white screen). Re-anchor any
      // ".../app/src/<rest>" onto APP_SRC so it resolves AND dedups to the SAME
      // canonical /src/ URL as every other importer; a mismatched URL would
      // double-instantiate the reactivity module and break context identity.
      if (PACKAGED) {
        const appSrcRel = spec.match(/(?:^|\/)app\/src\/(.+)$/);
        if (appSrcRel) resolved = join(APP_SRC, appSrcRel[1]);
      }
      url = toRouteUrl(resolveFile(resolved));
    } else if (isAbs) {
      continue;
    } else {
      const abs = resolveBare(spec, fromDir);
      const file = abs ? resolveFile(abs) : null;
      url = file ? toRouteUrl(file) : null;
      if (!abs) process.stderr.write(`[vcc-resolve] MISS "${spec}" from ${diskPath}\n`);
      else if (!url) process.stderr.write(`[vcc-resolve] OUTSIDE "${spec}" -> ${abs}\n`);
    }
    if (!url) continue;
    // Asset module: mark with ?m so the protocol serves `export default "<url>"`.
    if (isAsset) url += "?m";
    // For dynamic imports `import("spec")`, es-module-lexer's [s,e] INCLUDES the
    // quotes, so re-quote the URL. For static imports [s,e] is inside the quotes.
    out += code.slice(last, imp.s) + (imp.d > -1 ? JSON.stringify(url) : url);
    last = imp.e;
  }
  out += code.slice(last);
  return out;
}
/**
 * Map a requested vcc:// pathname to its on-disk file and the base directory used for path-traversal containment checks.
 * @param {string} pathname - The decoded request pathname (e.g. "/@fs/...", "/src/...", "/node_modules/...").
 * @returns {Object} An object with `disk` (the resolved absolute path) and `base` (the containing root for traversal checks).
 */
function routeDisk(pathname) {
  if (pathname.startsWith("/@fs/")) {
    let rel = pathname.slice("/@fs/".length);
    // Map repo-relative → asar-relative so the disk path lands inside the asar.
    if (PKG_MAP) {
      for (const [repoRel, asarRel] of PKG_MAP) {
        if (rel.startsWith(repoRel)) { rel = asarRel + rel.slice(repoRel.length); break; }
      }
    }
    return { disk: join(FS_ROOT, rel), base: FS_ROOT };
  }
  if (pathname === "/package.json") return { disk: DT_PKG_JSON, base: FS_ROOT };
  if (pathname.startsWith("/node_modules/")) return { disk: join(NODE_MODULES, pathname.slice("/node_modules/".length)), base: NODE_MODULES };
  if (pathname.startsWith("/src/")) return { disk: join(APP_SRC, pathname.slice("/src/".length)), base: APP_SRC };
  if (pathname.startsWith("/renderer/")) return { disk: join(DT_RENDERER, pathname.slice("/renderer/".length)), base: DT_RENDERER };
  return { disk: resolve(rendererRoot, `.${pathname}`), base: rendererRoot };
}
/**
 * Register the privileged vcc:// protocol handler that serves the renderer: static bundle in legacy mode, or the import-rewriting module resolver (with import-map injection) in build-less/packaged-from-src mode.
 * @returns {void}
 */
export function registerRendererProtocol() {
  if (protocol.isProtocolHandled(rendererProtocol)) return;
  protocol.handle(rendererProtocol, async request => {
    const url = new URL(request.url);
    if (url.host !== rendererHost) return new Response("Not found", { status: 404 });
    const pathname = decodeURIComponent(url.pathname);
    // Legacy bundled renderer: simple static serve from rendererRoot.
    // This path is only used when main runs from out/main (old esbuild build).
    // Both dev (fromSrc) and packaged (PACKAGED + fromSrc) use the import-rewriting
    // resolver below.
    if (!fromSrc) {
      const file = resolve(rendererRoot, `.${pathname}`);
      const rel = relative(rendererRoot, file);
      if (rel.startsWith("..") || isAbsolute(rel)) return new Response("Not found", { status: 404 });
      return net.fetch(pathToFileURL(file).toString());
    }
    const { disk, base } = routeDisk(pathname);
    const rel = relative(base, disk);
    if (rel.startsWith("..") || isAbsolute(rel)) return new Response("Not found", { status: 404 });
    const ext = extname(disk).toLowerCase();
    // Asset imported as a module (rewriter added ?m) -> export its URL string
    // (esbuild `file` loader equivalent). Plain fetches (<img>/font) get bytes.
    if (ASSET_EXT.has(ext) && url.searchParams.has("m")) {
      return new Response(`export default ${JSON.stringify(pathname)};`, { headers: { "content-type": "text/javascript" } });
    }
    // Only ES-module routes get import-rewriting/CJS-wrapping. The static route
    // (out/renderer) serves classic <script> assets (CodeMirror, vanilla-ide.js,
    // bootstrap, vcc-theme-preload) VERBATIM — they are not modules.
    const moduleRoute = /^\/(@fs|src|renderer|node_modules)\//.test(pathname);
    // CSS imported as a JS module (`import "foo.css"`) — return an empty module.
    // The actual CSS is loaded via <link> tags; the JS import is a Vite leftover.
    if (moduleRoute && ext === ".css") {
      return new Response("export default {};", { headers: { "content-type": "text/javascript" } });
    }
    if (moduleRoute && (ext === ".js" || ext === ".mjs" || ext === ".cjs")) {
      try {
        const code = await readFile(disk, "utf8");
        // First-party (workspace) modules are standard ESM: extension-complete
        // relative imports + bare/"@/" specifiers covered by the import map —
        // serve them verbatim. Files under node_modules/ keep the rewriter
        // (CJS interop, deep transitive specifiers). The loading overlay's
        // scripts (DT_RENDERER) are ALSO rewritten: loading.html must work
        // before/without the import map (its module graph dying silently
        // leaves the app stuck on the splash forever — main waits for
        // loadingWindowComplete), so they keep the resolver treatment.
        const rewrite = !relative(NODE_MODULES, disk).startsWith("..")
          || !relative(DT_RENDERER, disk).startsWith("..");
        const out = rewrite ? await rewriteModule(code, disk) : code;
        return new Response(out, { headers: { "content-type": "text/javascript" } });
      } catch (e) {
        process.stderr.write(`[vcc-404] ${pathname} -> ${disk} :: ${e.message}\n`);
        return new Response("Not found", { status: 404 });
      }
    }
    // Inject the generated import map into served HTML (before any module
    // script) so first-party modules resolve bare specifiers natively.
    if (ext === ".html") {
      try {
        let html = await readFile(disk, "utf8");
        // The startup splash (loading.html) is fully self-contained — no module
        // scripts — so it must NOT block on buildImportMap(), which scans the
        // app/renderer/core/sdk trees and delays returning the HTML, leaving a
        // blank splash window on launch (the small white box). Serve it verbatim
        // so first paint is immediate.
        if (pathname.endsWith("/loading.html")) {
          return new Response(html, { headers: { "content-type": "text/html" } });
        }
        const tag = `<script type="importmap">${await buildImportMap()}</script>`;
        html = html.includes("</title>")
          ? html.replace("</title>", `</title>\n    ${tag}`)
          : `${tag}\n${html}`;
        return new Response(html, { headers: { "content-type": "text/html" } });
      } catch (e) {
        process.stderr.write(`[vcc-404] ${pathname} -> ${disk} :: ${e.message}\n`);
        return new Response("Not found", { status: 404 });
      }
    }
    if (!MIME[ext]) process.stderr.write(`[vcc-type] unknown ext for ${pathname}\n`);
    try {
      const buf = await readFile(disk);
      return new Response(buf, { headers: { "content-type": MIME[ext] || "application/octet-stream" } });
    } catch (e) {
      process.stderr.write(`[vcc-404] ${pathname} -> ${disk} :: ${e.message}\n`);
      return new Response("Not found", { status: 404 });
    }
  });
}
/**
 * Load an HTML page into a window, using the dev server URL when ELECTRON_RENDERER_URL is set, otherwise the vcc:// renderer protocol.
 * @param {BrowserWindow} win - The window to load the page into.
 * @param {string} html - The HTML file name to load (e.g. "index.html", "loading.html").
 * @returns {void}
 */
function loadWindow(win, html) {
  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (devUrl) {
    const url = new URL(html, devUrl);
    void win.loadURL(url.toString());
    return;
  }
  void win.loadURL(`${rendererProtocol}://${rendererHost}/${html}`);
}
/**
 * Lock a window's zoom factor at 1, resetting it whenever the user attempts to change it.
 * @param {BrowserWindow} win - The window whose zoom should be pinned.
 * @returns {void}
 */
function wireZoom(win) {
  win.webContents.setZoomFactor(1);
  win.webContents.on("zoom-changed", () => {
    win.webContents.setZoomFactor(1);
  });
}
/**
 * Set a header value on an object case-insensitively, reusing an existing key with differing case or appending a new one.
 * @param {Object} obj - The headers object to mutate.
 * @param {string} keyToChange - The header name to set (matched case-insensitively).
 * @param {Array} value - The header value(s) to assign.
 * @returns {void}
 */
function upsertKeyValue(obj, keyToChange, value) {
  const keyToChangeLower = keyToChange.toLowerCase();
  for (const key of Object.keys(obj)) {
    if (key.toLowerCase() === keyToChangeLower) {
      // Reassign old key
      obj[key] = value;
      // Done
      return;
    }
  }
  // Insert at end instead
  obj[keyToChange] = value;
}