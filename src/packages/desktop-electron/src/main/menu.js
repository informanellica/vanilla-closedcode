import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
// Electron 41 ESM does not expose the runtime API via `import` from "electron";
// use a CommonJS require() so build-less execution from src works.
const require = createRequire(import.meta.url);
const { app, BrowserWindow, Menu, shell } = require("electron");
import fs from "node:fs";
import { UPDATER_ENABLED } from "./constants.js";
import { createMainWindow } from "./windows.js";

const SUPPORTED_LANGS = new Set([
  "en", "ar", "bs", "da", "de", "es", "fr", "it", "ja", "ko", "nb", "pl",
  "pt-br", "ru", "th", "tr", "zh-cn", "zh-tw",
]);

function resolveDocsRoot() {
  // In dev: packages/desktop-electron/resources/docs/
  // Packaged: app.asar.unpacked/resources/docs/ via electron-builder extraResources
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.join(process.resourcesPath ?? "", "docs"),
    path.resolve(here, "../../resources/docs"),
  ];
  for (const c of candidates) {
    if (c && fs.existsSync(path.join(c, "_index.html"))) return c;
  }
  return null;
}

function localeToLang(locale) {
  const l = (locale || "en").toLowerCase();
  if (SUPPORTED_LANGS.has(l)) return l;
  const short = l.split("-")[0];
  if (SUPPORTED_LANGS.has(short)) return short;
  // Handle a few common cases (zh-Hans → zh-cn, zh-Hant → zh-tw, pt-PT → pt-br)
  if (l.startsWith("zh-hant") || l.startsWith("zh-tw")) return "zh-tw";
  if (l.startsWith("zh")) return "zh-cn";
  if (l.startsWith("pt")) return "pt-br";
  if (l.startsWith("nb") || l.startsWith("no")) return "nb";
  return "en";
}

function openDocs() {
  const root = resolveDocsRoot();
  if (!root) {
    shell.openExternal("https://informanellica.github.io/vanilla-closedcode/");
    return;
  }
  const lang = localeToLang(app.getLocale());
  const target = path.join(root, lang, "index.html");
  const fallback = path.join(root, "_index.html");
  const url = "file://" + (fs.existsSync(target) ? target : fallback);
  const win = new BrowserWindow({
    width: 1100,
    height: 800,
    title: "vanilla-closedcode docs",
    autoHideMenuBar: true,
  });
  win.loadURL(url);
}

export function createMenu(deps) {
  if (process.platform !== "darwin") return;
  const template = [{
    label: "vanilla-closedcode",
    submenu: [{
      role: "about"
    }, {
      label: "Check for Updates...",
      enabled: UPDATER_ENABLED,
      click: () => deps.checkForUpdates()
    }, {
      label: "Reload Webview",
      click: () => deps.reload()
    }, {
      label: "Restart",
      click: () => deps.relaunch()
    }, {
      type: "separator"
    }, {
      role: "hide"
    }, {
      role: "hideOthers"
    }, {
      role: "unhide"
    }, {
      type: "separator"
    }, {
      role: "quit"
    }]
  }, {
    label: "File",
    submenu: [{
      label: "New Session",
      accelerator: "Shift+Cmd+S",
      click: () => deps.trigger("session.new")
    }, {
      label: "Open Project...",
      accelerator: "Cmd+O",
      click: () => deps.trigger("project.open")
    }, {
      label: "New Window",
      accelerator: "Cmd+Shift+N",
      click: () => createMainWindow()
    }, {
      type: "separator"
    }, {
      role: "close"
    }]
  }, {
    label: "Edit",
    submenu: [{
      role: "undo"
    }, {
      role: "redo"
    }, {
      type: "separator"
    }, {
      role: "cut"
    }, {
      role: "copy"
    }, {
      role: "paste"
    }, {
      role: "selectAll"
    }]
  }, {
    label: "View",
    submenu: [{
      label: "Toggle Sidebar",
      accelerator: "Cmd+B",
      click: () => deps.trigger("sidebar.toggle")
    }, {
      label: "Toggle Terminal",
      accelerator: "Ctrl+`",
      click: () => deps.trigger("terminal.toggle")
    }, {
      label: "Toggle File Tree",
      click: () => deps.trigger("fileTree.toggle")
    }, {
      type: "separator"
    }, {
      role: "reload"
    }, {
      role: "toggleDevTools"
    }, {
      type: "separator"
    }, {
      role: "resetZoom"
    }, {
      role: "zoomIn"
    }, {
      role: "zoomOut"
    }, {
      type: "separator"
    }, {
      role: "togglefullscreen"
    }]
  }, {
    label: "Go",
    submenu: [{
      label: "Back",
      accelerator: "Cmd+[",
      click: () => deps.trigger("common.goBack")
    }, {
      label: "Forward",
      accelerator: "Cmd+]",
      click: () => deps.trigger("common.goForward")
    }, {
      type: "separator"
    }, {
      label: "Previous Session",
      accelerator: "Option+Up",
      click: () => deps.trigger("session.previous")
    }, {
      label: "Next Session",
      accelerator: "Option+Down",
      click: () => deps.trigger("session.next")
    }, {
      type: "separator"
    }, {
      label: "Previous Project",
      accelerator: "Cmd+Option+Up",
      click: () => deps.trigger("project.previous")
    }, {
      label: "Next Project",
      accelerator: "Cmd+Option+Down",
      click: () => deps.trigger("project.next")
    }]
  }, {
    role: "windowMenu"
  }, {
    label: "Help",
    submenu: [{
      label: "vanilla-closedcode Documentation",
      click: () => openDocs()
    }, {
      label: "Community (Discord)",
      click: () => shell.openExternal("https://discord.gg/6bvnqcH3")
    }, {
      type: "separator"
    }, {
      label: "Share Feedback",
      click: () => shell.openExternal("https://github.com/informanellica/vanilla-closedcode/issues/new")
    }, {
      label: "Report a Bug",
      click: () => shell.openExternal("https://github.com/informanellica/vanilla-closedcode/issues/new")
    }]
  }];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}