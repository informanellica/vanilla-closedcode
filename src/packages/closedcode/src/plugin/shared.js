/** @file Shared plugin helpers: parse plugin specifiers, classify file vs npm sources, install/resolve targets, locate server/tui/theme entrypoints, check version compatibility, and validate V1 plugin exports. */

import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import npa from "npm-package-arg";
import semver from "semver";
import { Filesystem } from "#util/filesystem.js";
import { isRecord } from "#util/record.js";
import { Npm } from "core/npm";
/** Package names that were once plugins but are now built in and should be ignored. */
export const DEPRECATED_PLUGIN_PACKAGES = ["opencode-openai-codex-auth", "opencode-copilot-auth"];
/**
 * Whether a specifier refers to a deprecated, now built-in plugin package.
 * @param {string} spec - The plugin specifier.
 * @returns {boolean} True if the spec matches a deprecated package name.
 */
export function isDeprecatedPlugin(spec) {
  return DEPRECATED_PLUGIN_PACKAGES.some(pkg => spec.includes(pkg));
}
/**
 * Parse a specifier with npm-package-arg, swallowing parse errors.
 * @param {string} spec - The plugin specifier.
 * @returns {Object} The npm-package-arg result, or undefined on failure.
 */
function parse(spec) {
  try {
    return npa(spec);
  } catch {}
}
/**
 * Parse a plugin specifier into its package name and version.
 *
 * Handles aliases and bare names (defaulting to "latest"), falling back to the
 * raw spec as the package name with an empty version when unparseable.
 * @param {string} spec - The plugin specifier.
 * @returns {Object} An object {pkg, version}.
 */
export function parsePluginSpecifier(spec) {
  const hit = parse(spec);
  if (hit?.type === "alias" && !hit.name) {
    const sub = hit.subSpec;
    if (sub?.name) {
      const version = !sub.rawSpec || sub.rawSpec === "*" ? "latest" : sub.rawSpec;
      return {
        pkg: sub.name,
        version
      };
    }
  }
  if (!hit?.name) return {
    pkg: spec,
    version: ""
  };
  if (hit.raw === hit.name) return {
    pkg: hit.name,
    version: "latest"
  };
  return {
    pkg: hit.name,
    version: hit.rawSpec
  };
}
/** Candidate index filenames tried when resolving a directory entrypoint. */
const INDEX_FILES = ["index.js", "index.mjs", "index.cjs"];
/**
 * Classify a plugin specifier as a local file plugin or an npm plugin.
 * @param {string} spec - The plugin specifier.
 * @returns {string} "file" for path/file-URL specs, otherwise "npm".
 */
export function pluginSource(spec) {
  if (isPathPluginSpec(spec)) return "file";
  return "npm";
}
/**
 * Resolve a raw export path against a package directory into an absolute path.
 * @param {string} raw - The raw export path (relative, absolute, or file URL).
 * @param {string} dir - The package directory to resolve relative paths against.
 * @returns {string} The resolved absolute filesystem path.
 */
function resolveExportPath(raw, dir) {
  if (raw.startsWith("file://")) return fileURLToPath(raw);
  if (path.isAbsolute(raw)) return raw;
  return path.resolve(dir, raw);
}
/**
 * Whether a raw path is absolute, including Windows drive-letter paths.
 * @param {string} raw - The path to test.
 * @returns {boolean} True if the path is absolute.
 */
function isAbsolutePath(raw) {
  return path.isAbsolute(raw) || /^[A-Za-z]:[\\/]/.test(raw);
}
/**
 * Extract an entrypoint string from an exports-map value.
 *
 * Accepts a string or an object with `import`/`default` keys.
 * @param {*} value - An exports-map value.
 * @returns {string} The entrypoint string, or undefined if none.
 */
function extractExportValue(value) {
  if (typeof value === "string") return value;
  if (!isRecord(value)) return undefined;
  for (const key of ["import", "default"]) {
    const nested = value[key];
    if (typeof nested === "string") return nested;
  }
  return undefined;
}
/**
 * Read a non-empty `main` field from a package descriptor.
 * @param {Object} pkg - The plugin package descriptor (has `json`).
 * @returns {string} The trimmed main path, or undefined if absent/empty.
 */
function packageMain(pkg) {
  const value = pkg.json.main;
  if (typeof value !== "string") return;
  const next = value.trim();
  if (!next) return;
  return next;
}
/**
 * Resolve a package-relative entry path and ensure it stays inside the package.
 * @param {string} spec - The plugin specifier (for error messages).
 * @param {string} raw - The raw entry path from package metadata.
 * @param {string} kind - The entry kind (for error messages).
 * @param {Object} pkg - The plugin package descriptor (has `dir`).
 * @returns {string} The resolved absolute file path.
 */
