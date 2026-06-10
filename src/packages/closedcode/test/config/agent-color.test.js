import {  Effect, Layer  } from "effect"
import {  provideInstance, tmpdirScoped  } from "../fixture/fixture.js"
import {  testEffect  } from "../lib/effect.js"
import {  CrossSpawnSpawner  } from "core/cross-spawn-spawner"
import {  Config  } from "#config/config.js"
import {  Agent as AgentSvc  } from "../../src/agent/agent.js"
import {  Color  } from "#util/color.js"
import {  AppRuntime  } from "../../src/effect/app-runtime.js"
import {  test, expect, beforeAll  } from "@jest/globals"
import path from "path";
import { writeFile } from "../lib/io.js";

let AgentSvc;

const it = testEffect(Layer.mergeAll(AgentSvc.defaultLayer, CrossSpawnSpawner.defaultLayer));
const writeConfig = (dir, agent) => Effect.promise(() => writeFile(path.join(dir, "opencode.json"), JSON.stringify({
  agent
})));
it.live("agent color parsed from project config", () => Effect.gen(function* () {
  const dir = yield* tmpdirScoped();
  yield* writeConfig(dir, {
    build: {
      color: "#FFA500"
    },
    plan: {
      color: "primary"
    }
  });
  yield* Effect.gen(function* () {
    const cfg = yield* Effect.promise(() => AppRuntime.runPromise(Config.Service.use(svc => svc.get())));
    expect(cfg.agent?.["build"]?.color).toBe("#FFA500");
    expect(cfg.agent?.["plan"]?.color).toBe("primary");
  }).pipe(provideInstance(dir));
}));
it.live("Agent.get includes color from config", () => Effect.gen(function* () {
  const dir = yield* tmpdirScoped();
  yield* writeConfig(dir, {
    plan: {
      color: "#A855F7"
    },
    build: {
      color: "accent"
    }
  });
  yield* Effect.gen(function* () {
    const plan = yield* AgentSvc.Service.use(svc => svc.get("plan"));
    expect(plan?.color).toBe("#A855F7");
    const build = yield* AgentSvc.Service.use(svc => svc.get("build"));
    expect(build?.color).toBe("accent");
  }).pipe(provideInstance(dir));
}));
test("Color.hexToAnsiBold converts valid hex to ANSI", () => {
  const result = Color.hexToAnsiBold("#FFA500");
  expect(result).toBe("\x1b[38;2;255;165;0m\x1b[1m");
});
test("Color.hexToAnsiBold returns undefined for invalid hex", () => {
  expect(Color.hexToAnsiBold(undefined)).toBeUndefined();
  expect(Color.hexToAnsiBold("")).toBeUndefined();
  expect(Color.hexToAnsiBold("#FFF")).toBeUndefined();
  expect(Color.hexToAnsiBold("FFA500")).toBeUndefined();
  expect(Color.hexToAnsiBold("#GGGGGG")).toBeUndefined();
});