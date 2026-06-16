/** @file Installs plugins by resolving their npm/file target, reading the package manifest for entrypoints, and patching the plugin list into the .closedcode config files. */

import path from "path";
import { applyEdits, modify, parse as parseJsonc, printParseErrorCode } from "jsonc-parser";
import * as ConfigPaths from "#config/paths.js";
import { Global } from "core/global";
import { Filesystem } from "#util/filesystem.js";
import { Flock } from "core/util/flock";
import { isRecord } from "#util/record.js";
import { parsePluginSpecifier, readPackageThemes, readPluginPackage, resolvePluginTarget } from "./shared.js";
/** Default injectable dependencies for installPlugin (target resolution). */
const defaultInstallDeps = {
  resolve: spec => resolvePluginTarget(spec)
};
/** Default injectable dependencies for config patching (filesystem + path helpers). */
const defaultPatchDeps = {
  readText: file => Filesystem.readText(file),
  write: async (file, text) => {
    await Filesystem.write(file, text);
  },
  exists: file => Filesystem.exists(file),
  files: (dir, name) => ConfigPaths.fileInDirectory(dir, name)
};
/**
 * Extract the specifier string from a plugin config list entry.
 *
 * Entries may be a bare specifier string or a `[spec, options]` tuple.
 * @param {*} item - A plugin list entry.
 * @returns {string} The specifier string, or undefined if not extractable.
 */
function pluginSpec(item) {
  if (typeof item === "string") return item;
  if (!Array.isArray(item)) return;
  if (typeof item[0] !== "string") return;
  return item[0];
}
/**
 * Read the `plugin` array out of a parsed config object.
 * @param {*} data - The parsed config data.
 * @returns {Array} The plugin array, or undefined if absent/invalid.
 */
function pluginList(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return;
  const item = data;
  if (!Array.isArray(item.plugin)) return;
  return item.plugin;
}
/**
 * Resolve an exports-map entry to its entrypoint string.
 *
 * Accepts a plain string or an object with `import`/`default` keys; trims and
 * ignores empty values.
 * @param {*} value - An exports-map value.
 * @returns {string} The entrypoint string, or undefined if none.
 */
function exportValue(value) {
  if (typeof value === "string") {
    const next = value.trim();
    if (next) return next;
    return;
  }
  if (!isRecord(value)) return;
  for (const key of ["import", "default"]) {
    const next = value[key];
    if (typeof next !== "string") continue;
    const hit = next.trim();
    if (!hit) continue;
    return hit;
  }
}
/**
 * Read the optional `config` options object from an exports-map entry.
 * @param {*} value - An exports-map value.
 * @returns {Object} The config options record, or undefined if absent.
 */
function exportOptions(value) {
  if (!isRecord(value)) return;
  const config = value.config;
  if (!isRecord(config)) return;
  return config;
}
/**
 * Resolve a package's export target for a given entrypoint kind.
 * @param {Object} pkg - The parsed package.json object.
 * @param {string} kind - The entrypoint kind, e.g. "server" or "tui".
 * @returns {Object} An object with `opts`, or undefined if the export is absent.
 */
function exportTarget(pkg, kind) {
  const exports = pkg.exports;
  if (!isRecord(exports)) return;
  const value = exports[`./${kind}`];
  const entry = exportValue(value);
  if (!entry) return;
  return {
    opts: exportOptions(value)
  };
}
/**
 * Whether a package.json declares a non-empty `main` entry.
 * @param {Object} pkg - The parsed package.json object.
 * @returns {boolean} True if a usable `main` field is present.
 */
function hasMainTarget(pkg) {
  const main = pkg.main;
  if (typeof main !== "string") return false;
  return Boolean(main.trim());
}
/**
 * Determine which plugin targets (server/tui) a package exposes.
 *
 * A server target is derived from the `./server` export or a `main` fallback;
 * a tui target from the `./tui` export or the presence of declared themes.
 * @param {Object} pkg - The plugin package descriptor with `json` and `dir`.
 * @returns {Array} A list of {kind, opts} target descriptors.
 */
