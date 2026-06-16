/**
 * @file Plugin config schemas and helpers: discovers local plugin files in a
 * directory, reads a plugin spec's identifier and options, resolves path-like
 * specs relative to the declaring config file, and deduplicates plugins by load
 * identity.
 * @module closedcode/config/plugin
 */

import { Glob } from "core/util/glob";
import { Schema } from "effect";
import { pathToFileURL } from "url";
import { isPathPluginSpec, parsePluginSpecifier, resolvePathPluginTarget } from "#plugin/shared.js";
import { zod } from "#util/effect-zod.js";
import { withStatics } from "#util/schema.js";
import path from "path";

/** Schema for arbitrary inline plugin options (a string-keyed record of unknown values). */
export const Options = Schema.Record(Schema.String, Schema.Unknown).pipe(withStatics(s => ({
  zod: zod(s)
})));
// Spec is the user-config value: either just a plugin identifier, or the identifier plus inline options.
// It answers "what should we load?" but says nothing about where that value came from.
/** Schema for a plugin spec: a plain identifier string, or a `[identifier, options]` tuple. */
export const Spec = Schema.Union([Schema.String, Schema.mutable(Schema.Tuple([Schema.String, Options]))]).pipe(withStatics(s => ({
  zod: zod(s)
})));

// Origin keeps the original config provenance attached to a spec.
// After multiple config files are merged, callers still need to know which file declared the plugin
// and whether it should behave like a global or project-local plugin.

/**
 * Discover local plugin files under `plugin/` or `plugins/` in a directory.
 * @param {string} dir - The directory to scan (its `plugin`/`plugins` subdirs).
 * @returns {Promise<string[]>} File URLs (`file://`) of the discovered `.js`/`.mjs` plugins.
 */
export async function load(dir) {
  const plugins = [];
  for (const item of await Glob.scan("{plugin,plugins}/*.{js,mjs}", {
    cwd: dir,
    absolute: true,
    dot: true,
    symlink: true
  })) {
    plugins.push(pathToFileURL(item).href);
  }
  return plugins;
}
/**
 * Extract the identifier portion of a plugin spec.
 * @param {string|Array} plugin - A plugin spec string or `[identifier, options]` tuple.
 * @returns {string} The plugin identifier.
 */
export function pluginSpecifier(plugin) {
  return Array.isArray(plugin) ? plugin[0] : plugin;
}

/**
 * Extract the inline options of a plugin spec, if any.
 * @param {string|Array} plugin - A plugin spec string or `[identifier, options]` tuple.
 * @returns {Object|undefined} The options object, or undefined when the spec is a bare identifier.
 */
export function pluginOptions(plugin) {
  return Array.isArray(plugin) ? plugin[1] : undefined;
}

// Path-like specs are resolved relative to the config file that declared them so merges later on do not
// accidentally reinterpret `./plugin.mjs` relative to some other directory.
/**
 * Resolve a path-like plugin spec into an absolute `file://` URL (or its package
 * entry), anchored to the config file that declared it. Non-path specs (e.g. npm
 * package names) are returned unchanged.
 * @param {string|Array} plugin - A plugin spec string or `[identifier, options]` tuple.
 * @param {string} configFilepath - Path to the config file that declared the plugin.
 * @returns {Promise<string|Array>} The resolved spec, preserving the tuple shape when options were present.
 */
export async function resolvePluginSpec(plugin, configFilepath) {
  const spec = pluginSpecifier(plugin);
  if (!isPathPluginSpec(spec)) return plugin;
  const base = path.dirname(configFilepath);
  const file = (() => {
    if (spec.startsWith("file://")) return spec;
    if (path.isAbsolute(spec) || /^[A-Za-z]:[\\/]/.test(spec)) return pathToFileURL(spec).href;
    return pathToFileURL(path.resolve(base, spec)).href;
  })();
  const resolved = await resolvePathPluginTarget(file).catch(() => file);
  if (Array.isArray(plugin)) return [resolved, plugin[1]];
  return resolved;
}

// Dedupe on the load identity (package name for npm specs, exact file URL for local specs), but keep the
// full Origin so downstream code still knows which config file won and where follow-up writes should go.
/**
 * Deduplicate plugins by load identity, keeping the last-declared occurrence of
 * each (package name for npm specs, exact file URL for local specs) while
 * preserving the original ordering and each entry's full provenance.
 * @param {Array} plugins - Plugin origin entries, each with a `spec` field.
 * @returns {Array} The deduplicated plugin entries in their original order.
 */
export function deduplicatePluginOrigins(plugins) {
  const seen = new Set();
  const list = [];
  for (const plugin of plugins.toReversed()) {
    const spec = pluginSpecifier(plugin.spec);
    const name = spec.startsWith("file://") ? spec : parsePluginSpecifier(spec).pkg;
    if (seen.has(name)) continue;
    seen.add(name);
    list.push(plugin);
  }
  return list.toReversed();
}
export * as ConfigPlugin from "./plugin.js";
