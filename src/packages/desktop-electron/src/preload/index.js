// Electron preload scripts run in a CommonJS context — sandboxed preloads
// (webPreferences.sandbox: true, set in windows.js) do not support ESM `import`.
// Use require() so this file loads directly from src with no esbuild bundling.
const { contextBridge, ipcRenderer } = require("electron");
const api = {
  // LLM model management (provider-agnostic). pull streams progress via the
  // "llm-pull-progress" channel, correlated by requestId.
  llmCanPull: kind => ipcRenderer.invoke("llm-can-pull", kind),
  llmListModels: (kind, baseURL) => ipcRenderer.invoke("llm-list-models", { kind, baseURL }),
  llmModelVision: (baseURL, model) => ipcRenderer.invoke("llm-model-vision", { baseURL, model }),
  llmPs: baseURL => ipcRenderer.invoke("llm-ps", { baseURL }),
  llmDeleteModel: (baseURL, model) => ipcRenderer.invoke("llm-delete-model", { baseURL, model }),
  llmPullModel: (kind, baseURL, model, requestId) => ipcRenderer.invoke("llm-pull-model", { kind, baseURL, model, requestId }),
  onLlmPullProgress: callback => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("llm-pull-progress", handler);
    return () => ipcRenderer.removeListener("llm-pull-progress", handler);
  },
  killSidecar: () => ipcRenderer.invoke("kill-sidecar"),
  installCli: () => ipcRenderer.invoke("install-cli"),
  awaitInitialization: onStep => {
    const handler = (_, step) => onStep(step);
    ipcRenderer.on("init-step", handler);
    return ipcRenderer.invoke("await-initialization").finally(() => {
      ipcRenderer.removeListener("init-step", handler);
    });
  },
  getWindowConfig: () => ipcRenderer.invoke("get-window-config"),
  consumeInitialDeepLinks: () => ipcRenderer.invoke("consume-initial-deep-links"),
  getDefaultServerUrl: () => ipcRenderer.invoke("get-default-server-url"),
  setDefaultServerUrl: url => ipcRenderer.invoke("set-default-server-url", url),
  getWslConfig: () => ipcRenderer.invoke("get-wsl-config"),
  setWslConfig: config => ipcRenderer.invoke("set-wsl-config", config),
  getDisplayBackend: () => ipcRenderer.invoke("get-display-backend"),
  setDisplayBackend: backend => ipcRenderer.invoke("set-display-backend", backend),
  parseMarkdownCommand: markdown => ipcRenderer.invoke("parse-markdown", markdown),
  checkAppExists: appName => ipcRenderer.invoke("check-app-exists", appName),
  wslPath: (path, mode) => ipcRenderer.invoke("wsl-path", path, mode),
  resolveAppPath: appName => ipcRenderer.invoke("resolve-app-path", appName),
  storeGet: (name, key) => ipcRenderer.invoke("store-get", name, key),
  storeSet: (name, key, value) => ipcRenderer.invoke("store-set", name, key, value),
  storeDelete: (name, key) => ipcRenderer.invoke("store-delete", name, key),
  storeClear: name => ipcRenderer.invoke("store-clear", name),
  storeKeys: name => ipcRenderer.invoke("store-keys", name),
  storeLength: name => ipcRenderer.invoke("store-length", name),
  readFile: absPath => ipcRenderer.invoke("read-file", absPath),
  writeFile: (absPath, content) => ipcRenderer.invoke("write-file", absPath, content),
  fsMkdir: absPath => ipcRenderer.invoke("fs-mkdir", absPath),
  fsNewFile: absPath => ipcRenderer.invoke("fs-new-file", absPath),
  fsRename: (src, dest) => ipcRenderer.invoke("fs-rename", src, dest),
  fsDelete: absPath => ipcRenderer.invoke("fs-delete", absPath),
  fsCopy: (src, dest) => ipcRenderer.invoke("fs-copy", src, dest),
  fsExists: absPath => ipcRenderer.invoke("fs-exists", absPath),
  getWindowCount: () => ipcRenderer.invoke("get-window-count"),
  onSqliteMigrationProgress: cb => {
    const handler = (_, progress) => cb(progress);
    ipcRenderer.on("sqlite-migration-progress", handler);
    return () => ipcRenderer.removeListener("sqlite-migration-progress", handler);
  },
  onMenuCommand: cb => {
    const handler = (_, id) => cb(id);
    ipcRenderer.on("menu-command", handler);
    return () => ipcRenderer.removeListener("menu-command", handler);
  },
  onDeepLink: cb => {
    const handler = (_, urls) => cb(urls);
    ipcRenderer.on("deep-link", handler);
    return () => ipcRenderer.removeListener("deep-link", handler);
  },
  openDirectoryPicker: opts => ipcRenderer.invoke("open-directory-picker", opts),
  openFilePicker: opts => ipcRenderer.invoke("open-file-picker", opts),
  saveFilePicker: opts => ipcRenderer.invoke("save-file-picker", opts),
  openLink: url => ipcRenderer.send("open-link", url),
  openPath: (path, app) => ipcRenderer.invoke("open-path", path, app),
  readClipboardImage: () => ipcRenderer.invoke("read-clipboard-image"),
  clipboardReadText: () => ipcRenderer.invoke("read-clipboard-text"),
  clipboardWriteText: text => ipcRenderer.invoke("write-clipboard-text", text),
  showNotification: (title, body) => ipcRenderer.send("show-notification", title, body),
  getWindowFocused: () => ipcRenderer.invoke("get-window-focused"),
  setWindowFocus: () => ipcRenderer.invoke("set-window-focus"),
  showWindow: () => ipcRenderer.invoke("show-window"),
  relaunch: () => ipcRenderer.send("relaunch"),
  getZoomFactor: () => ipcRenderer.invoke("get-zoom-factor"),
  setZoomFactor: factor => ipcRenderer.invoke("set-zoom-factor", factor),
  setTitlebar: theme => ipcRenderer.invoke("set-titlebar", theme),
  loadingWindowComplete: () => ipcRenderer.send("loading-window-complete"),
  runUpdater: alertOnFail => ipcRenderer.invoke("run-updater", alertOnFail),
  checkUpdate: () => ipcRenderer.invoke("check-update"),
  installUpdate: () => ipcRenderer.invoke("install-update"),
  setBackgroundColor: color => ipcRenderer.invoke("set-background-color", color),
  fetchLocalLLM: (url, headers) => ipcRenderer.invoke("fetch-local-llm", {
    url,
    headers
  }),
  // True only when the app was launched with CLOSEDCODE_REMOTE_DEBUG (the
  // Playwright e2e harness attaching over CDP). Renderer test hooks gate on
  // this so they are never installed in a normal run.
  remoteDebug: Boolean(process.env.CLOSEDCODE_REMOTE_DEBUG)
};
contextBridge.exposeInMainWorld("api", api);