function packageTargets(pkg) {
  const spec = typeof pkg.json.name === "string" && pkg.json.name.trim().length > 0 ? pkg.json.name.trim() : path.basename(pkg.dir);
  const targets = [];
  const server = exportTarget(pkg.json, "server");
  if (server) {
    targets.push({
      kind: "server",
      opts: server.opts
    });
  } else if (hasMainTarget(pkg.json)) {
    targets.push({
      kind: "server"
    });
  }
  const tui = exportTarget(pkg.json, "tui");
  if (tui) {
    targets.push({
      kind: "tui",
      opts: tui.opts
    });
  }
  if (!targets.some(item => item.kind === "tui") && readPackageThemes(spec, pkg).length) {
    targets.push({
      kind: "tui"
    });
  }
  return targets;
}
/**
 * Apply a single JSONC edit at a path while preserving formatting/comments.
 * @param {string} text - The current JSONC document text.
 * @param {Array} path - The JSON path (keys/indices) to modify.
 * @param {*} value - The new value, or undefined to delete.
 * @param {boolean} insert - When true, insert into an array rather than replace.
 * @returns {string} The updated document text.
 */
function patch(text, path, value, insert = false) {
  return applyEdits(text, modify(text, path, value, {
    formattingOptions: {
      tabSize: 2,
      insertSpaces: true
    },
    isArrayInsertion: insert
  }));
}
/**
 * Compute the edited config text for adding/replacing a plugin in the list.
 *
 * Detects duplicates of the same package. With no duplicates it appends (or
 * creates) the entry; with duplicates and `force` it normalizes the kept entry
 * to the new spec and removes the rest; otherwise it is a no-op.
 * @param {string} text - The current JSONC config text.
 * @param {Array} list - The existing plugin list, or undefined.
 * @param {string} spec - The plugin specifier being installed.
 * @param {*} next - The new list entry (spec string or [spec, opts] tuple).
 * @param {boolean} force - Whether to overwrite an existing duplicate.
 * @returns {Object} {mode: "add"|"replace"|"noop", text} describing the result.
 */
function patchPluginList(text, list, spec, next, force = false) {
  const pkg = parsePluginSpecifier(spec).pkg;
  const rows = (list ?? []).map((item, i) => ({
    item,
    i,
    spec: pluginSpec(item)
  }));
  const dup = rows.filter(item => {
    if (!item.spec) return false;
    if (item.spec === spec) return true;
    if (item.spec.startsWith("file://")) return false;
    return parsePluginSpecifier(item.spec).pkg === pkg;
  });
  if (!dup.length) {
    if (!list) {
      return {
        mode: "add",
        text: patch(text, ["plugin"], [next])
      };
    }
    return {
      mode: "add",
      text: patch(text, ["plugin", list.length], next, true)
    };
  }
  if (!force) {
    return {
      mode: "noop",
      text
    };
  }
  const keep = dup[0];
  if (!keep) {
    return {
      mode: "noop",
      text
    };
  }
  if (dup.length === 1 && keep.spec === spec) {
    return {
      mode: "noop",
      text
    };
  }
  let out = text;
  if (typeof keep.item === "string") {
    out = patch(out, ["plugin", keep.i], next);
  }
  if (Array.isArray(keep.item) && typeof keep.item[0] === "string") {
    out = patch(out, ["plugin", keep.i, 0], spec);
  }
  const del = dup.map(item => item.i).filter(i => i !== keep.i).sort((a, b) => b - a);
  for (const i of del) {
    out = patch(out, ["plugin", i], undefined);
  }
  return {
    mode: "replace",
    text: out
  };
}
/**
 * Resolve and install a plugin's target location.
 * @param {string} spec - The plugin specifier (npm name or file path/URL).
 * @param {Object} dep - Injectable dependencies; defaults to defaultInstallDeps.
 * @returns {Promise<Object>} A result {ok, target} on success or {ok: false, code, error} on failure.
 */
export async function installPlugin(spec, dep = defaultInstallDeps) {
  const target = await dep.resolve(spec).then(item => ({
    ok: true,
    item
  }), error => ({
    ok: false,
    error
  }));
  if (!target.ok) {
    return {
      ok: false,
      code: "install_failed",
      error: target.error
    };
  }
  return {
    ok: true,
    target: target.item
  };
}
/**
 * Read a resolved plugin's package manifest and derive its targets.
 * @param {string} target - The resolved plugin target location.
 * @returns {Promise<Object>} {ok, targets} on success, or {ok: false, code, ...} describing why it failed (read error / no targets).
 */
