import {  Effect, Layer  } from "effect"
import {  provideTmpdirInstance  } from "../fixture/fixture.js"
import {  testEffect  } from "../lib/effect.js"
import {  CrossSpawnSpawner  } from "core/cross-spawn-spawner"
import {  ModelID, ProviderID  } from "../../src/provider/schema.js"
import {  afterAll, describe, expect, beforeAll  } from "@jest/globals"
import path from "path";
import {  pathToFileURL  } from "url"
import { sleep, writeFile } from "../lib/io.js";

const disableDefault = process.env.CLOSEDCODE_DISABLE_DEFAULT_PLUGINS;
process.env.CLOSEDCODE_DISABLE_DEFAULT_PLUGINS = "1";
const {
  Plugin
} = await import("../../src/plugin/index.js");
const it = testEffect(Layer.mergeAll(Plugin.defaultLayer, CrossSpawnSpawner.defaultLayer));
const systemHook = "experimental.chat.system.transform";
afterAll(() => {
  if (disableDefault === undefined) {
    delete process.env.CLOSEDCODE_DISABLE_DEFAULT_PLUGINS;
    return;
  }
  process.env.CLOSEDCODE_DISABLE_DEFAULT_PLUGINS = disableDefault;
});
function withProject(source, self) {
  return provideTmpdirInstance(dir => Effect.gen(function* () {
    const file = path.join(dir, "plugin.ts");
    yield* Effect.all([Effect.promise(() => writeFile(file, source)), Effect.promise(() => writeFile(path.join(dir, "opencode.json"), JSON.stringify({
      plugin: [pathToFileURL(file).href]
    }, null, 2)))], {
      discard: true,
      concurrency: 2
    });
    return yield* self;
  }));
}
const triggerSystemTransform = Effect.fn("PluginTriggerTest.triggerSystemTransform")(function* () {
  const plugin = yield* Plugin.Service;
  const out = {
    system: []
  };
  yield* plugin.trigger(systemHook, {
    model: {
      providerID: ProviderID.lmstudio,
      modelID: ModelID.make("openai/gpt-oss-20b")
    }
  }, out);
  return out.system;
});
describe("plugin.trigger", () => {
  it.live("runs synchronous hooks without crashing", () => withProject(["export default async () => ({", `  ${JSON.stringify(systemHook)}: (_input, output) => {`, '    output.system.unshift("sync")', "  },", "})", ""].join("\n"), Effect.gen(function* () {
    expect(yield* triggerSystemTransform()).toEqual(["sync"]);
  })));
  it.live("awaits asynchronous hooks", () => withProject(["export default async () => ({", `  ${JSON.stringify(systemHook)}: async (_input, output) => {`, "    await sleep(1)", '    output.system.unshift("async")', "  },", "})", ""].join("\n"), Effect.gen(function* () {
    expect(yield* triggerSystemTransform()).toEqual(["async"]);
  })));
});