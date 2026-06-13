import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
// Electron 41 ESM does not expose the runtime API via `import` from "electron";
// use a CommonJS require() so build-less execution from src works.
const require = createRequire(import.meta.url);
const { app } = require("electron");
import { DEFAULT_SERVER_URL_KEY, WSL_ENABLED_KEY } from "./constants.js";
import { getUserShell, loadShellEnv } from "./shell-env.js";
import { getStore } from "./store.js";

// Resolve the closedcode sidecar entry (node.js) as a file:// URL for dynamic
// import, working across all three layouts:
//   - packaged:   out/main/closedcode-server/node.js, unpacked from asar
//                 (electron-builder asarUnpack rewrites .../app.asar/... ->
//                 .../app.asar.unpacked/...).
//   - built dev:  out/main/closedcode-server/node.js (sidecar copied by build.js
//                 step "copy closedcode-server sidecar").
//   - build-less: running directly from src/main has no co-located sidecar, so
//                 fall back to the separately-built dist at
//                 packages/closedcode/dist/node (same dir build.js copies FROM).
export function resolveSidecarUrl() {
  const mainDir = dirname(fileURLToPath(import.meta.url));
  // Co-located sidecar next to the main bundle (packaged / built layouts). When
  // packaged, asarUnpack moves it out of the asar archive, so rewrite the path.
  const colocated = join(mainDir, "closedcode-server", "node.js").replace("/app.asar/", "/app.asar.unpacked/");
  // Packaged-from-src layout (main = src/main, out/ still shipped):
  //   .../src/main -> .../out/main/closedcode-server/node.js
  const fromOut = resolve(mainDir, "../../out/main/closedcode-server/node.js").replace("/app.asar/", "/app.asar.unpacked/");
  // Build-less dev: run directly from src, no co-located sidecar; use the
  // separately-built dist (same dir build.js copies the sidecar FROM):
  //   packages/desktop-electron/src/main -> packages/closedcode/dist/node
  const fromDist = resolve(mainDir, "../../../closedcode/dist/node/node.js");
  // When running build-less from src (not packaged), prefer the freshly-built
  // dist/node over a stale out/main/closedcode-server bundle left behind by an
  // earlier `npm run build`. A leftover out/ would otherwise shadow dist/node
  // and silently run an outdated sidecar. When packaged, out/main is the real
  // shipped sidecar, so it keeps priority.
  const candidates = app.isPackaged
    ? [colocated, fromOut, fromDist]
    : [colocated, fromDist, fromOut];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return pathToFileURL(candidate).href;
  }
  // Fall back to the first candidate's URL so the dynamic import throws a
  // clear "module not found" rather than a silent undefined.
  return pathToFileURL(candidates[0]).href;
}
export function getDefaultServerUrl() {
  const value = getStore().get(DEFAULT_SERVER_URL_KEY);
  return typeof value === "string" ? value : null;
}
export function setDefaultServerUrl(url) {
  if (url) {
    getStore().set(DEFAULT_SERVER_URL_KEY, url);
    return;
  }
  getStore().delete(DEFAULT_SERVER_URL_KEY);
}
export function getWslConfig() {
  const value = getStore().get(WSL_ENABLED_KEY);
  return {
    enabled: typeof value === "boolean" ? value : false
  };
}
export function setWslConfig(config) {
  getStore().set(WSL_ENABLED_KEY, config.enabled);
}
export async function spawnLocalServer(hostname, port, password) {
  prepareServerEnv(password);
  // ESM dynamic import can't reach into app.asar. The closedcode server lives
  // in app.asar.unpacked when packaged (electron-builder asarUnpack), or in
  // packages/closedcode/dist/node when running build-less. resolveSidecarUrl()
  // handles both.
  const {
    Log,
    Server
  } = await import(resolveSidecarUrl());
  await Log.init({
    level: "WARN"
  });
  const listener = await Server.listen({
    port,
    hostname,
    username: "closedcode",
    password,
    cors: ["vcc://renderer"]
  });
  const wait = (async () => {
    const url = `http://${hostname}:${port}`;
    const ready = async () => {
      while (true) {
        await new Promise(resolve => setTimeout(resolve, 100));
        if (await checkHealth(url, password)) return;
      }
    };
    await ready();
  })();
  return {
    listener,
    health: {
      wait
    }
  };
}
function prepareServerEnv(password) {
  const shell = process.platform === "win32" ? null : getUserShell();
  const shellEnv = shell ? loadShellEnv(shell) ?? {} : {};
  const env = {
    ...process.env,
    ...shellEnv,
    CLOSEDCODE_EXPERIMENTAL_ICON_DISCOVERY: "true",
    CLOSEDCODE_EXPERIMENTAL_FILEWATCHER: "true",
    CLOSEDCODE_CLIENT: "desktop",
    CLOSEDCODE_SERVER_USERNAME: "closedcode",
    CLOSEDCODE_SERVER_PASSWORD: password,
    XDG_STATE_HOME: app.getPath("userData")
  };
  Object.assign(process.env, env);
}
export async function checkHealth(url, password) {
  let healthUrl;
  try {
    healthUrl = new URL("/global/health", url);
  } catch {
    return false;
  }
  const headers = new Headers();
  if (password) {
    const auth = Buffer.from(`closedcode:${password}`).toString("base64");
    headers.set("authorization", `Basic ${auth}`);
  }
  try {
    const res = await fetch(healthUrl, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(3000)
    });
    return res.ok;
  } catch {
    return false;
  }
}