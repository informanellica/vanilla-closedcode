import {  disposeAllInstances, tmpdir  } from "../fixture/fixture.js"
import {  AppRuntime  } from "../../src/effect/app-runtime.js"
import {  Agent  } from "../../src/agent/agent.js"
import {  WithInstance  } from "../../src/project/with-instance.js"
import {  afterEach, expect, test, beforeAll  } from "@jest/globals"
import path from "path";
import {  pathToFileURL  } from "url"
import { writeFile } from "../lib/io.js";

afterEach(async () => {
  await disposeAllInstances();
});
test("plugin-registered agents appear in Agent.list", async () => {
  await using tmp = await tmpdir({
    init: async dir => {
      const pluginFile = path.join(dir, "plugin.mjs");
      await writeFile(pluginFile, ["export default {", '  id: "test.plugin-agent-regression",', "  server: async () => ({", "    config: async (cfg) => {", "      cfg.agent = cfg.agent ?? {}", "      cfg.agent.plugin_added = {", '        description: "Added by a plugin via the config hook",', '        mode: "subagent",', "      }", "    },", "  }),", "}", ""].join("\n"));
      await writeFile(path.join(dir, "closedcode.json"), JSON.stringify({
        plugin: [pathToFileURL(pluginFile).href]
      }));
    }
  });
  await WithInstance.provide({
    directory: tmp.path,
    fn: async () => {
      const agents = await AppRuntime.runPromise(Agent.Service.use(svc => svc.list()));
      const added = agents.find(agent => agent.name === "plugin_added");
      expect(added?.description).toBe("Added by a plugin via the config hook");
      expect(added?.mode).toBe("subagent");
    }
  });
});
