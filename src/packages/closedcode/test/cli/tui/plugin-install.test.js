import { useWaitForDependencies } from "../../fixture/mock-tui-config.js"
import {  tmpdir  } from "../../fixture/fixture.js"
import {  createTuiPluginApi  } from "../../fixture/tui-plugin.js"
import {  expect, test, jest  } from "@jest/globals"
import fs from "fs/promises";
import path from "path";
import {  pathToFileURL  } from "url"
import { writeFile } from "../../lib/io.js";

const {
  TuiPluginRuntime
} = await import("../../../src/cli/cmd/tui/plugin/runtime.js");
test("installs plugin without loading it", async () => {
  await using tmp = await tmpdir({
    init: async dir => {
      const file = path.join(dir, "install-plugin.js");
      const spec = pathToFileURL(file).href;
      const marker = path.join(dir, "install.txt");
      await writeFile(path.join(dir, "package.json"), JSON.stringify({
        name: "demo-install-plugin",
        type: "module",
        exports: {
          "./tui": {
            import: "./install-plugin.js",
            config: {
              marker
            }
          }
        }
      }, null, 2));
      await writeFile(file, `export default {
  id: "demo.install",
  tui: async (_api, options) => {
    if (!options?.marker) return
    await (await import("node:fs/promises")).writeFile(options.marker, "loaded")
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
  useWaitForDependencies();
  const cwd = jest.spyOn(process, "cwd").mockImplementation(() => tmp.path);
  const api = createTuiPluginApi({
    state: {
      path: {
        state: path.join(tmp.path, "state.json"),
        config: path.join(tmp.path, "tui.json"),
        worktree: tmp.path,
        directory: tmp.path
      }
    }
  });
  try {
    await TuiPluginRuntime.init({
      api,
      config
    });
    const out = await TuiPluginRuntime.installPlugin(tmp.extra.spec);
    expect(out).toMatchObject({
      ok: true,
      tui: true
    });
    await expect(fs.readFile(tmp.extra.marker, "utf8")).rejects.toThrow();
    await expect(TuiPluginRuntime.addPlugin(tmp.extra.spec)).resolves.toBe(true);
    await expect(fs.readFile(tmp.extra.marker, "utf8")).resolves.toBe("loaded");
  } finally {
    await TuiPluginRuntime.dispose();
    cwd.mockRestore();
    delete process.env.CLOSEDCODE_PLUGIN_META_FILE;
  }
});