import { useWaitForDependencies } from "../../fixture/mock-tui-config.js"
import {  tmpdir  } from "../../fixture/fixture.js"
import {  createTuiPluginApi  } from "../../fixture/tui-plugin.js"
import {  expect, test, beforeAll, jest  } from "@jest/globals"
import fs from "fs/promises";
import path from "path";
import {  pathToFileURL  } from "url"
import { writeFile } from "../../lib/io.js";

const {
  TuiPluginRuntime
} = await import("../../../src/cli/cmd/tui/plugin/runtime.js");
test("toggles plugin runtime state by exported id", async () => {
  await using tmp = await tmpdir({
    init: async dir => {
      await writeFile(path.join(dir, "package.json"), JSON.stringify({ type: "module" }));
      const file = path.join(dir, "toggle-plugin.js");
      const spec = pathToFileURL(file).href;
      const marker = path.join(dir, "toggle.txt");
      await writeFile(file, `export default {
  id: "demo.toggle",
  tui: async (api, options) => {
    const text = await (await import("node:fs/promises")).readFile(options.marker, "utf8").catch(() => "")
    await (await import("node:fs/promises")).writeFile(options.marker, text + "start\\n")
    api.lifecycle.onDispose(async () => {
      const next = await (await import("node:fs/promises")).readFile(options.marker, "utf8").catch(() => "")
      await (await import("node:fs/promises")).writeFile(options.marker, next + "stop\\n")
    })
  },
}
`);
      return {
        spec,
        marker
      };
    }
  });
  process.env.CLOSEDCODE_PLUGIN_META_FILE = path.join(tmp.path, "plugin-meta.json");
  const config = {
    plugin: [[tmp.extra.spec, {
      marker: tmp.extra.marker
    }]],
    plugin_enabled: {
      "demo.toggle": false
    },
    plugin_origins: [{
      spec: [tmp.extra.spec, {
        marker: tmp.extra.marker
      }],
      scope: "local",
      source: path.join(tmp.path, "tui.json")
    }]
  };
  const wait = useWaitForDependencies();
  const cwd = jest.spyOn(process, "cwd").mockImplementation(() => tmp.path);
  const api = createTuiPluginApi();
  try {
    await TuiPluginRuntime.init({
      api,
      config
    });
    await expect(fs.readFile(tmp.extra.marker, "utf8")).rejects.toThrow();
    expect(TuiPluginRuntime.list().find(item => item.id === "demo.toggle")).toEqual({
      id: "demo.toggle",
      source: "file",
      spec: tmp.extra.spec,
      target: tmp.extra.spec,
      enabled: false,
      active: false
    });
    await expect(TuiPluginRuntime.activatePlugin("demo.toggle")).resolves.toBe(true);
    await expect(fs.readFile(tmp.extra.marker, "utf8")).resolves.toBe("start\n");
    expect(api.kv.get("plugin_enabled", {})).toEqual({
      "demo.toggle": true
    });
    await expect(TuiPluginRuntime.deactivatePlugin("demo.toggle")).resolves.toBe(true);
    await expect(fs.readFile(tmp.extra.marker, "utf8")).resolves.toBe("start\nstop\n");
    expect(api.kv.get("plugin_enabled", {})).toEqual({
      "demo.toggle": false
    });
    await expect(TuiPluginRuntime.activatePlugin("missing.id")).resolves.toBe(false);
  } finally {
    await TuiPluginRuntime.dispose();
    cwd.mockRestore();
    delete process.env.CLOSEDCODE_PLUGIN_META_FILE;
  }
});
test("kv plugin_enabled overrides tui config on startup", async () => {
  await using tmp = await tmpdir({
    init: async dir => {
      await writeFile(path.join(dir, "package.json"), JSON.stringify({ type: "module" }));
      const file = path.join(dir, "startup-plugin.js");
      const spec = pathToFileURL(file).href;
      const marker = path.join(dir, "startup.txt");
      await writeFile(file, `export default {
  id: "demo.startup",
  tui: async (_api, options) => {
    await (await import("node:fs/promises")).writeFile(options.marker, "on")
  },
}
`);
      return {
        spec,
        marker
      };
    }
  });
  process.env.CLOSEDCODE_PLUGIN_META_FILE = path.join(tmp.path, "plugin-meta.json");
  const config = {
    plugin: [[tmp.extra.spec, {
      marker: tmp.extra.marker
    }]],
    plugin_enabled: {
      "demo.startup": false
    },
    plugin_origins: [{
      spec: [tmp.extra.spec, {
        marker: tmp.extra.marker
      }],
      scope: "local",
      source: path.join(tmp.path, "tui.json")
    }]
  };
  const wait = useWaitForDependencies();
  const cwd = jest.spyOn(process, "cwd").mockImplementation(() => tmp.path);
  const api = createTuiPluginApi();
  api.kv.set("plugin_enabled", {
    "demo.startup": true
  });
  try {
    await TuiPluginRuntime.init({
      api,
      config
    });
    await expect(fs.readFile(tmp.extra.marker, "utf8")).resolves.toBe("on");
    expect(TuiPluginRuntime.list().find(item => item.id === "demo.startup")).toEqual({
      id: "demo.startup",
      source: "file",
      spec: tmp.extra.spec,
      target: tmp.extra.spec,
      enabled: true,
      active: true
    });
  } finally {
    await TuiPluginRuntime.dispose();
    cwd.mockRestore();
    delete process.env.CLOSEDCODE_PLUGIN_META_FILE;
  }
});