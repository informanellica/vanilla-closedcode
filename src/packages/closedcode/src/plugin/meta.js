/** @file PluginMeta store: tracks per-plugin load metadata (first/last load times, load count, fingerprint, change detection, and theme cache) in a JSON state file. */

import path from "path";
import { fileURLToPath } from "url";
import { Flag } from "core/flag/flag";
import { Global } from "core/global";
import { Filesystem } from "#util/filesystem.js";
import { Flock } from "core/util/flock";
import { parsePluginSpecifier, pluginSource } from "./shared.js";
/**
 * Resolve the path of the plugin metadata JSON store.
 * @returns {string} The store file path (flag override or default state path).
 */
function storePath() {
  return Flag.CLOSEDCODE_PLUGIN_META_FILE ?? path.join(Global.Path.state, "plugin-meta.json");
}
/**
 * Build the flock lock key for a metadata store file.
 * @param {string} file - The store file path.
 * @returns {string} The lock key.
 */
function lock(file) {
  return `plugin-meta:${file}`;
}
/**
 * Resolve the on-disk file path for a file-based plugin from its spec/target.
 * @param {string} spec - The plugin specifier.
 * @param {string} target - The resolved plugin target.
 * @returns {string} The filesystem path, or undefined when neither is a file URL.
 */
function fileTarget(spec, target) {
  if (spec.startsWith("file://")) return fileURLToPath(spec);
  if (target.startsWith("file://")) return fileURLToPath(target);
  return;
}
/**
 * Get a file's modification time in whole milliseconds.
 * @param {string} file - The file path to stat.
 * @returns {Promise<number>} The floored mtime in ms, or undefined if the file is missing.
 */
async function modifiedAt(file) {
  const stat = await Filesystem.statAsync(file);
  if (!stat) return;
  const mtime = stat.mtimeMs;
  return Math.floor(typeof mtime === "bigint" ? Number(mtime) : mtime);
}
/**
 * Convert a target to a filesystem path, decoding file URLs.
 * @param {string} target - The plugin target (path or file URL).
 * @returns {string} The filesystem path.
 */
function resolvedTarget(target) {
  if (target.startsWith("file://")) return fileURLToPath(target);
  return target;
}
/**
 * Read the installed version of an npm plugin from its package.json.
 * @param {string} target - The plugin target (directory or file within it).
 * @returns {Promise<string>} The package version, or undefined if unreadable.
 */
async function npmVersion(target) {
  const resolved = resolvedTarget(target);
  const stat = await Filesystem.statAsync(resolved);
  const dir = stat?.isDirectory() ? resolved : path.dirname(resolved);
  return Filesystem.readJson(path.join(dir, "package.json")).then(item => item.version).catch(() => undefined);
}
/**
 * Build the core metadata fields for a plugin entry.
 *
 * File plugins capture the target's modified time; npm plugins capture the
 * requested and installed versions.
 * @param {Object} item - {id, spec, target} describing the plugin.
 * @returns {Promise<Object>} The core metadata object for the entry.
 */
async function entryCore(item) {
  const spec = item.spec;
  const target = item.target;
  const source = pluginSource(spec);
  if (source === "file") {
    const file = fileTarget(spec, target);
    return {
      id: item.id,
      source,
      spec,
      target,
      modified: file ? await modifiedAt(file) : undefined
    };
  }
  return {
    id: item.id,
    source,
    spec,
    target,
    requested: parsePluginSpecifier(spec).version,
    version: await npmVersion(target)
  };
}
/**
 * Compute a change-detection fingerprint from core metadata.
 * @param {Object} value - The core metadata object.
 * @returns {string} A pipe-joined fingerprint string.
 */
function fingerprint(value) {
  if (value.source === "file") return [value.target, value.modified ?? ""].join("|");
  return [value.target, value.requested ?? "", value.version ?? ""].join("|");
}
/**
 * Read the metadata store JSON, defaulting to an empty object on error.
 * @param {string} file - The store file path.
 * @returns {Promise<Object>} The parsed store contents.
 */
async function read(file) {
  return Filesystem.readJson(file).catch(() => ({}));
}
/**
 * Build a store row (item plus computed core metadata) for a plugin.
 * @param {Object} item - {id, spec, target} describing the plugin.
 * @returns {Promise<Object>} The item augmented with a `core` metadata field.
 */
async function row(item) {
  return {
    ...item,
    core: await entryCore(item)
  };
}
/**
 * Compute the next stored entry and load state from previous metadata.
 *
 * Increments the load count, refreshes timestamps, recomputes the fingerprint,
 * and classifies the load as "first", "same", or "updated".
 * @param {Object} prev - The previous stored entry, or undefined.
 * @param {Object} core - The freshly computed core metadata.
 * @param {number} now - The current timestamp in ms.
 * @returns {Object} {state, entry} where state is "first"|"same"|"updated".
 */
function next(prev, core, now) {
  const entry = {
    ...core,
    first_time: prev?.first_time ?? now,
    last_time: now,
    time_changed: prev?.time_changed ?? now,
    load_count: (prev?.load_count ?? 0) + 1,
    fingerprint: fingerprint(core),
    themes: prev?.themes
  };
  const state = !prev ? "first" : prev.fingerprint === entry.fingerprint ? "same" : "updated";
  if (state === "updated") entry.time_changed = now;
  return {
    state,
    entry
  };
}
/**
 * Record a load event for many plugins at once, updating the store.
 *
 * Acquires the store lock, computes the next entry for each plugin, persists
 * the updated store, and returns the per-plugin {state, entry} results.
 * @param {Array} items - Plugin descriptors, each {id, spec, target}.
 * @returns {Promise<Array>} The per-plugin {state, entry} results.
 */
export async function touchMany(items) {
  if (!items.length) return [];
  const file = storePath();
  const rows = await Promise.all(items.map(item => row(item)));
  return Flock.withLock(lock(file), async () => {
    const store = await read(file);
    const now = Date.now();
    const out = [];
    for (const item of rows) {
      const hit = next(store[item.id], item.core, now);
      store[item.id] = hit.entry;
      out.push(hit);
    }
    await Filesystem.writeJson(file, store);
    return out;
  });
}
/**
 * Record a load event for a single plugin.
 * @param {string} spec - The plugin specifier.
 * @param {string} target - The resolved plugin target.
 * @param {string} id - The plugin id (store key).
 * @returns {Promise<Object>} The {state, entry} result for the plugin.
 */
export async function touch(spec, target, id) {
  return touchMany([{
    spec,
    target,
    id
  }]).then(item => {
    const hit = item[0];
    if (hit) return hit;
    throw new Error("Failed to touch plugin metadata.");
  });
}
/**
 * Cache a resolved theme under a plugin's metadata entry.
 *
 * No-op if the plugin id has no existing entry.
 * @param {string} id - The plugin id (store key).
 * @param {string} name - The theme name.
 * @param {*} theme - The theme value to cache.
 * @returns {Promise<void>} Resolves once the store has been updated.
 */
export async function setTheme(id, name, theme) {
  const file = storePath();
  await Flock.withLock(lock(file), async () => {
    const store = await read(file);
    const entry = store[id];
    if (!entry) return;
    entry.themes = {
      ...entry.themes,
      [name]: theme
    };
    await Filesystem.writeJson(file, store);
  });
}
/**
 * Read the entire plugin metadata store.
 * @returns {Promise<Object>} The store contents keyed by plugin id.
 */
export async function list() {
  const file = storePath();
  return Flock.withLock(lock(file), async () => read(file));
}
export * as PluginMeta from "./meta.js";