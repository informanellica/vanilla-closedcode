/** @file Loads, merges, and exposes the TUI configuration: walks global/project/.closedcode config dirs, migrates legacy opencode keys, resolves plugins, applies platform keybind tweaks, and installs plugin dependencies. */
export * as TuiConfig from "./tui.js";
import { mergeDeep, unique } from "remeda";
import { Context, Effect, Fiber, Layer } from "effect";
import { ConfigParse } from "#config/parse.js";
import * as ConfigPaths from "#config/paths.js";
import { migrateTuiConfig } from "./tui-migrate.js";
import { TuiInfo } from "./tui-schema.js";
import { Flag } from "core/flag/flag";
import { isRecord } from "#util/record.js";
import { Global } from "core/global";
import { AppFileSystem } from "core/filesystem";
import { CurrentWorkingDirectory } from "./cwd.js";
import { ConfigPlugin } from "#config/plugin.js";
import { ConfigKeybinds } from "#config/keybinds.js";
import { InstallationLocal, InstallationVersion } from "core/installation/version";
import { makeRuntime } from "core/effect/runtime";
import { Filesystem } from "#util/filesystem.js";
import * as Log from "core/util/log";
import { ConfigVariable } from "#config/variable.js";
import { Npm } from "core/npm";
const log = Log.create({
  service: "tui.config"
});
/**
 * Zod schema for the merged TUI config (re-export of TuiInfo).
 * @type {Object}
 */
export const Info = TuiInfo;
/**
 * Effect service tag for the loaded TUI config (exposes `get` and `waitForDependencies`).
 */
export class Service extends Context.Service()("@closedcode/TuiConfig") {}
/**
 * Determines whether a plugin config file is project-local or global, relative to the instance directory.
 * @param {string} file - Path to the config file declaring the plugin.
 * @param {Object} ctx - Context with the instance `directory`.
 * @returns {string} "local" if the file lives under the instance directory, otherwise "global".
 */
function pluginScope(file, ctx) {
  if (Filesystem.contains(ctx.directory, file)) return "local";
  // if (ctx.worktree !== "/" && Filesystem.contains(ctx.worktree, file)) return "local"
  return "global";
}
/**
 * Flattens a nested `tui` key into the top-level config so users who mirrored the old opencode.json shape still apply.
 * Top-level keys take precedence over nested ones; a non-record `tui` value is dropped.
 * @param {Object} raw - The parsed config object.
 * @returns {Object} The flattened config object.
 */
function normalize(raw) {
  const data = {
    ...raw
  };
  if (!("tui" in data)) return data;
  if (!isRecord(data.tui)) {
    delete data.tui;
    return data;
  }
  const tui = data.tui;
  delete data.tui;
  return {
    ...tui,
    ...data
  };
}
/**
 * Resolves each plugin spec in the config to its concrete form relative to the config file location.
 * @param {Object} config - The parsed config (mutated in place).
 * @param {string} configFilepath - Path of the config file the plugins were declared in.
 * @returns {Promise<Object>} The same config with resolved plugin specs.
 */
async function resolvePlugins(config, configFilepath) {
  if (!config.plugin) return config;
  for (let i = 0; i < config.plugin.length; i++) {
    config.plugin[i] = await ConfigPlugin.resolvePluginSpec(config.plugin[i], configFilepath);
  }
  return config;
}
/**
 * Loads one config file and deep-merges it into the accumulator, tracking deduplicated plugin origins/scopes.
 * @param {Object} acc - Accumulator with a `result` object that is merged into.
 * @param {string} file - Path of the config file to load and merge.
 * @param {Object} ctx - Context with the instance `directory` (used to scope plugins).
 * @returns {Promise<void>}
 */
async function mergeFile(acc, file, ctx) {
  const data = await loadFile(file);
  acc.result = mergeDeep(acc.result, data);
  if (!data.plugin?.length) return;
  const scope = pluginScope(file, ctx);
  const plugins = ConfigPlugin.deduplicatePluginOrigins([...(acc.result.plugin_origins ?? []), ...data.plugin.map(spec => ({
    spec,
    scope,
    source: file
  }))]);
  acc.result.plugin = plugins.map(item => item.spec);
  acc.result.plugin_origins = plugins;
}
/**
 * Loads and merges the full TUI config for a directory in precedence order (global, explicit override, project files,
 * .closedcode/.opencode dirs), runs legacy migration first, and applies Windows-specific keybind defaults.
 * @param {Object} ctx - Context with the instance `directory`.
 * @returns {Effect} An Effect resolving to `{config, dirs}` where `dirs` are plugin-dependency install locations.
 */
