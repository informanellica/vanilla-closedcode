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
test("skips external tui plugins in pure mode", async () => {
  await using tmp = await tmpdir({
    init: async dir => {
      await writeFile(path.join(dir, "package.json"), JSON.stringify({ type: "module" }));
      const file = path.join(dir, "plugin.js");
      const spec = pathToFileURL(file).href;
      const marker = path.join(dir, "called.txt");
      const meta = path.join(dir, "plugin-meta.json");
      await writeFile(file, `export default {
  id: "demo.pure",
  tui: async (_api, options) => {
    if (!options?.marker) return
    await (await import("node:fs/promises")).writeFile(options.marker, "called")
  },
}
`);
      return {
        spec,
        marker,
        meta
      };
    }
  });
  const pure = process.env.CLOSEDCODE_PURE;
  const meta = process.env.CLOSEDCODE_PLUGIN_META_FILE;
  process.env.CLOSEDCODE_PURE = "1";
  process.env.CLOSEDCODE_PLUGIN_META_FILE = tmp.extra.meta;
  const config = {
    plugin: [[tmp.extra.spec, {
      marker: tmp.extra.marker
    }]],
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
  try {
    await TuiPluginRuntime.init({
      api: createTuiPluginApi(),
      config
    });
    await expect(fs.readFile(tmp.extra.marker, "utf8")).rejects.toThrow();
  } finally {
    await TuiPluginRuntime.dispose();
    cwd.mockRestore();
    if (pure === undefined) {
      delete process.env.CLOSEDCODE_PURE;
    } else {
      process.env.CLOSEDCODE_PURE = pure;
    }
    if (meta === undefined) {
      delete process.env.CLOSEDCODE_PLUGIN_META_FILE;
    } else {
      process.env.CLOSEDCODE_PLUGIN_META_FILE = meta;
    }
  }
});