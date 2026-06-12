import {  disposeAllInstances, tmpdir  } from "../fixture/fixture.js"
import {  bootstrap as cliBootstrap  } from "../../src/cli/bootstrap.js"
import {  WithInstance  } from "../../src/project/with-instance.js"
import {  InstanceRuntime  } from "../../src/project/instance-runtime.js"
import {  afterEach, expect, test  } from "@jest/globals"
import {  existsSync  } from "node:fs"
import path from "node:path";
import {  pathToFileURL  } from "node:url"
import { writeFile } from "../lib/io.js";

// These regressions cover the legacy instance-loading paths fixed by PRs
// #25389 and #25449. The plugin config hook writes a marker file, and the test
// bodies deliberately avoid touching Plugin or config directly. The marker only
// exists if InstanceBootstrap ran at the instance boundary.

afterEach(async () => {
  await disposeAllInstances();
});
async function bootstrapFixture() {
  return tmpdir({
    init: async dir => {
      const marker = path.join(dir, "config-hook-fired");
      const pluginFile = path.join(dir, "plugin.mjs");
      await writeFile(pluginFile, ["import { writeFile } from 'node:fs/promises'", `const MARKER = ${JSON.stringify(marker)}`, "export default {", '  id: "test.instance-bootstrap",', "  server: async () => ({", "    config: async () => {", '      await writeFile(MARKER, "ran")', "    },", "  }),", "}", ""].join("\n"));
      const config = JSON.stringify({
        plugin: [pathToFileURL(pluginFile).href]
      });
      await writeFile(path.join(dir, "closedcode.json"), config);
      return marker;
    }
  });
}
test("Instance.provide runs InstanceBootstrap before fn (boundary invariant)", async () => {
  await using tmp = await bootstrapFixture();
  await WithInstance.provide({
    directory: tmp.path,
    fn: async () => "ok"
  });
  expect(existsSync(tmp.extra)).toBe(true);
});
test("CLI bootstrap runs InstanceBootstrap before callback", async () => {
  await using tmp = await bootstrapFixture();
  await cliBootstrap(tmp.path, async () => "ok");
  expect(existsSync(tmp.extra)).toBe(true);
});
test("InstanceRuntime.reloadInstance runs InstanceBootstrap", async () => {
  await using tmp = await bootstrapFixture();
  await InstanceRuntime.reloadInstance({
    directory: tmp.path
  });
  expect(existsSync(tmp.extra)).toBe(true);
});
