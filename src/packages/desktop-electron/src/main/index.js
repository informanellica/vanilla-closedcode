import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";
// Electron 41's ESM loader does not expose the "electron" runtime API via
// `import` (neither named nor default resolves to the real app/BrowserWindow
// objects). Use a CommonJS require() (which DOES return the runtime API in the
// main process) so this file runs directly from src with no esbuild bundling.
// This mirrors the createRequire banner the previous esbuild build injected.
const require = createRequire(import.meta.url);
const { app, dialog } = require("electron");
// Enable CDP attach when CLOSEDCODE_REMOTE_DEBUG is set (used by Playwright
// tests). Must run before app.whenReady() — placed as first thing after the
// `app` import.
if (process.env.CLOSEDCODE_REMOTE_DEBUG) {
  const port = String(process.env.CLOSEDCODE_REMOTE_DEBUG)
  app.commandLine.appendSwitch("remote-debugging-port", port)
  app.commandLine.appendSwitch("remote-allow-origins", "*")
}
import pkg from "electron-updater";
import contextMenu from "electron-context-menu";
contextMenu({
  showSaveImageAs: true,
  showLookUpSelection: false,
  showSearchWithGoogle: false
});

// on macOS apps run in `/` which can cause issues with ripgrep
try {
  process.chdir(homedir());
} catch {}
process.env.CLOSEDCODE_DISABLE_EMBEDDED_WEB_UI = "true";
const APP_NAMES = {
  dev: "vanilla-closedcode",
  beta: "vanilla-closedcode",
  prod: "vanilla-closedcode"
};
const APP_IDS = {
  dev: "local.vanilla-closedcode.dev",
  beta: "local.vanilla-closedcode.beta",
  prod: "local.vanilla-closedcode"
};
if (process.env.CLOSEDCODE_APP_DATA_DIR) {
  app.setPath("appData", process.env.CLOSEDCODE_APP_DATA_DIR);
}
const appId = app.isPackaged ? APP_IDS[CHANNEL] : "local.vanilla-closedcode.dev";
app.setName(app.isPackaged ? APP_NAMES[CHANNEL] : "vanilla-closedcode");
app.setAppUserModelId(appId);
app.setPath("userData", join(app.getPath("appData"), appId));
const {
  autoUpdater
} = pkg;
import { checkAppExists, resolveAppPath, wslPath } from "./apps.js";
import { CHANNEL, UPDATER_ENABLED } from "./constants.js";
import { registerIpcHandlers, sendDeepLinks, sendMenuCommand, sendSqliteMigrationProgress } from "./ipc.js";
import { initLogging } from "./logging.js";
import { parseMarkdown } from "./markdown.js";
import { createMenu } from "./menu.js";
import { getDefaultServerUrl, getWslConfig, resolveSidecarUrl, setDefaultServerUrl, setWslConfig, spawnLocalServer } from "./server.js";
import { createLoadingWindow, createMainWindow, registerRendererProtocol, setBackgroundColor, setDockIcon } from "./windows.js";
const initEmitter = new EventEmitter();
let initStep = {
  phase: "server_waiting"
};
let mainWindow = null;
let server = null;
const loadingComplete = defer();
const pendingDeepLinks = [];
const serverReady = defer();
const logger = initLogging();
logger.log("app starting", {
  version: app.getVersion(),
  packaged: app.isPackaged
});
setupApp();
function setupApp() {
  ensureLoopbackNoProxy();
  app.commandLine.appendSwitch("proxy-bypass-list", "<-loopback>");
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }
  app.on("second-instance", (_event, argv) => {
    const urls = argv.filter(arg => arg.startsWith("closedcode://"));
    if (urls.length) {
      logger.log("deep link received via second-instance", {
        urls
      });
      emitDeepLinks(urls);
    }
    focusMainWindow();
  });
  app.on("open-url", (event, url) => {
    event.preventDefault();
    logger.log("deep link received via open-url", {
      url
    });
    emitDeepLinks([url]);
  });
  app.on("before-quit", () => {
    killSidecar();
  });
  app.on("will-quit", () => {
    killSidecar();
  });
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
      killSidecar();
      app.exit(0);
    });
  }
  void app.whenReady().then(async () => {
    app.setAsDefaultProtocolClient("closedcode");
    registerRendererProtocol();
    setDockIcon();
    setupAutoUpdater();
    setupLocalLLMCors();
    await initialize();
  }).catch(error => {
    // Without this, a failed boot (e.g. the sidecar import throwing) is an
    // unhandled rejection: no window ever opens but the process lives on,
    // holding the single-instance lock so retries die silently too.
    logger.error("initialization failed", error);
    dialog.showErrorBox("vanilla-closedcode failed to start", String(error?.stack ?? error));
    killSidecar();
    app.exit(1);
  });
}
function isLocalLLMHost(hostname) {
  if (hostname.startsWith("[") && hostname.endsWith("]")) hostname = hostname.slice(1, -1);
  if (hostname === "localhost") return true;
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
  if (ipv4) {
    const a = Number(ipv4[1]);
    const b = Number(ipv4[2]);
    if (a === 127 || a === 10) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 169 && b === 254) return true;
  }
  if (hostname === "::1" || hostname.toLowerCase().startsWith("fc") || hostname.toLowerCase().startsWith("fd")) return true;
  if (hostname.endsWith(".local") || hostname.endsWith(".lan") || hostname.endsWith(".internal")) return true;
  return false;
}
function setupLocalLLMCors() {
  const {
    session
  } = require("electron");
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    try {
      const url = new URL(details.url);
      if (isLocalLLMHost(url.hostname)) {
        const headers = {
          ...details.responseHeaders
        };
        for (const k of Object.keys(headers)) {
          if (k.toLowerCase().startsWith("access-control-")) delete headers[k];
        }
        headers["Access-Control-Allow-Origin"] = ["*"];
        headers["Access-Control-Allow-Methods"] = ["GET, POST, PUT, DELETE, OPTIONS"];
        headers["Access-Control-Allow-Headers"] = ["*"];
        callback({
          responseHeaders: headers
        });
        return;
      }
    } catch {}
    callback({
      responseHeaders: details.responseHeaders
    });
  });
}
function emitDeepLinks(urls) {
  if (urls.length === 0) return;
  pendingDeepLinks.push(...urls);
  if (mainWindow) sendDeepLinks(mainWindow, urls);
}
function focusMainWindow() {
  if (!mainWindow) return;
  mainWindow.show();
  mainWindow.focus();
}
function setInitStep(step) {
  initStep = step;
  logger.log("init step", {
    step
  });
  initEmitter.emit("step", step);
}
async function initialize() {
  const needsMigration = !sqliteFileExists();
  const sqliteDone = needsMigration ? defer() : undefined;
  let overlay = null;
  const port = await getSidecarPort();
  const hostname = "127.0.0.1";
  const url = `http://${hostname}:${port}`;
  const password = randomUUID();
  const loadingTask = (async () => {
    logger.log("sidecar connection started", {
      url
    });
    initEmitter.on("sqlite", progress => {
      setInitStep({
        phase: "sqlite_waiting"
      });
      if (overlay) sendSqliteMigrationProgress(overlay, progress);
      if (mainWindow) sendSqliteMigrationProgress(mainWindow, progress);
      if (progress.type === "Done") sqliteDone?.resolve();
    });
    if (needsMigration) {
      // Resolve the sidecar entry (packaged asar-unpacked path, or the
      // build-less packages/closedcode/dist/node fallback) before importing.
      const {
        JsonMigration
      } = await import(resolveSidecarUrl());
      // ORM migration S4: JsonMigration opens the Sequelize layer itself.
      await JsonMigration.run({
        progress: event => {
          const percent = Math.round(event.current / event.total) * 100;
          initEmitter.emit("sqlite", {
            type: "InProgress",
            value: percent
          });
        }
      });
      initEmitter.emit("sqlite", {
        type: "Done"
      });
      sqliteDone?.resolve();
    }
    if (needsMigration) {
      await sqliteDone?.promise;
    }
    logger.log("spawning sidecar", {
      url
    });
    const {
      listener,
      health
    } = await spawnLocalServer(hostname, port, password);
    server = listener;
    serverReady.resolve({
      url,
      username: "closedcode",
      password
    });
    await Promise.race([health.wait, delay(30_000).then(() => {
      throw new Error("Sidecar health check timed out");
    })]).catch(error => {
      logger.error("sidecar health check failed", error);
    });
    logger.log("loading task finished");
  })();
  if (needsMigration) {
    const show = await Promise.race([loadingTask.then(() => false), delay(1_000).then(() => true)]);
    if (show) {
      overlay = createLoadingWindow();
      await delay(1_000);
    }
  }
  await loadingTask;
  setInitStep({
    phase: "done"
  });
  if (overlay) {
    await loadingComplete.promise;
  }
  mainWindow = createMainWindow();
  wireMenu();
  overlay?.close();
}
function wireMenu() {
  if (!mainWindow) return;
  createMenu({
    trigger: id => mainWindow && sendMenuCommand(mainWindow, id),
    checkForUpdates: () => {
      void checkForUpdates(true);
    },
    reload: () => mainWindow?.reload(),
    relaunch: () => {
      killSidecar();
      app.relaunch();
      app.exit(0);
    }
  });
}
registerIpcHandlers({
  killSidecar: () => killSidecar(),
  awaitInitialization: async sendStep => {
    sendStep(initStep);
    const listener = step => sendStep(step);
    initEmitter.on("step", listener);
    try {
      logger.log("awaiting server ready");
      const res = await serverReady.promise;
      logger.log("server ready", {
        url: res.url
      });
      return res;
    } finally {
      initEmitter.off("step", listener);
    }
  },
  getWindowConfig: () => ({
    updaterEnabled: UPDATER_ENABLED
  }),
  consumeInitialDeepLinks: () => pendingDeepLinks.splice(0),
  getDefaultServerUrl: () => getDefaultServerUrl(),
  setDefaultServerUrl: url => setDefaultServerUrl(url),
  getWslConfig: () => Promise.resolve(getWslConfig()),
  setWslConfig: config => setWslConfig(config),
  getDisplayBackend: async () => null,
  setDisplayBackend: async () => undefined,
  parseMarkdown: async markdown => parseMarkdown(markdown),
  checkAppExists: async appName => checkAppExists(appName),
  wslPath: async (path, mode) => wslPath(path, mode),
  resolveAppPath: async appName => resolveAppPath(appName),
  loadingWindowComplete: () => loadingComplete.resolve(),
  runUpdater: async alertOnFail => checkForUpdates(alertOnFail),
  checkUpdate: async () => checkUpdate(),
  installUpdate: async () => installUpdate(),
  setBackgroundColor: color => setBackgroundColor(color)
});
function killSidecar() {
  if (!server) return;
  server.stop();
  server = null;
}
function ensureLoopbackNoProxy() {
  const loopback = ["127.0.0.1", "localhost", "::1"];
  const upsert = key => {
    const items = (process.env[key] ?? "").split(",").map(value => value.trim()).filter(value => Boolean(value));
    for (const host of loopback) {
      if (items.some(value => value.toLowerCase() === host)) continue;
      items.push(host);
    }
    process.env[key] = items.join(",");
  };
  upsert("NO_PROXY");
  upsert("no_proxy");
}
async function getSidecarPort() {
  const fromEnv = process.env.CLOSEDCODE_PORT;
  if (fromEnv) {
    const parsed = Number.parseInt(fromEnv, 10);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (typeof address !== "object" || !address) {
        server.close();
        reject(new Error("Failed to get port"));
        return;
      }
      const port = address.port;
      server.close(() => resolve(port));
    });
  });
}
function sqliteFileExists() {
  const xdg = process.env.XDG_DATA_HOME;
  const base = xdg && xdg.length > 0 ? xdg : join(homedir(), ".local", "share");
  // Only check the canonical closedcode directory/file; never inspect a
  // coexisting opencode install's data directory.
  if (existsSync(join(base, "closedcode", "closedcode.db"))) return true;
  return false;
}
function setupAutoUpdater() {
  if (!UPDATER_ENABLED) return;
  autoUpdater.logger = logger;
  autoUpdater.channel = "latest";
  autoUpdater.allowPrerelease = false;
  autoUpdater.allowDowngrade = true;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  logger.log("auto updater configured", {
    channel: autoUpdater.channel,
    allowPrerelease: autoUpdater.allowPrerelease,
    allowDowngrade: autoUpdater.allowDowngrade,
    currentVersion: app.getVersion()
  });
}
let downloadedUpdateVersion;
async function checkUpdate() {
  if (!UPDATER_ENABLED) return {
    updateAvailable: false
  };
  if (downloadedUpdateVersion) {
    logger.log("returning cached downloaded update", {
      version: downloadedUpdateVersion
    });
    return {
      updateAvailable: true,
      version: downloadedUpdateVersion
    };
  }
  logger.log("checking for updates", {
    currentVersion: app.getVersion(),
    channel: autoUpdater.channel,
    allowPrerelease: autoUpdater.allowPrerelease,
    allowDowngrade: autoUpdater.allowDowngrade
  });
  try {
    const result = await autoUpdater.checkForUpdates();
    const updateInfo = result?.updateInfo;
    logger.log("update metadata fetched", {
      releaseVersion: updateInfo?.version ?? null,
      releaseDate: updateInfo?.releaseDate ?? null,
      releaseName: updateInfo?.releaseName ?? null,
      files: updateInfo?.files?.map(file => file.url) ?? []
    });
    const version = result?.updateInfo?.version;
    if (result?.isUpdateAvailable === false || !version) {
      logger.log("no update available", {
        reason: "provider returned no newer version"
      });
      return {
        updateAvailable: false
      };
    }
    logger.log("update available", {
      version
    });
    await autoUpdater.downloadUpdate();
    logger.log("update download completed", {
      version
    });
    downloadedUpdateVersion = version;
    return {
      updateAvailable: true,
      version
    };
  } catch (error) {
    logger.error("update check failed", error);
    return {
      updateAvailable: false,
      failed: true
    };
  }
}
async function installUpdate() {
  if (!downloadedUpdateVersion) {
    logger.log("install update skipped", {
      reason: "no downloaded update ready"
    });
    return;
  }
  logger.log("installing downloaded update", {
    version: downloadedUpdateVersion
  });
  killSidecar();
  autoUpdater.quitAndInstall();
}
async function checkForUpdates(alertOnFail) {
  if (!UPDATER_ENABLED) return;
  logger.log("checkForUpdates invoked", {
    alertOnFail
  });
  const result = await checkUpdate();
  if (!result.updateAvailable) {
    if (result.failed) {
      logger.log("no update decision", {
        reason: "update check failed"
      });
      if (!alertOnFail) return;
      await dialog.showMessageBox({
        type: "error",
        message: "Update check failed.",
        title: "Update Error"
      });
      return;
    }
    logger.log("no update decision", {
      reason: "already up to date"
    });
    if (!alertOnFail) return;
    await dialog.showMessageBox({
      type: "info",
      message: "You're up to date.",
      title: "No Updates"
    });
    return;
  }
  const response = await dialog.showMessageBox({
    type: "info",
    message: `Update ${result.version ?? ""} downloaded. Restart now?`,
    title: "Update Ready",
    buttons: ["Restart", "Later"],
    defaultId: 0,
    cancelId: 1
  });
  logger.log("update prompt response", {
    version: result.version ?? null,
    restartNow: response.response === 0
  });
  if (response.response === 0) {
    await installUpdate();
  }
}
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
function defer() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return {
    promise,
    resolve,
    reject
  };
}