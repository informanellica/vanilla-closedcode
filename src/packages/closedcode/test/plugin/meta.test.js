import {  tmpdir  } from "../fixture/fixture.js"
import {  Process  } from "#util/process.js"
import {  Filesystem  } from "#util/filesystem.js"
import {  afterEach, describe, expect, test, beforeAll  } from "@jest/globals"
import fs from "fs/promises";
import path from "path";
import {  pathToFileURL  } from "url"
import { writeFile } from "../lib/io.js";
import { fileURLToPath as __toPath } from "node:url";
const __dirname = path.dirname(__toPath(import.meta.url));


const {
  PluginMeta
} = await import("../../src/plugin/meta.js");
const root = path.join(__dirname, "../..");
const worker = path.join(__dirname, "../fixture/plugin-meta-worker.js");
function run(input) {
  return Process.run([process.execPath, worker, JSON.stringify(input)], {
    cwd: root,
    nothrow: true
  });
}
async function map(file) {
  return Filesystem.readJson(file);
}
afterEach(() => {
  delete process.env.CLOSEDCODE_PLUGIN_META_FILE;
});
describe("plugin.meta", () => {
  test("tracks file plugin loads and changes", async () => {
    await using tmp = await tmpdir({
      init: async dir => {
        const file = path.join(dir, "plugin.js");
        await writeFile(file, "export default async () => ({})\n");
        return {
          file
        };
      }
    });
    process.env.CLOSEDCODE_PLUGIN_META_FILE = path.join(tmp.path, "state", "plugin-meta.json");
    const file = process.env.CLOSEDCODE_PLUGIN_META_FILE;
    const spec = pathToFileURL(tmp.extra.file).href;
    const one = await PluginMeta.touch(spec, spec, "demo.file");
    expect(one.state).toBe("first");
    expect(one.entry.source).toBe("file");
    expect(one.entry.id).toBe("demo.file");
    expect(one.entry.modified).toBeDefined();
    const two = await PluginMeta.touch(spec, spec, "demo.file");
    expect(two.state).toBe("same");
    expect(two.entry.load_count).toBe(2);
    await writeFile(tmp.extra.file, "export default async () => ({ ok: true })\n");
    const stamp = new Date(Date.now() + 10_000);
    await fs.utimes(tmp.extra.file, stamp, stamp);
    const three = await PluginMeta.touch(spec, spec, "demo.file");
    expect(three.state).toBe("updated");
    expect(three.entry.load_count).toBe(3);
    expect((three.entry.modified ?? 0) > (one.entry.modified ?? 0)).toBe(true);
    const all = await PluginMeta.list();
    expect(Object.values(all).some(item => item.spec === spec && item.source === "file")).toBe(true);
    const saved = await map(file);
    expect(saved["demo.file"]?.spec).toBe(spec);
    expect(saved["demo.file"]?.load_count).toBe(3);
  });
  test("tracks npm plugin versions", async () => {
    await using tmp = await tmpdir({
      init: async dir => {
        const mod = path.join(dir, "node_modules", "acme-plugin");
        const pkg = path.join(mod, "package.json");
        await fs.mkdir(mod, {
          recursive: true
        });
        await writeFile(pkg, JSON.stringify({
          name: "acme-plugin",
          version: "1.0.0"
        }, null, 2));
        return {
          mod,
          pkg
        };
      }
    });
    process.env.CLOSEDCODE_PLUGIN_META_FILE = path.join(tmp.path, "state", "plugin-meta.json");
    const file = process.env.CLOSEDCODE_PLUGIN_META_FILE;
    const one = await PluginMeta.touch("acme-plugin@latest", tmp.extra.mod, "acme-plugin");
    expect(one.state).toBe("first");
    expect(one.entry.source).toBe("npm");
    expect(one.entry.requested).toBe("latest");
    expect(one.entry.version).toBe("1.0.0");
    await writeFile(tmp.extra.pkg, JSON.stringify({
      name: "acme-plugin",
      version: "1.1.0"
    }, null, 2));
    const two = await PluginMeta.touch("acme-plugin@latest", tmp.extra.mod, "acme-plugin");
    expect(two.state).toBe("updated");
    expect(two.entry.version).toBe("1.1.0");
    expect(two.entry.load_count).toBe(2);
    const all = await PluginMeta.list();
    expect(Object.values(all).some(item => item.id === "acme-plugin" && item.version === "1.1.0")).toBe(true);
    const saved = await map(file);
    expect(Object.values(saved).some(item => item.id === "acme-plugin" && item.version === "1.1.0")).toBe(true);
  });
  test("serializes concurrent metadata updates across processes", async () => {
    await using tmp = await tmpdir({
      init: async dir => {
        const file = path.join(dir, "plugin.js");
        await writeFile(file, "export default async () => ({})\n");
        return {
          file
        };
      }
    });
    process.env.CLOSEDCODE_PLUGIN_META_FILE = path.join(tmp.path, "state", "plugin-meta.json");
    const file = process.env.CLOSEDCODE_PLUGIN_META_FILE;
    const spec = pathToFileURL(tmp.extra.file).href;
    const n = 12;
    const out = await Promise.all(Array.from({
      length: n
    }, () => run({
      file,
      spec,
      target: spec,
      id: "demo.file"
    })));
    expect(out.map(item => item.code)).toEqual(Array.from({
      length: n
    }, () => 0));
    expect(out.map(item => item.stderr.toString()).filter(Boolean)).toEqual([]);
    const all = await PluginMeta.list();
    const hit = Object.values(all).find(item => item.spec === spec);
    expect(hit?.load_count).toBe(n);
    const saved = await map(file);
    expect(Object.values(saved).find(item => item.spec === spec)?.load_count).toBe(n);
  }, 20_000);
});