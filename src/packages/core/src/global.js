/** @file Resolves and creates the closedcode XDG data/cache/config/state/tmp directories and exposes them as an Effect service. */
import path from "path";
import { mkdirSync } from "fs";
import { xdgData, xdgCache, xdgConfig, xdgState } from "xdg-basedir";
import os from "os";
import { Context, Effect, Layer } from "effect";
import { Flock } from "./util/flock.js";
import { Flag } from "./flag/flag.js";
const app = "closedcode";
// Always resolve to the closedcode-named dir. We never adopt a coexisting
// opencode install's data directory.
/**
 * Appends the app name to an XDG base directory.
 * @param {string} base - An XDG base directory (data, cache, config, or state).
 * @returns {string} The base directory joined with the closedcode app name.
 */
const resolveDir = base => path.join(base, app);
const data = resolveDir(xdgData);
const cache = resolveDir(xdgCache);
const config = resolveDir(xdgConfig);
const state = resolveDir(xdgState);
const tmp = path.join(os.tmpdir(), app);
const paths = {
  get home() {
    return process.env.CLOSEDCODE_TEST_HOME ?? os.homedir();
  },
  data,
  bin: path.join(cache, "bin"),
  log: path.join(data, "log"),
  cache,
  config,
  state,
  tmp
};
export const Path = paths;
Flock.setGlobal({
  state
});
for (const p of [Path.data, Path.config, Path.state, Path.tmp, Path.log, Path.bin]) {
  mkdirSync(p, {
    recursive: true
  });
}
/** Effect service tag carrying the resolved global directory paths. */
export class Service extends Context.Service()("@closedcode/Global") {}
/**
 * Builds the global directories record, honoring the CLOSEDCODE_CONFIG_DIR override and any explicit overrides.
 * @param {Object} input - Optional overrides merged over the default resolved paths.
 * @returns {Object} A record of home, data, cache, config, state, tmp, bin, and log directory paths.
 */
export function make(input = {}) {
  return {
    home: Path.home,
    data: Path.data,
    cache: Path.cache,
    config: Flag.CLOSEDCODE_CONFIG_DIR ?? Path.config,
    state: Path.state,
    tmp: Path.tmp,
    bin: Path.bin,
    log: Path.log,
    ...input
  };
}
/** Layer that provides the Global service using the default resolved paths. */
export const layer = Layer.effect(Service, Effect.sync(() => Service.of(make())));
/**
 * Builds a Global service layer whose paths are overridden by the given input.
 * @param {Object} input - Overrides merged over the default resolved paths.
 * @returns {Layer} A layer providing the Global service with the overridden paths.
 */
export const layerWith = input => Layer.effect(Service, Effect.sync(() => Service.of(make(input))));
export * as Global from "./global.js";