function resolvePackageFile(spec, raw, kind, pkg) {
  const resolved = resolveExportPath(raw, pkg.dir);
  const root = Filesystem.resolve(pkg.dir);
  const next = Filesystem.resolve(resolved);
  if (!Filesystem.contains(root, next)) {
    throw new Error(`Plugin ${spec} resolved ${kind} entry outside plugin directory`);
  }
  return next;
}
/**
 * Resolve a package-relative entry path into a file:// URL.
 * @param {string} spec - The plugin specifier (for error messages).
 * @param {string} raw - The raw entry path from package metadata.
 * @param {string} kind - The entry kind (for error messages).
 * @param {Object} pkg - The plugin package descriptor.
 * @returns {string} The resolved file:// URL.
 */
function resolvePackagePath(spec, raw, kind, pkg) {
  return pathToFileURL(resolvePackageFile(spec, raw, kind, pkg)).href;
}
/**
 * Resolve a package's declared entrypoint for a given kind.
 *
 * Prefers the matching `exports["./<kind>"]` entry; for the "server" kind it
 * falls back to the package `main`.
 * @param {string} spec - The plugin specifier.
 * @param {string} kind - The entry kind ("server" or "tui").
 * @param {Object} pkg - The plugin package descriptor.
 * @returns {string} The resolved entry file:// URL, or undefined if none.
 */
function resolvePackageEntrypoint(spec, kind, pkg) {
  const exports = pkg.json.exports;
  if (isRecord(exports)) {
    const raw = extractExportValue(exports[`./${kind}`]);
    if (raw) return resolvePackagePath(spec, raw, kind, pkg);
  }
  if (kind !== "server") return;
  const main = packageMain(pkg);
  if (!main) return;
  return resolvePackagePath(spec, main, kind, pkg);
}
/**
 * Convert a target to a local filesystem path when it is file-based/absolute.
 * @param {string} target - The plugin target.
 * @returns {string} The filesystem path, or undefined for non-local targets.
 */
function targetPath(target) {
  if (target.startsWith("file://")) return fileURLToPath(target);
  if (path.isAbsolute(target)) return target;
}
/**
 * Find the first existing index file within a directory.
 * @param {string} dir - The directory to search.
 * @returns {Promise<string>} The index file path, or undefined if none exist.
 */
async function resolveDirectoryIndex(dir) {
  for (const name of INDEX_FILES) {
    const file = path.join(dir, name);
    if (await Filesystem.exists(file)) return file;
  }
}
/**
 * Resolve a target to its directory path, when it is a local directory.
 * @param {string} target - The plugin target.
 * @returns {Promise<string>} The directory path, or undefined otherwise.
 */
async function resolveTargetDirectory(target) {
  const file = targetPath(target);
  if (!file) return;
  const stat = await Filesystem.statAsync(file);
  if (!stat?.isDirectory()) return;
  return file;
}
/**
 * Resolve the importable entrypoint for a plugin and requested kind.
 *
 * Prefers a declared package entrypoint; otherwise falls back to a directory
 * index (file plugins) or the target itself, with kind-specific rules for tui
 * vs server and npm vs file sources.
 * @param {string} spec - The plugin specifier.
 * @param {string} target - The resolved plugin target.
 * @param {string} kind - The entry kind ("server" or "tui").
 * @param {Object} pkg - The plugin package descriptor, or undefined.
 * @returns {Promise<string>} The entrypoint URL/path, or undefined when none applies.
 */
async function resolvePluginEntrypoint(spec, target, kind, pkg) {
  const source = pluginSource(spec);
  const hit = pkg ?? (source === "npm" ? await readPluginPackage(target) : await readPluginPackage(target).catch(() => undefined));
  if (!hit) return target;
  const entry = resolvePackageEntrypoint(spec, kind, hit);
  if (entry) return entry;
  const dir = await resolveTargetDirectory(target);
  if (kind === "tui") {
    if (source === "file" && dir) {
      const index = await resolveDirectoryIndex(dir);
      if (index) return pathToFileURL(index).href;
    }
    if (source === "npm") return;
    if (dir) return;
    return target;
  }
  if (dir && isRecord(hit.json.exports)) {
    if (source === "file") {
      const index = await resolveDirectoryIndex(dir);
      if (index) return pathToFileURL(index).href;
    }
    return;
  }
  return target;
}
/**
 * Whether a specifier points at a local path rather than an npm package.
 * @param {string} spec - The plugin specifier.
 * @returns {boolean} True for file URLs, relative paths, or absolute paths.
 */
