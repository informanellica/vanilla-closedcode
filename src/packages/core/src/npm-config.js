/** @file Loads npm's effective configuration (via @npmcli/config) for a directory and derives the package registry URL, wrapped as Effects. */
export * as NpmConfig from "./npm-config.js";
import { fileURLToPath } from "url";
// npm does not publish types for this internal config API.
import Config from "@npmcli/config";
// npm does not publish types for this internal config API.
import definitionsIndex from "@npmcli/config/lib/definitions/index.js";
import { Effect } from "effect";
const npmPath = fileURLToPath(new URL("..", import.meta.url));
const { definitions, flatten, nerfDarts, shorthands } = definitionsIndex;
/**
 * Loads npm's flattened, effective configuration for the given directory.
 * @param {string} dir - Working directory whose npm config (including .npmrc resolution) should be loaded.
 * @returns {Effect} An Effect yielding the flattened npm config object, or an empty object on failure.
 */
export const load = dir => Effect.tryPromise({
  try: async () => {
    const config = new Config({
      npmPath,
      cwd: dir,
      env: {
        ...process.env
      },
      argv: [process.execPath, process.execPath],
      execPath: process.execPath,
      platform: process.platform,
      definitions,
      flatten,
      nerfDarts,
      shorthands,
      warn: false
    });
    await config.load();
    return config.flat;
  },
  catch: cause => cause
}).pipe(Effect.orElseSucceed(() => ({})));
/**
 * Resolves the effective npm registry URL for the given directory, with a trailing slash removed.
 * @param {string} dir - Working directory whose npm config determines the registry.
 * @returns {Effect} An Effect yielding the registry URL string (defaults to https://registry.npmjs.org).
 */
export const registry = dir => load(dir).pipe(Effect.map(config => {
  const registry = typeof config.registry === "string" ? config.registry : "https://registry.npmjs.org";
  return registry.endsWith("/") ? registry.slice(0, -1) : registry;
}));