const loadState = Effect.fn("TuiConfig.loadState")(function* (ctx) {
  // Every config dir we may read from: global config dir, any `.closedcode`
  // (or legacy `.opencode`) folders between cwd and home, and CLOSEDCODE_CONFIG_DIR.
  const directories = yield* ConfigPaths.directories(ctx.directory);
  yield* Effect.promise(() => migrateTuiConfig({
    directories,
    cwd: ctx.directory
  }));
  const projectFiles = Flag.CLOSEDCODE_DISABLE_PROJECT_CONFIG ? [] : yield* ConfigPaths.files("tui", ctx.directory);
  const acc = {
    result: {}
  };

  // 1. Global tui config (lowest precedence).
  for (const file of ConfigPaths.fileInDirectory(Global.Path.config, "tui")) {
    yield* Effect.promise(() => mergeFile(acc, file, ctx)).pipe(Effect.orDie);
  }

  // 2. Explicit CLOSEDCODE_TUI_CONFIG override, if set.
  if (Flag.CLOSEDCODE_TUI_CONFIG) {
    const configFile = Flag.CLOSEDCODE_TUI_CONFIG;
    yield* Effect.promise(() => mergeFile(acc, configFile, ctx)).pipe(Effect.orDie);
    log.debug("loaded custom tui config", {
      path: configFile
    });
  }

  // 3. Project tui files, applied root-first so the closest file wins.
  for (const file of projectFiles) {
    yield* Effect.promise(() => mergeFile(acc, file, ctx)).pipe(Effect.orDie);
  }

  // 4. `.closedcode` / `.opencode` directories (and CLOSEDCODE_CONFIG_DIR) discovered while
  // walking up the tree. Also returned below so callers can install plugin
  // dependencies from each location.
  const dirs = unique(directories).filter(dir => (dir.endsWith(".closedcode") || dir.endsWith(".opencode")) || dir === Flag.CLOSEDCODE_CONFIG_DIR);
  for (const dir of dirs) {
    if (!(dir.endsWith(".closedcode") || dir.endsWith(".opencode")) && dir !== Flag.CLOSEDCODE_CONFIG_DIR) continue;
    for (const file of ConfigPaths.fileInDirectory(dir, "tui")) {
      yield* Effect.promise(() => mergeFile(acc, file, ctx)).pipe(Effect.orDie);
    }
  }
  const keybinds = {
    ...(acc.result.keybinds ?? {})
  };
  if (process.platform === "win32") {
    // Native Windows terminals do not support POSIX suspend, so prefer prompt undo.
    keybinds.terminal_suspend = "none";
    keybinds.input_undo ??= unique(["ctrl+z", ...ConfigKeybinds.Keybinds.shape.input_undo.parse(undefined).split(",")]).join(",");
  }
  acc.result.keybinds = ConfigKeybinds.Keybinds.parse(keybinds);
  return {
    config: acc.result,
    dirs: acc.result.plugin?.length ? dirs : []
  };
});
/**
 * Effect Layer that builds the TuiConfig Service: loads config for the current working directory and
 * kicks off (forked) installation of plugin dependencies in each discovered config dir.
 * @type {Object}
 */
export const layer = Layer.effect(Service, Effect.gen(function* () {
  const directory = yield* CurrentWorkingDirectory;
  const npm = yield* Npm.Service;
  const data = yield* loadState({
    directory
  });
  const deps = yield* Effect.forEach(data.dirs, dir => npm.install(dir, {
    add: [{
      name: "plugin",
      version: InstallationLocal ? undefined : InstallationVersion
    }]
  }).pipe(Effect.forkScoped), {
    concurrency: "unbounded"
  });
  // Returns the already-loaded merged config.
  const get = Effect.fn("TuiConfig.get")(() => Effect.succeed(data.config));
  // Joins the forked plugin-dependency install fibers, ignoring failures.
  const waitForDependencies = Effect.fn("TuiConfig.waitForDependencies")(() => Effect.forEach(deps, Fiber.join, {
    concurrency: "unbounded"
  }).pipe(Effect.ignore(), Effect.asVoid));
  return Service.of({
    get,
    waitForDependencies
  });
}).pipe(Effect.withSpan("TuiConfig.layer")));
/**
 * The TuiConfig layer wired with its default Npm and filesystem dependencies.
 * @type {Object}
 */
export const defaultLayer = layer.pipe(Layer.provide(Npm.defaultLayer), Layer.provide(AppFileSystem.defaultLayer));
const {
  runPromise
} = makeRuntime(Service, defaultLayer);
/**
 * Waits for all plugin-dependency installs triggered during config load to finish.
 * @returns {Promise<void>}
 */
export async function waitForDependencies() {
  await runPromise(svc => svc.waitForDependencies());
}
/**
 * Loads and returns the merged TUI config for the current working directory.
 * @returns {Promise<Object>} The merged config object.
 */
export async function get() {
  return runPromise(svc => svc.get());
}
/**
 * Reads and parses a single TUI config file, returning an empty object on missing file or parse failure.
 * @param {string} filepath - Path to the config file.
 * @returns {Promise<Object>} The parsed config object, or {} on error.
 */
async function loadFile(filepath) {
  const text = await ConfigPaths.readFile(filepath);
  if (!text) return {};
  return load(text, filepath).catch(error => {
    log.warn("failed to load tui config", {
      path: filepath,
      error
    });
    return {};
  });
}
/**
 * Substitutes config variables, parses the JSONC, normalizes the nested `tui` shape, validates against the schema,
 * and resolves plugin specs; returns {} on any failure.
 * @param {string} text - The raw config file contents.
 * @param {string} configFilepath - Path of the config file (used for variable expansion and plugin resolution).
 * @returns {Promise<Object>} The validated, plugin-resolved config object, or {} on error.
 */
async function load(text, configFilepath) {
  return ConfigVariable.substitute({
    text,
    type: "path",
    path: configFilepath,
    missing: "empty"
  }).then(expanded => ConfigParse.jsonc(expanded, configFilepath)).then(data => {
    if (!isRecord(data)) return {};

    // Flatten a nested "tui" key so users who wrote `{ "tui": { ... } }` inside tui.json
    // (mirroring the old opencode.json shape) still get their settings applied.
    return ConfigParse.schema(Info, normalize(data), configFilepath);
  }).then(data => resolvePlugins(data, configFilepath)).catch(error => {
    log.warn("invalid tui config", {
      path: configFilepath,
      error
    });
    return {};
  });
}