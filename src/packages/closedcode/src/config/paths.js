/**
 * @file Config file discovery. Resolves where config files live for a project,
 * walking up from the working directory to the worktree root plus the global config
 * directory, and reads individual config files tolerantly.
 * @module closedcode/config/paths
 */

export * as ConfigPaths from "./paths.js";
import path from "path";
import { Filesystem } from "#util/filesystem.js";
import { Flag } from "core/flag/flag";
import { Global } from "core/global";
import { unique } from "remeda";
import { JsonError } from "./error.js";
import * as Effect from "effect/Effect";
import { AppFileSystem } from "core/filesystem";
export const files = Effect.fn("ConfigPaths.projectFiles")(function* (name, directory, worktree) {
  const afs = yield* AppFileSystem.Service;
  return (yield* afs.up({
    targets: [`${name}.jsonc`, `${name}.json`],
    start: directory,
    stop: worktree
  })).toReversed();
});
export const directories = Effect.fn("ConfigPaths.directories")(function* (directory, worktree) {
  const afs = yield* AppFileSystem.Service;
  return unique([Global.Path.config, ...(!Flag.CLOSEDCODE_DISABLE_PROJECT_CONFIG ? yield* afs.up({
    targets: [".closedcode"],
    start: directory,
    stop: worktree
  }) : []), ...(yield* afs.up({
    targets: [".closedcode"],
    start: Global.Path.home,
    stop: Global.Path.home
  })), ...(Flag.CLOSEDCODE_CONFIG_DIR ? [Flag.CLOSEDCODE_CONFIG_DIR] : [])]);
});
/**
 * Build the candidate `.json` and `.jsonc` paths for a config file in a directory.
 * @param {string} dir - The directory to look in.
 * @param {string} name - The config file base name (without extension).
 * @returns {string[]} The `[<dir>/<name>.json, <dir>/<name>.jsonc]` candidate paths.
 */
export function fileInDirectory(dir, name) {
  return [path.join(dir, `${name}.json`), path.join(dir, `${name}.jsonc`)];
}

/**
 * Read a config file, returning undefined for missing files and throwing JsonError for other failures.
 * @param {string} filepath - Absolute path to the config file.
 * @returns {Promise<string|undefined>} The file contents, or undefined when the file does not exist.
 * @throws {JsonError} When the file exists but cannot be read.
 */
export async function readFile(filepath) {
  return Filesystem.readText(filepath).catch(err => {
    if (err.code === "ENOENT") return;
    throw new JsonError({
      path: filepath
    }, {
      cause: err
    });
  });
}