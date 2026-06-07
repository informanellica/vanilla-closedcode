import {  tmpdir  } from "../fixture/fixture.js"
import {  Process  } from "@/util/process.js"
import {  Filesystem  } from "@/util/filesystem.js"
import {  describe, expect, test, beforeAll  } from "@jest/globals"
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "node:url";
import { writeFile } from "../lib/io.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "../..");
const worker = path.join(__dirname, "../fixture/plug-worker.js");
function run(msg) {
  return Process.run([process.execPath, worker, JSON.stringify(msg)], {
    cwd: root,
    nothrow: true
  });
}
async function plugin(dir, kinds) {
  const p = path.join(dir, "plugin");
  const server = kinds.includes("server");
  const tui = kinds.includes("tui");
  const exports = {};
  if (server) exports["./server"] = "./server.js";
  if (tui) exports["./tui"] = "./tui.js";
  await fs.mkdir(p, {
    recursive: true
  });
  await writeFile(path.join(p, "package.json"), JSON.stringify({
    name: "acme",
    version: "1.0.0",
    ...(server ? {
      main: "./server.js"
    } : {}),
    ...(Object.keys(exports).length ? {
      exports
    } : {})
  }, null, 2));
  return p;
}
async function read(file) {
  return Filesystem.readJson(file);
}
function mods(prefix, n) {
  return Array.from({
    length: n
  }, (_, i) => `${prefix}-${i}@1.0.0`);
}
function expectPlugins(list, expectMods) {
  expect(Array.isArray(list)).toBe(true);
  const hit = (list ?? []).filter(item => typeof item === "string");
  expect(hit.length).toBe(expectMods.length);
  expect(new Set(hit)).toEqual(new Set(expectMods));
}
describe("plugin.install.concurrent", () => {
  test("serializes concurrent server config updates across processes", async () => {
    await using tmp = await tmpdir();
    const target = await plugin(tmp.path, ["server"]);
    const all = mods("mod-server", 12);
    const out = await Promise.all(all.map(mod => run({
      dir: tmp.path,
      target,
      mod,
      holdMs: 30
    })));
    expect(out.map(x => x.code)).toEqual(Array.from({
      length: all.length
    }, () => 0));
    expect(out.map(x => x.stderr.toString()).filter(Boolean)).toEqual([]);
    const cfg = await read(path.join(tmp.path, ".opencode", "opencode.jsonc"));
    expectPlugins(cfg.plugin, all);
  }, 25_000);
  test("serializes concurrent server+tui config updates across processes", async () => {
    await using tmp = await tmpdir();
    const target = await plugin(tmp.path, ["server", "tui"]);
    const all = mods("mod-both", 10);
    const out = await Promise.all(all.map(mod => run({
      dir: tmp.path,
      target,
      mod,
      holdMs: 30
    })));
    expect(out.map(x => x.code)).toEqual(Array.from({
      length: all.length
    }, () => 0));
    expect(out.map(x => x.stderr.toString()).filter(Boolean)).toEqual([]);
    const server = await read(path.join(tmp.path, ".opencode", "opencode.jsonc"));
    const tui = await read(path.join(tmp.path, ".opencode", "tui.jsonc"));
    expectPlugins(server.plugin, all);
    expectPlugins(tui.plugin, all);
  }, 25_000);
  test("preserves updates when existing config uses .json", async () => {
    await using tmp = await tmpdir();
    const target = await plugin(tmp.path, ["server"]);
    const cfg = path.join(tmp.path, ".opencode", "opencode.json");
    await fs.mkdir(path.dirname(cfg), {
      recursive: true
    });
    await writeFile(cfg, JSON.stringify({
      plugin: ["seed@1.0.0"]
    }, null, 2));
    const next = mods("mod-json", 8);
    const out = await Promise.all(next.map(mod => run({
      dir: tmp.path,
      target,
      mod,
      holdMs: 30
    })));
    expect(out.map(x => x.code)).toEqual(Array.from({
      length: next.length
    }, () => 0));
    expect(out.map(x => x.stderr.toString()).filter(Boolean)).toEqual([]);
    const json = await read(cfg);
    expectPlugins(json.plugin, ["seed@1.0.0", ...next]);
    expect(await Filesystem.exists(path.join(tmp.path, ".opencode", "opencode.jsonc"))).toBe(false);
  }, 25_000);
});