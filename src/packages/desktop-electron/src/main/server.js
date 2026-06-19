/** @file Locates and launches the bundled closedcode server sidecar, manages its connection settings (server URL, WSL), and probes its health. */
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
/**
 * Resolve the closedcode server sidecar entry point to a file:// URL suitable for dynamic import, across packaged, built-dev, and build-less layouts.
 * @returns {string} The file:// URL of the first existing sidecar candidate, or the first candidate's URL if none exist (so import throws a clear error).
 */
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
/**
 * Read the persisted default server URL from the settings store.
 * @returns {string} The stored server URL, or null if none is set.
 */
export function getDefaultServerUrl() {
  const value = getStore().get(DEFAULT_SERVER_URL_KEY);
  return typeof value === "string" ? value : null;
}
/**
 * Persist (or clear) the default server URL in the settings store.
 * @param {string} url - The server URL to store; when falsy the stored value is deleted.
 * @returns {void}
 */
export function setDefaultServerUrl(url) {
  if (url) {
    getStore().set(DEFAULT_SERVER_URL_KEY, url);
    return;
  }
  getStore().delete(DEFAULT_SERVER_URL_KEY);
}
/**
 * Read the persisted WSL configuration from the settings store.
 * @returns {Object} A config object with a boolean `enabled` flag (false when unset).
 */
export function getWslConfig() {
  const value = getStore().get(WSL_ENABLED_KEY);
  return {
    enabled: typeof value === "boolean" ? value : false
  };
}
/**
 * Persist the WSL configuration to the settings store.
 * @param {Object} config - The WSL config object whose `enabled` boolean is stored.
 * @returns {void}
 */
export function setWslConfig(config) {
  getStore().set(WSL_ENABLED_KEY, config.enabled);
}
/**
 * Start the local closedcode server sidecar in-process and wait until it reports healthy.
 * @param {string} hostname - The hostname the server should bind to.
 * @param {number} port - The TCP port the server should listen on.
 * @param {string} password - The basic-auth password used for the server and health checks.
 * @returns {Promise<Object>} An object with the server `listener` and a `health.wait` promise that resolves once the server responds to health checks.
 */
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
let envPrepared = false;
/**
 * Build and apply the environment for the server sidecar, merging the user's
 * login-shell env (non-Windows) and closedcode-specific variables into
 * process.env. Idempotent: only the first call probes the shell and mutates the
 * env, so callers can prepare the env early (e.g. before importing the sidecar
 * for the first-run SQLite migration, so core/global resolves XDG paths from the
 * login-shell env) without the later spawnLocalServer() call re-probing.
 * @param {string} password - The server password injected as CLOSEDCODE_SERVER_PASSWORD.
 * @returns {void}
 */
export function prepareServerEnv(password) {
  if (envPrepared) return;
  envPrepared = true;
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
/**
 * Probe the server's /global/health endpoint with optional basic auth and a 3s timeout.
 * @param {string} url - The base server URL to derive the health endpoint from.
 * @param {string} password - The basic-auth password; when present an Authorization header is sent.
 * @returns {Promise<boolean>} True if the health endpoint responded OK, false on any error or non-OK status.
 */
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