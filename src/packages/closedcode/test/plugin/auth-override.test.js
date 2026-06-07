import {  Effect, Layer  } from "effect"
import {  provideTestInstance, tmpdir  } from "../fixture/fixture.js"
import {  TestConfig  } from "../fixture/config.js"
import {  ProviderAuth  } from "@/provider/auth.js"
import {  ProviderID  } from "../../src/provider/schema.js"
import {  Plugin  } from "@/plugin/index.js"
import {  Auth  } from "@/auth/index.js"
import {  Bus  } from "@/bus/index.js"
import {  describe, expect, test, beforeAll  } from "@jest/globals"
import path from "path";
import fs from "fs/promises";
import {  pathToFileURL  } from "url"
import { readText, writeFile } from "../lib/io.js";
import { fileURLToPath as __toPath } from "node:url";
const __dirname = path.dirname(__toPath(import.meta.url));


function layer(directory, plugins) {
  return ProviderAuth.layer.pipe(Layer.provide(Auth.defaultLayer), Layer.provide(Plugin.layer.pipe(Layer.provide(Bus.layer), Layer.provide(TestConfig.layer({
    get: () => Effect.succeed({
      plugin: plugins,
      plugin_origins: plugins.map(plugin => ({
        spec: plugin,
        source: path.join(directory, "opencode.json"),
        scope: "local"
      }))
    }),
    directories: () => Effect.succeed([directory])
  })))));
}
describe("plugin.auth-override", () => {
  test("user plugin overrides built-in github-copilot auth", async () => {
    await using tmp = await tmpdir({
      init: async dir => {
        const pluginDir = path.join(dir, ".opencode", "plugin");
        await fs.mkdir(pluginDir, {
          recursive: true
        });
        await writeFile(path.join(dir, "package.json"), JSON.stringify({ type: "module" }));
        await writeFile(path.join(pluginDir, "custom-copilot-auth.js"), ["export default {", '  id: "demo.custom-copilot-auth",', "  server: async () => ({", "    auth: {", '      provider: "github-copilot",', "      methods: [", '        { type: "api", label: "Test Override Auth" },', "      ],", "      loader: async () => ({ access: 'test-token' }),", "    },", "  }),", "}", ""].join("\n"));
      }
    });
    await using plain = await tmpdir();
    const plugin = pathToFileURL(path.join(tmp.path, ".opencode", "plugin", "custom-copilot-auth.js")).href;
    const [methods, plainMethods] = await Promise.all([provideTestInstance({
      directory: tmp.path,
      fn: async () => {
        return Effect.runPromise(ProviderAuth.Service.use(svc => svc.methods()).pipe(Effect.provide(layer(tmp.path, [plugin]))));
      }
    }), provideTestInstance({
      directory: plain.path,
      fn: async () => {
        return Effect.runPromise(ProviderAuth.Service.use(svc => svc.methods()).pipe(Effect.provide(layer(plain.path, []))));
      }
    })]);
    const copilot = methods[ProviderID.make("github-copilot")];
    expect(copilot).toBeDefined();
    expect(copilot.length).toBe(1);
    expect(copilot[0].label).toBe("Test Override Auth");
    // local-only build ships no bundled github-copilot auth, so plain (no
    // plugin) must NOT advertise it — the override is what introduced it.
    expect(plainMethods[ProviderID.make("github-copilot")]).toBeUndefined();
  }, 30000);
});
const file = path.join(__dirname, "../../src/plugin/index.js");
describe("plugin.config-hook-error-isolation", () => {
  test("config hooks are individually error-isolated in the layer factory", async () => {
    const src = await readText(file);

    // Each hook's config call is wrapped in Effect.tryPromise with error logging + Effect.ignore
    expect(src).toContain("plugin config hook failed");
    const pattern = /for\s*\(const hook of hooks\)\s*\{[\s\S]*?Effect\.tryPromise[\s\S]*?\.config\?\.\([\s\S]*?plugin config hook failed[\s\S]*?Effect\.ignore/;
    expect(pattern.test(src)).toBe(true);
  });
});