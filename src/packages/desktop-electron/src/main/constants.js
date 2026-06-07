import { createRequire } from "node:module";
// Electron 41's ESM loader does not expose the runtime API via `import` from
// "electron" (neither named nor default resolves to the real app object). Use a
// CommonJS require() so build-less execution gets the real main-process API.
const require = createRequire(import.meta.url);
const { app } = require("electron");
// Build-less replacement for the esbuild `define` of import.meta.env.* :
// read the channel from the environment at runtime (defaults to "prod"),
// matching the packaged-build behavior where CLOSEDCODE_CHANNEL was injected.
const raw = process.env.CLOSEDCODE_CHANNEL;
export const CHANNEL = raw === "dev" || raw === "beta" || raw === "prod" ? raw : "prod";
export const SETTINGS_STORE = "closedcode.settings";
export const DEFAULT_SERVER_URL_KEY = "defaultServerUrl";
export const WSL_ENABLED_KEY = "wslEnabled";
export const UPDATER_ENABLED = app.isPackaged && CHANNEL !== "dev";