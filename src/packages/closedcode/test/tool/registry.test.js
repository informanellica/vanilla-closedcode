import {  Effect, Layer  } from "effect"
import {  disposeAllInstances, TestInstance  } from "../fixture/fixture.js"
import {  testEffect  } from "../lib/effect.js"
import {  TestConfig  } from "../fixture/config.js"
import {  FetchHttpClient  } from "effect/unstable/http"
import {  CrossSpawnSpawner  } from "core/cross-spawn-spawner"
import {  ToolRegistry  } from "#tool/registry.js"
import {  AppFileSystem  } from "core/filesystem"
import {  Plugin  } from "#plugin/index.js"
import {  Question  } from "#question/index.js"
import {  Todo  } from "#session/todo.js"
import {  Skill  } from "#skill/index.js"
import {  Agent  } from "#agent/agent.js"
import {  Session  } from "#session/session.js"
import {  Provider  } from "#provider/provider.js"
import {  LSP  } from "#lsp/lsp.js"
import {  Instruction  } from "#session/instruction.js"
import {  Bus  } from "#bus/index.js"
import {  Format  } from "#format/index.js"
import {  Ripgrep  } from "#file/ripgrep.js"
import { writeFile } from "../lib/io.js";

import * as Truncate from "#tool/truncate.js";
import {  InstanceState  } from "#effect/instance-state.js"
import {  afterEach, describe, expect, beforeAll  } from "@jest/globals"
import path from "path";
import fs from "fs/promises";
const node = CrossSpawnSpawner.defaultLayer;
const configLayer = TestConfig.layer({
  directories: () => InstanceState.directory.pipe(Effect.map(dir => [path.join(dir, ".closedcode")]))
});
const registryLayer = ToolRegistry.layer.pipe(Layer.provide(configLayer), Layer.provide(Plugin.defaultLayer), Layer.provide(Question.defaultLayer), Layer.provide(Todo.defaultLayer), Layer.provide(Skill.defaultLayer), Layer.provide(Agent.defaultLayer), Layer.provide(Session.defaultLayer), Layer.provide(Provider.defaultLayer), Layer.provide(LSP.defaultLayer), Layer.provide(Instruction.defaultLayer), Layer.provide(AppFileSystem.defaultLayer), Layer.provide(Bus.layer), Layer.provide(FetchHttpClient.layer), Layer.provide(Format.defaultLayer), Layer.provide(node), Layer.provide(Ripgrep.defaultLayer), Layer.provide(Truncate.defaultLayer));
const it = testEffect(Layer.mergeAll(registryLayer, node));
afterEach(async () => {
  await disposeAllInstances();
});
describe("tool.registry", () => {
  it.instance("loads tools from .closedcode/tool (singular)", () => Effect.gen(function* () {
    const test = yield* TestInstance;
    const closedcode = path.join(test.directory, ".closedcode");
    const tool = path.join(closedcode, "tool");
    yield* Effect.promise(() => fs.mkdir(tool, {
      recursive: true
    }));
    yield* Effect.promise(() => writeFile(path.join(tool, "hello.ts"), ["export default {", "  description: 'hello tool',", "  args: {},", "  execute: async () => {", "    return 'hello world'", "  },", "}", ""].join("\n")));
    const registry = yield* ToolRegistry.Service;
    const ids = yield* registry.ids();
    expect(ids).toContain("hello");
  }));
  it.instance("loads tools from .closedcode/tools (plural)", () => Effect.gen(function* () {
    const test = yield* TestInstance;
    const closedcode = path.join(test.directory, ".closedcode");
    const tools = path.join(closedcode, "tools");
    yield* Effect.promise(() => fs.mkdir(tools, {
      recursive: true
    }));
    yield* Effect.promise(() => writeFile(path.join(tools, "hello.ts"), ["export default {", "  description: 'hello tool',", "  args: {},", "  execute: async () => {", "    return 'hello world'", "  },", "}", ""].join("\n")));
    const registry = yield* ToolRegistry.Service;
    const ids = yield* registry.ids();
    expect(ids).toContain("hello");
  }));
  it.instance("loads tools with external dependencies without crashing", () => Effect.gen(function* () {
    const test = yield* TestInstance;
    const closedcode = path.join(test.directory, ".closedcode");
    const tools = path.join(closedcode, "tools");
    yield* Effect.promise(() => fs.mkdir(tools, {
      recursive: true
    }));
    yield* Effect.promise(() => writeFile(path.join(closedcode, "package.json"), JSON.stringify({
      name: "custom-tools",
      dependencies: {
        "plugin": "^0.0.0",
        cowsay: "^1.6.0"
      }
    })));
    yield* Effect.promise(() => writeFile(path.join(closedcode, "package-lock.json"), JSON.stringify({
      name: "custom-tools",
      lockfileVersion: 3,
      packages: {
        "": {
          dependencies: {
            "plugin": "^0.0.0",
            cowsay: "^1.6.0"
          }
        }
      }
    })));
    const cowsay = path.join(closedcode, "node_modules", "cowsay");
    yield* Effect.promise(() => fs.mkdir(cowsay, {
      recursive: true
    }));
    yield* Effect.promise(() => writeFile(path.join(cowsay, "package.json"), JSON.stringify({
      name: "cowsay",
      type: "module",
      exports: "./index.js"
    })));
    yield* Effect.promise(() => writeFile(path.join(cowsay, "index.js"), ["export function say({ text }) {", "  return `moo ${text}`", "}", ""].join("\n")));
    yield* Effect.promise(() => writeFile(path.join(tools, "cowsay.ts"), ["import { say } from 'cowsay'", "export default {", "  description: 'tool that imports cowsay at top level',", "  args: { text: { type: 'string' } },", "  execute: async ({ text }: { text: string }) => {", "    return say({ text })", "  },", "}", ""].join("\n")));
    const registry = yield* ToolRegistry.Service;
    const ids = yield* registry.ids();
    expect(ids).toContain("cowsay");
  }));
});