export function isPathPluginSpec(spec) {
  return spec.startsWith("file://") || spec.startsWith(".") || isAbsolutePath(spec);
}
/**
 * Resolve a local-path plugin specifier into a target file:// URL.
 *
 * Returns the file URL directly for single-file plugins, or the directory URL
 * when it contains a package.json; otherwise resolves to its index file.
 * @param {string} spec - The file/path plugin specifier.
 * @returns {Promise<string>} The resolved file:// URL target.
 */
export async function resolvePathPluginTarget(spec) {
  const raw = spec.startsWith("file://") ? fileURLToPath(spec) : spec;
  const file = path.isAbsolute(raw) || /^[A-Za-z]:[\\/]/.test(raw) ? raw : path.resolve(raw);
  const stat = await Filesystem.statAsync(file);
  if (!stat?.isDirectory()) {
    if (spec.startsWith("file://")) return spec;
    return pathToFileURL(file).href;
  }
  if (await Filesystem.exists(path.join(file, "package.json"))) {
    return pathToFileURL(file).href;
  }
  const index = await resolveDirectoryIndex(file);
  if (index) return pathToFileURL(index).href;
  throw new Error(`Plugin directory ${file} is missing package.json or index file`);
}
/**
 * Verify a plugin's declared closedcode engine range against the running version.
 *
 * Skips the check for invalid or 0.x running versions and for plugins with no
 * engine constraint; otherwise throws when the version is unsatisfied. The
 * `engines.closedcode` field is preferred, falling back to `engines.opencode`.
 * @param {string} target - The resolved plugin target.
 * @param {string} closedcodeVersion - The running closedcode version.
 * @param {Object} pkg - The plugin package descriptor, or undefined to read it.
 * @returns {Promise<void>} Resolves when compatible; throws when incompatible.
 */
export async function checkPluginCompatibility(target, closedcodeVersion, pkg) {
  if (!semver.valid(closedcodeVersion) || semver.major(closedcodeVersion) === 0) return;
  const hit = pkg ?? (await readPluginPackage(target).catch(() => undefined));
  if (!hit) return;
  const engines = hit.json.engines;
  if (!isRecord(engines)) return;
  const range = typeof engines.closedcode === "string" ? engines.closedcode : engines.opencode;
  if (typeof range !== "string") return;
  if (!semver.satisfies(closedcodeVersion, range)) {
    throw new Error(`Plugin requires closedcode ${range} but running ${closedcodeVersion}`);
  }
}
/**
 * Resolve a plugin specifier to a concrete target, installing npm packages.
 *
 * Path specs resolve locally; npm specs are installed on demand (or via the
 * test override) and resolved to the installed directory.
 * @param {string} spec - The plugin specifier.
 * @returns {Promise<string>} The resolved target location.
 */
export async function resolvePluginTarget(spec) {
  if (isPathPluginSpec(spec)) return resolvePathPluginTarget(spec);
  const hit = parse(spec);
  const pkg = hit?.name && hit.raw === hit.name ? `${hit.name}@latest` : spec;
  const override = globalThis.__closedcodeTestNpmAdd;
  const result = await (typeof override === "function" ? override(pkg) : Npm.add(pkg));
  return result.directory;
}
/**
 * Read a plugin's package.json and return its directory, path, and contents.
 * @param {string} target - The resolved plugin target (file or directory).
 * @returns {Promise<Object>} An object {dir, pkg, json}.
 */
export async function readPluginPackage(target) {
  const file = target.startsWith("file://") ? fileURLToPath(target) : target;
  const stat = await Filesystem.statAsync(file);
  const dir = stat?.isDirectory() ? file : path.dirname(file);
  const pkg = path.join(dir, "package.json");
  const json = await Filesystem.readJson(pkg);
  return {
    dir,
    pkg,
    json
  };
}
/**
 * Build a resolved plugin entry descriptor for a given kind.
 *
 * Reads the package (required for npm, best-effort for file), resolves the
 * entrypoint, and bundles the spec/source/target/pkg/entry together.
 * @param {string} spec - The plugin specifier.
 * @param {string} target - The resolved plugin target.
 * @param {string} kind - The entry kind ("server" or "tui").
 * @returns {Promise<Object>} An object {spec, source, target, pkg, entry}.
 */
