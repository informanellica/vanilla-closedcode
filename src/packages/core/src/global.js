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
export class Service extends Context.Service()("@closedcode/Global") {}
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
export const layer = Layer.effect(Service, Effect.sync(() => Service.of(make())));
export const layerWith = input => Layer.effect(Service, Effect.sync(() => Service.of(make(input))));
export * as Global from "./global.js";