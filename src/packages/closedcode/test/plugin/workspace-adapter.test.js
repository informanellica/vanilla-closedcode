import {  Effect, Layer  } from "effect"
import {  disposeAllInstances, provideTmpdirInstance  } from "../fixture/fixture.js"
import {  testEffect  } from "../lib/effect.js"
import {  CrossSpawnSpawner  } from "core/cross-spawn-spawner"
import {  afterAll, afterEach, describe, expect, beforeAll  } from "@jest/globals"
import path from "path";
import {  pathToFileURL  } from "url"
import { readText, writeFile } from "../lib/io.js";

const disableDefault = process.env.CLOSEDCODE_DISABLE_DEFAULT_PLUGINS;
process.env.CLOSEDCODE_DISABLE_DEFAULT_PLUGINS = "1";
const {
  Flag
} = await import("core/flag/flag");
const {
  Plugin
} = await import("../../src/plugin/index.js");
const {
  Workspace
} = await import("../../src/control-plane/workspace.js");
const {
  Instance
} = await import("../../src/project/instance.js");
const it = testEffect(Layer.mergeAll(Plugin.defaultLayer, Workspace.defaultLayer, CrossSpawnSpawner.defaultLayer));
const experimental = Flag.CLOSEDCODE_EXPERIMENTAL_WORKSPACES;
Flag.CLOSEDCODE_EXPERIMENTAL_WORKSPACES = true;
afterEach(async () => {
  await disposeAllInstances();
});
afterAll(() => {
  if (disableDefault === undefined) {
    delete process.env.CLOSEDCODE_DISABLE_DEFAULT_PLUGINS;
  } else {
    process.env.CLOSEDCODE_DISABLE_DEFAULT_PLUGINS = disableDefault;
  }
  Flag.CLOSEDCODE_EXPERIMENTAL_WORKSPACES = experimental;
});
describe("plugin.workspace", () => {
  it.live("plugin can install a workspace adapter", () => provideTmpdirInstance(dir => Effect.gen(function* () {
    const type = `plug-${Math.random().toString(36).slice(2)}`;
    const file = path.join(dir, "plugin.ts");
    const mark = path.join(dir, "created.json");
    const space = path.join(dir, "space");
    yield* Effect.promise(() => writeFile(file, ["export default async ({ experimental_workspace }) => {", `  experimental_workspace.register(${JSON.stringify(type)}, {`, '    name: "plug",', '    description: "plugin workspace adapter",', "    configure(input) {", `      return { ...input, name: "plug", branch: "plug/main", directory: ${JSON.stringify(space)} }`, "    },", "    async create(input) {", `      await (await import("node:fs/promises")).writeFile(${JSON.stringify(mark)}, JSON.stringify(input))`, "    },", "    async remove() {},", "    target(input) {", '      return { type: "local", directory: input.directory }', "    },", "  })", "  return {}", "}", ""].join("\n")));
    yield* Effect.promise(() => writeFile(path.join(dir, "opencode.json"), JSON.stringify({
      plugin: [pathToFileURL(file).href]
    }, null, 2)));
    const plugin = yield* Plugin.Service;
    yield* plugin.init();
    const workspace = yield* Workspace.Service;
    const info = yield* workspace.create({
      type,
      branch: null,
      extra: {
        key: "value"
      },
      projectID: Instance.project.id
    });
    expect(info.type).toBe(type);
    expect(info.name).toBe("plug");
    expect(info.branch).toBe("plug/main");
    expect(info.directory).toBe(space);
    expect(info.extra).toEqual({
      key: "value"
    });
    expect(JSON.parse(yield* Effect.promise(() => readText(mark)))).toMatchObject({
      type,
      name: "plug",
      branch: "plug/main",
      directory: space,
      extra: {
        key: "value"
      }
    });
  })));
});