export async function readPluginManifest(target) {
  const pkg = await readPluginPackage(target).then(item => ({
    ok: true,
    item
  }), error => ({
    ok: false,
    error
  }));
  if (!pkg.ok) {
    return {
      ok: false,
      code: "manifest_read_failed",
      file: target,
      error: pkg.error
    };
  }
  const targets = await Promise.resolve().then(() => packageTargets(pkg.item)).then(item => ({
    ok: true,
    item
  }), error => ({
    ok: false,
    error
  }));
  if (!targets.ok) {
    return {
      ok: false,
      code: "manifest_read_failed",
      file: pkg.item.pkg,
      error: targets.error
    };
  }
  if (!targets.item.length) {
    return {
      ok: false,
      code: "manifest_no_targets",
      file: pkg.item.pkg
    };
  }
  return {
    ok: true,
    targets: targets.item
  };
}
/**
 * Determine the .closedcode config directory to patch for an install request.
 *
 * Returns the global config dir when `global` is set; otherwise the git
 * worktree root (when applicable) or the working directory, joined with
 * ".closedcode".
 * @param {Object} input - The install input (global, config, vcs, worktree, directory).
 * @returns {string} The directory whose config file should be patched.
 */
function patchDir(input) {
  if (input.global) return input.config ?? Global.Path.config;
  const git = input.vcs === "git" && input.worktree !== "/";
  const root = git ? input.worktree : input.directory;
  return path.join(root, ".closedcode");
}
/**
 * Map a target kind to its config file base name.
 * @param {string} kind - The target kind ("server" or "tui").
 * @returns {string} The config base name ("closedcode" for server, otherwise "tui").
 */
function patchName(kind) {
  if (kind === "server") return "closedcode";
  return "tui";
}
/**
 * Patch a single target's plugin list into the appropriate config file.
 *
 * Locks the config file, locates the existing variant (or starts from "{}"),
 * parses it as JSONC, computes the edit, and writes it back when changed.
 * @param {string} dir - The config directory to patch within.
 * @param {Object} target - The {kind, opts} target descriptor.
 * @param {string} spec - The plugin specifier being installed.
 * @param {boolean} force - Whether to overwrite an existing duplicate.
 * @param {Object} dep - Injectable filesystem/path dependencies.
 * @returns {Promise<Object>} {ok, item} on success, or {ok: false, code, ...} on parse/IO failure.
 */
async function patchOne(dir, target, spec, force, dep) {
  const name = patchName(target.kind);
  await using _ = await Flock.acquire(`plug-config:${Filesystem.resolve(path.join(dir, name))}`);
  const files = dep.files(dir, name);
  let cfg = files[0];
  for (const file of files) {
    if (!(await dep.exists(file))) continue;
    cfg = file;
    break;
  }
  const src = await dep.readText(cfg).catch(err => {
    if (err.code === "ENOENT") return "{}";
    return err;
  });
  if (src instanceof Error) {
    return {
      ok: false,
      code: "patch_failed",
      kind: target.kind,
      error: src
    };
  }
  const text = src.trim() ? src : "{}";
  const errs = [];
  const data = parseJsonc(text, errs, {
    allowTrailingComma: true
  });
  if (errs.length) {
    const err = errs[0];
    const lines = text.substring(0, err.offset).split("\n");
    return {
      ok: false,
      code: "invalid_json",
      kind: target.kind,
      file: cfg,
      line: lines.length,
      col: lines[lines.length - 1].length + 1,
      parse: printParseErrorCode(err.error)
    };
  }
  const list = pluginList(data);
  const item = target.opts ? [spec, target.opts] : spec;
  const out = patchPluginList(text, list, spec, item, force);
  if (out.mode === "noop") {
    return {
      ok: true,
      item: {
        kind: target.kind,
        mode: out.mode,
        file: cfg
      }
    };
  }
  const write = await dep.write(cfg, out.text).catch(error => error);
  if (write instanceof Error) {
    return {
      ok: false,
      code: "patch_failed",
      kind: target.kind,
      error: write
    };
  }
  return {
    ok: true,
    item: {
      kind: target.kind,
      mode: out.mode,
      file: cfg
    }
  };
}
/**
 * Patch the plugin spec into the config file(s) for every requested target.
 * @param {Object} input - {spec, targets, force, ...location fields for patchDir}.
 * @param {Object} dep - Injectable filesystem/path dependencies; defaults to defaultPatchDeps.
 * @returns {Promise<Object>} {ok, dir, items} on success, or the first failing {ok: false, ..., dir} result.
 */
export async function patchPluginConfig(input, dep = defaultPatchDeps) {
  const dir = patchDir(input);
  const items = [];
  for (const target of input.targets) {
    const hit = await patchOne(dir, target, input.spec, Boolean(input.force), dep);
    if (!hit.ok) {
      return {
        ...hit,
        dir
      };
    }
    items.push(hit.item);
  }
  return {
    ok: true,
    dir,
    items
  };
}