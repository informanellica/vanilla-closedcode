import { execFile } from "node:child_process";
import { promises as fsp } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
// Electron 41 ESM does not expose the runtime API via `import` from "electron";
// use a CommonJS require() so build-less execution from src works.
const require = createRequire(import.meta.url);
const { BrowserWindow, Notification, app, clipboard, dialog, ipcMain, shell } = require("electron");
import { getStore } from "./store.js";
import { setTitlebar } from "./windows.js";
import { getProvider, providerCanPull, modelSupportsVision, ollamaPs, ollamaDelete } from "./llm-providers.js";
const pickerFilters = ext => {
  if (!ext || ext.length === 0) return undefined;
  return [{
    name: "Files",
    extensions: ext
  }];
};
export function registerIpcHandlers(deps) {
  // LLM model management (provider-agnostic; see main/llm-providers.js). Run in
  // main so it works for remote hosts (no CORS) and can stream pull progress.
  ipcMain.handle("llm-can-pull", (_event, kind) => providerCanPull(kind));
  ipcMain.handle("llm-list-models", (_event, { kind, baseURL }) => getProvider(kind).listModels(baseURL));
  // true=vision, false=no vision, null=unknown (don't block on null).
  ipcMain.handle("llm-model-vision", (_event, { baseURL, model }) => modelSupportsVision(baseURL, model));
  // Ollama loaded-model stats (size / size_vram) for the GPU/CPU placement
  // readout in the status bar.
  ipcMain.handle("llm-ps", (_event, { baseURL }) => ollamaPs(baseURL));
  ipcMain.handle("llm-delete-model", (_event, { baseURL, model }) => ollamaDelete(baseURL, model));
  ipcMain.handle("llm-pull-model", async (event, { kind, baseURL, model, requestId }) => {
    const provider = getProvider(kind);
    if (typeof provider.pull !== "function") throw new Error("このプロバイダーは pull に対応していません");
    await provider.pull(baseURL, model, progress => {
      if (!event.sender.isDestroyed()) event.sender.send("llm-pull-progress", { requestId, ...progress });
    });
    return { ok: true };
  });
  ipcMain.handle("kill-sidecar", () => deps.killSidecar());
  ipcMain.handle("await-initialization", event => {
    const send = step => event.sender.send("init-step", step);
    return deps.awaitInitialization(send);
  });
  ipcMain.handle("get-window-config", () => deps.getWindowConfig());
  ipcMain.handle("consume-initial-deep-links", () => deps.consumeInitialDeepLinks());
  ipcMain.handle("get-default-server-url", () => deps.getDefaultServerUrl());
  ipcMain.handle("set-default-server-url", (_event, url) => deps.setDefaultServerUrl(url));
  ipcMain.handle("get-wsl-config", () => deps.getWslConfig());
  ipcMain.handle("set-wsl-config", (_event, config) => deps.setWslConfig(config));
  ipcMain.handle("get-display-backend", () => deps.getDisplayBackend());
  ipcMain.handle("set-display-backend", (_event, backend) => deps.setDisplayBackend(backend));
  ipcMain.handle("parse-markdown", (_event, markdown) => deps.parseMarkdown(markdown));
  ipcMain.handle("check-app-exists", (_event, appName) => deps.checkAppExists(appName));
  ipcMain.handle("wsl-path", (_event, path, mode) => deps.wslPath(path, mode));
  ipcMain.handle("resolve-app-path", (_event, appName) => deps.resolveAppPath(appName));
  ipcMain.on("loading-window-complete", () => deps.loadingWindowComplete());
  ipcMain.handle("run-updater", (_event, alertOnFail) => deps.runUpdater(alertOnFail));
  ipcMain.handle("check-update", () => deps.checkUpdate());
  ipcMain.handle("install-update", () => deps.installUpdate());
  ipcMain.handle("set-background-color", (_event, color) => deps.setBackgroundColor(color));
  ipcMain.handle("store-get", (_event, name, key) => {
    const store = getStore(name);
    const value = store.get(key);
    if (value === undefined || value === null) return null;
    return typeof value === "string" ? value : JSON.stringify(value);
  });
  ipcMain.handle("store-set", (_event, name, key, value) => {
    getStore(name).set(key, value);
  });
  ipcMain.handle("store-delete", (_event, name, key) => {
    getStore(name).delete(key);
  });
  ipcMain.handle("store-clear", (_event, name) => {
    getStore(name).clear();
  });
  ipcMain.handle("store-keys", (_event, name) => {
    const store = getStore(name);
    return Object.keys(store.store);
  });
  ipcMain.handle("store-length", (_event, name) => {
    const store = getStore(name);
    return Object.keys(store.store).length;
  });
  // Vanilla file IO for the in-app editor (no sidecar / no SDK). Reads and
  // writes UTF-8 text directly via Node fs. Paths must be absolute.
  ipcMain.handle("read-file", async (_event, absPath) => {
    if (typeof absPath !== "string" || !path.isAbsolute(absPath)) {
      throw new Error("read-file: absolute path required");
    }
    return fsp.readFile(absPath, "utf8");
  });
  ipcMain.handle("write-file", async (_event, absPath, content) => {
    if (typeof absPath !== "string" || !path.isAbsolute(absPath)) {
      throw new Error("write-file: absolute path required");
    }
    await fsp.writeFile(absPath, typeof content === "string" ? content : String(content), "utf8");
    return true;
  });
  // Vanilla file-system operations for the explorer context menu (no SDK).
  // All paths must be absolute.
  const requireAbs = (p, who) => {
    if (typeof p !== "string" || !path.isAbsolute(p)) throw new Error(`${who}: absolute path required`);
  };
  ipcMain.handle("fs-mkdir", async (_event, absPath) => {
    requireAbs(absPath, "fs-mkdir");
    await fsp.mkdir(absPath, { recursive: true });
    return true;
  });
  ipcMain.handle("fs-new-file", async (_event, absPath) => {
    requireAbs(absPath, "fs-new-file");
    // Create empty file only if it doesn't exist (don't clobber).
    const fh = await fsp.open(absPath, "wx");
    await fh.close();
    return true;
  });
  ipcMain.handle("fs-rename", async (_event, src, dest) => {
    requireAbs(src, "fs-rename"); requireAbs(dest, "fs-rename");
    await fsp.rename(src, dest);
    return true;
  });
  ipcMain.handle("fs-delete", async (_event, absPath) => {
    requireAbs(absPath, "fs-delete");
    await fsp.rm(absPath, { recursive: true, force: true });
    return true;
  });
  ipcMain.handle("fs-copy", async (_event, src, dest) => {
    requireAbs(src, "fs-copy"); requireAbs(dest, "fs-copy");
    await fsp.cp(src, dest, { recursive: true, force: true });
    return true;
  });
  ipcMain.handle("fs-exists", async (_event, absPath) => {
    try { await fsp.access(absPath); return true; } catch { return false; }
  });
  ipcMain.handle("open-directory-picker", async (_event, opts) => {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory", ...(opts?.multiple ? ["multiSelections"] : []), "createDirectory"],
      title: opts?.title ?? "Choose a folder",
      defaultPath: opts?.defaultPath
    });
    if (result.canceled) return null;
    return opts?.multiple ? result.filePaths : result.filePaths[0];
  });
  ipcMain.handle("open-file-picker", async (_event, opts) => {
    const result = await dialog.showOpenDialog({
      properties: ["openFile", ...(opts?.multiple ? ["multiSelections"] : [])],
      title: opts?.title ?? "Choose a file",
      defaultPath: opts?.defaultPath,
      filters: pickerFilters(opts?.extensions)
    });
    if (result.canceled) return null;
    return opts?.multiple ? result.filePaths : result.filePaths[0];
  });
  ipcMain.handle("save-file-picker", async (_event, opts) => {
    const result = await dialog.showSaveDialog({
      title: opts?.title ?? "Save file",
      defaultPath: opts?.defaultPath
    });
    if (result.canceled) return null;
    return result.filePath ?? null;
  });
  ipcMain.on("open-link", (_event, url) => {
    void shell.openExternal(url);
  });
  ipcMain.handle("open-path", async (_event, path, app) => {
    if (!app) return shell.openPath(path);
    await new Promise((resolve, reject) => {
      const [cmd, args] = process.platform === "darwin" ? ["open", ["-a", app, path]] : [app, [path]];
      execFile(cmd, args, err => err ? reject(err) : resolve());
    });
  });
  ipcMain.handle("read-clipboard-text", () => clipboard.readText());
  ipcMain.handle("write-clipboard-text", (_event, text) => {
    clipboard.writeText(typeof text === "string" ? text : String(text ?? ""));
    return true;
  });
  ipcMain.handle("read-clipboard-image", () => {
    const image = clipboard.readImage();
    if (image.isEmpty()) return null;
    const buffer = image.toPNG().buffer;
    const size = image.getSize();
    return {
      buffer,
      width: size.width,
      height: size.height
    };
  });
  ipcMain.on("show-notification", (_event, title, body) => {
    new Notification({
      title,
      body
    }).show();
  });
  ipcMain.handle("get-window-count", () => BrowserWindow.getAllWindows().length);
  ipcMain.handle("get-window-focused", event => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return win?.isFocused() ?? false;
  });
  ipcMain.handle("set-window-focus", event => {
    const win = BrowserWindow.fromWebContents(event.sender);
    win?.focus();
  });
  ipcMain.handle("show-window", event => {
    const win = BrowserWindow.fromWebContents(event.sender);
    win?.show();
  });
  ipcMain.on("relaunch", () => {
    app.relaunch();
    app.exit(0);
  });
  ipcMain.handle("fetch-local-llm", async (_event, args) => {
    const headers = {
      ...(args.headers ?? {})
    };
    delete headers["Origin"];
    delete headers["origin"];
    try {
      const res = await fetch(args.url, {
        headers
      });
      const body = await res.text();
      return {
        ok: res.ok,
        status: res.status,
        statusText: res.statusText,
        body
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        status: 0,
        statusText: message,
        body: ""
      };
    }
  });
  ipcMain.handle("get-zoom-factor", event => event.sender.getZoomFactor());
  ipcMain.handle("set-zoom-factor", (event, factor) => event.sender.setZoomFactor(factor));
  ipcMain.handle("set-titlebar", (event, theme) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    setTitlebar(win, theme);
  });
}
export function sendSqliteMigrationProgress(win, progress) {
  win.webContents.send("sqlite-migration-progress", progress);
}
export function sendMenuCommand(win, id) {
  win.webContents.send("menu-command", id);
}
export function sendDeepLinks(win, urls) {
  win.webContents.send("deep-link", urls);
}