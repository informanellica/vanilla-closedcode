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
test("adds tui plugin at runtime from spec", async () => {
  await using tmp = await tmpdir({
    init: async dir => {
      await writeFile(path.join(dir, "package.json"), JSON.stringify({ type: "module" }));
      const file = path.join(dir, "add-plugin.js");
      const spec = pathToFileURL(file).href;
      const marker = path.join(dir, "add.txt");
      await writeFile(file, `export default {
  id: "demo.add",
  tui: async () => {
    await (await import("node:fs/promises")).writeFile(${JSON.stringify(marker)}, "called")
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
    plugin: [],
    plugin_origins: undefined
  };
  const wait = useWaitForDependencies();
  const cwd = jest.spyOn(process, "cwd").mockImplementation(() => tmp.path);
  try {
    await TuiPluginRuntime.init({
      api: createTuiPluginApi(),
      config
    });
    await expect(TuiPluginRuntime.addPlugin(tmp.extra.spec)).resolves.toBe(true);
    await expect(fs.readFile(tmp.extra.marker, "utf8")).resolves.toBe("called");
    expect(TuiPluginRuntime.list().find(item => item.id === "demo.add")).toEqual({
      id: "demo.add",
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
test("retries runtime add for file plugins after dependency wait", async () => {
  await using tmp = await tmpdir({
    init: async dir => {
      await writeFile(path.join(dir, "package.json"), JSON.stringify({ type: "module" }));
      const mod = path.join(dir, "retry-plugin");
      const spec = pathToFileURL(mod).href;
      const marker = path.join(dir, "retry-add.txt");
      await fs.mkdir(mod, {
        recursive: true
      });
      return {
        mod,
        spec,
        marker
      };
    }
  });
  process.env.CLOSEDCODE_PLUGIN_META_FILE = path.join(tmp.path, "plugin-meta.json");
  const config = {
    plugin: [],
    plugin_origins: undefined
  };
  const wait = useWaitForDependencies().mockImplementation(async () => {
    await writeFile(path.join(tmp.extra.mod, "index.js"), `export default {
  id: "demo.add.retry",
  tui: async () => {
    await (await import("node:fs/promises")).writeFile(${JSON.stringify(tmp.extra.marker)}, "called")
  },
}
`);
  });
  const cwd = jest.spyOn(process, "cwd").mockImplementation(() => tmp.path);
  try {
    await TuiPluginRuntime.init({
      api: createTuiPluginApi(),
      config
    });
    await expect(TuiPluginRuntime.addPlugin(tmp.extra.spec)).resolves.toBe(true);
    await expect(fs.readFile(tmp.extra.marker, "utf8")).resolves.toBe("called");
    expect(wait).toHaveBeenCalledTimes(1);
    expect(TuiPluginRuntime.list().find(item => item.id === "demo.add.retry")?.active).toBe(true);
  } finally {
    await TuiPluginRuntime.dispose();
    cwd.mockRestore();
    delete process.env.CLOSEDCODE_PLUGIN_META_FILE;
  }
});