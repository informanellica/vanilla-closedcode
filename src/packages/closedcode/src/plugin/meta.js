import path from "path";
import { fileURLToPath } from "url";
import { Flag } from "core/flag/flag";
import { Global } from "core/global";
import { Filesystem } from "@/util/filesystem.js";
import { Flock } from "core/util/flock";
import { parsePluginSpecifier, pluginSource } from "./shared.js";
function storePath() {
  return Flag.CLOSEDCODE_PLUGIN_META_FILE ?? path.join(Global.Path.state, "plugin-meta.json");
}
function lock(file) {
  return `plugin-meta:${file}`;
}
function fileTarget(spec, target) {
  if (spec.startsWith("file://")) return fileURLToPath(spec);
  if (target.startsWith("file://")) return fileURLToPath(target);
  return;
}
async function modifiedAt(file) {
  const stat = await Filesystem.statAsync(file);
  if (!stat) return;
  const mtime = stat.mtimeMs;
  return Math.floor(typeof mtime === "bigint" ? Number(mtime) : mtime);
}
function resolvedTarget(target) {
  if (target.startsWith("file://")) return fileURLToPath(target);
  return target;
}
async function npmVersion(target) {
  const resolved = resolvedTarget(target);
  const stat = await Filesystem.statAsync(resolved);
  const dir = stat?.isDirectory() ? resolved : path.dirname(resolved);
  return Filesystem.readJson(path.join(dir, "package.json")).then(item => item.version).catch(() => undefined);
}
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
function fingerprint(value) {
  if (value.source === "file") return [value.target, value.modified ?? ""].join("|");
  return [value.target, value.requested ?? "", value.version ?? ""].join("|");
}
async function read(file) {
  return Filesystem.readJson(file).catch(() => ({}));
}
async function row(item) {
  return {
    ...item,
    core: await entryCore(item)
  };
}
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
export async function list() {
  const file = storePath();
  return Flock.withLock(lock(file), async () => read(file));
}
export * as PluginMeta from "./meta.js";