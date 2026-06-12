import path from "path";
import { applyEdits, modify, parse as parseJsonc, printParseErrorCode } from "jsonc-parser";
import * as ConfigPaths from "#config/paths.js";
import { Global } from "core/global";
import { Filesystem } from "#util/filesystem.js";
import { Flock } from "core/util/flock";
import { isRecord } from "#util/record.js";
import { parsePluginSpecifier, readPackageThemes, readPluginPackage, resolvePluginTarget } from "./shared.js";
const defaultInstallDeps = {
  resolve: spec => resolvePluginTarget(spec)
};
const defaultPatchDeps = {
  readText: file => Filesystem.readText(file),
  write: async (file, text) => {
    await Filesystem.write(file, text);
  },
  exists: file => Filesystem.exists(file),
  files: (dir, name) => ConfigPaths.fileInDirectory(dir, name)
};
function pluginSpec(item) {
  if (typeof item === "string") return item;
  if (!Array.isArray(item)) return;
  if (typeof item[0] !== "string") return;
  return item[0];
}
function pluginList(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return;
  const item = data;
  if (!Array.isArray(item.plugin)) return;
  return item.plugin;
}
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
function exportOptions(value) {
  if (!isRecord(value)) return;
  const config = value.config;
  if (!isRecord(config)) return;
  return config;
}
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
function hasMainTarget(pkg) {
  const main = pkg.main;
  if (typeof main !== "string") return false;
  return Boolean(main.trim());
}
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
function patch(text, path, value, insert = false) {
  return applyEdits(text, modify(text, path, value, {
    formattingOptions: {
      tabSize: 2,
      insertSpaces: true
    },
    isArrayInsertion: insert
  }));
}
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
function patchDir(input) {
  if (input.global) return input.config ?? Global.Path.config;
  const git = input.vcs === "git" && input.worktree !== "/";
  const root = git ? input.worktree : input.directory;
  return path.join(root, ".closedcode");
}
function patchName(kind) {
  if (kind === "server") return "closedcode";
  return "tui";
}
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