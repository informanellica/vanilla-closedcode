import { jest } from "@jest/globals"
import path from "path";
import { waitForDependenciesMock } from "./mock-tui-config.js";

export function mockTuiRuntime(dir, plugin, opts) {
  process.env.CLOSEDCODE_PLUGIN_META_FILE = path.join(dir, "plugin-meta.json");
  const plugin_origins = plugin.map((spec) => ({
    spec,
    scope: "local",
    source: path.join(dir, "tui.json"),
  }));
  waitForDependenciesMock.mockClear();
  const cwd = jest.spyOn(process, "cwd").mockImplementation(() => dir);
  const config = {
    plugin,
    plugin_origins,
    ...(opts?.plugin_enabled && { plugin_enabled: opts.plugin_enabled }),
  };
  return {
    config,
    restore: () => {
      cwd.mockRestore();
      delete process.env.CLOSEDCODE_PLUGIN_META_FILE;
    },
  };
}