export async function createPluginEntry(spec, target, kind) {
  const source = pluginSource(spec);
  const pkg = source === "npm" ? await readPluginPackage(target) : await readPluginPackage(target).catch(() => undefined);
  const entry = await resolvePluginEntrypoint(spec, target, kind, pkg);
  return {
    spec,
    source,
    target,
    pkg,
    entry
  };
}
/**
 * Read and validate the `oc-themes` theme entries declared by a package.
 *
 * Each entry must be a non-empty relative path; absolute/file-URL entries and
 * malformed fields throw. Returns deduplicated absolute file paths.
 * @param {string} spec - The plugin specifier (for error messages).
 * @param {Object} pkg - The plugin package descriptor.
 * @returns {Array} Deduplicated absolute theme file paths.
 */
export function readPackageThemes(spec, pkg) {
  const field = pkg.json["oc-themes"];
  if (field === undefined) return [];
  if (!Array.isArray(field)) {
    throw new TypeError(`Plugin ${spec} has invalid oc-themes field`);
  }
  const list = field.map(item => {
    if (typeof item !== "string") {
      throw new TypeError(`Plugin ${spec} has invalid oc-themes entry`);
    }
    const raw = item.trim();
    if (!raw) {
      throw new TypeError(`Plugin ${spec} has empty oc-themes entry`);
    }
    if (raw.startsWith("file://") || isAbsolutePath(raw)) {
      throw new TypeError(`Plugin ${spec} oc-themes entry must be relative: ${item}`);
    }
    return resolvePackageFile(spec, raw, "oc-themes", pkg);
  });
  return Array.from(new Set(list));
}
/**
 * Validate and normalize a plugin-declared id.
 * @param {*} id - The id value exported by the plugin.
 * @param {string} spec - The plugin specifier (for error messages).
 * @returns {string} The trimmed id, or undefined when none was provided.
 */
export function readPluginId(id, spec) {
  if (id === undefined) return;
  if (typeof id !== "string") throw new TypeError(`Plugin ${spec} has invalid id type ${typeof id}`);
  const value = id.trim();
  if (!value) throw new TypeError(`Plugin ${spec} has an empty id`);
  return value;
}
/**
 * Validate a module's default export as a V1 plugin and return it.
 *
 * In "strict" mode a missing/invalid shape throws; in "detect" mode it returns
 * undefined instead so callers can fall back to legacy plugins. Ensures exactly
 * one of server()/tui() matching the requested kind is present.
 * @param {Object} mod - The imported plugin module.
 * @param {string} spec - The plugin specifier (for error messages).
 * @param {string} kind - The required entry kind ("server" or "tui").
 * @param {string} mode - "strict" (throw) or "detect" (return undefined on mismatch).
 * @returns {Object} The validated default-export plugin object, or undefined in detect mode.
 */
export function readV1Plugin(mod, spec, kind, mode = "strict") {
  const value = mod.default;
  if (!isRecord(value)) {
    if (mode === "detect") return;
    throw new TypeError(`Plugin ${spec} must default export an object with ${kind}()`);
  }
  if (mode === "detect" && !("id" in value) && !("server" in value) && !("tui" in value)) return;
  const server = "server" in value ? value.server : undefined;
  const tui = "tui" in value ? value.tui : undefined;
  if (server !== undefined && typeof server !== "function") {
    throw new TypeError(`Plugin ${spec} has invalid server export`);
  }
  if (tui !== undefined && typeof tui !== "function") {
    throw new TypeError(`Plugin ${spec} has invalid tui export`);
  }
  if (server !== undefined && tui !== undefined) {
    throw new TypeError(`Plugin ${spec} must default export either server() or tui(), not both`);
  }
  if (kind === "server" && server === undefined) {
    throw new TypeError(`Plugin ${spec} must default export an object with server()`);
  }
  if (kind === "tui" && tui === undefined) {
    throw new TypeError(`Plugin ${spec} must default export an object with tui()`);
  }
  return value;
}
/**
 * Determine the final id for a plugin, using the package name as a fallback.
 *
 * File plugins must export an id (throws otherwise); npm plugins fall back to
 * their package name when no id is exported.
 * @param {string} source - The plugin source ("file" or "npm").
 * @param {string} spec - The plugin specifier (for error messages).
 * @param {string} target - The resolved plugin target.
 * @param {string} id - The id exported by the plugin, if any.
 * @param {Object} pkg - The plugin package descriptor, or undefined to read it.
 * @returns {Promise<string>} The resolved plugin id.
 */
export async function resolvePluginId(source, spec, target, id, pkg) {
  if (source === "file") {
    if (id) return id;
    throw new TypeError(`Path plugin ${spec} must export id`);
  }
  if (id) return id;
  const hit = pkg ?? (await readPluginPackage(target));
  if (typeof hit.json.name !== "string" || !hit.json.name.trim()) {
    throw new TypeError(`Plugin package ${hit.pkg} is missing name`);
  }
  return hit.json.name.trim();
}
