import {  Context, Effect, Layer, Logger  } from "effect"
import {  provideInstance, tmpdirScoped  } from "../fixture/fixture.js"
import {  testEffect  } from "../lib/effect.js"
import {  CrossSpawnSpawner  } from "core/cross-spawn-spawner"
import {  AppRuntime  } from "../../src/effect/app-runtime.js"
import {  EffectBridge  } from "#effect/bridge.js"
import {  InstanceRef  } from "../../src/effect/instance-ref.js"
import * as EffectLogger from "core/effect/logger";
import {  makeRuntime  } from "../../src/effect/run-service.js"
import {  expect, beforeAll  } from "@jest/globals"
const it = testEffect(CrossSpawnSpawner.defaultLayer);
function check(loggers) {
  return {
    defaultLogger: loggers.has(Logger.defaultLogger),
    tracerLogger: loggers.has(Logger.tracerLogger),
    effectLogger: loggers.has(EffectLogger.logger),
    size: loggers.size
  };
}
it.live("makeRuntime installs EffectLogger through Observability.layer", () => Effect.gen(function* () {
  class Dummy extends Context.Service()("@test/Dummy") {}
  const layer = Layer.effect(Dummy, Effect.gen(function* () {
    return Dummy.of({
      current: () => Effect.map(Effect.service(Logger.CurrentLoggers), check)
    });
  }));
  const current = yield* Effect.promise(() => makeRuntime(Dummy, layer).runPromise(svc => svc.current()));
  expect(current.effectLogger).toBe(true);
  expect(current.defaultLogger).toBe(false);
}));
it.live("AppRuntime also installs EffectLogger through Observability.layer", () => Effect.gen(function* () {
  const current = yield* Effect.promise(() => AppRuntime.runPromise(Effect.map(Effect.service(Logger.CurrentLoggers), check)));
  expect(current.effectLogger).toBe(true);
  expect(current.defaultLogger).toBe(false);
}));
it.live("AppRuntime attaches InstanceRef from ALS", () => Effect.gen(function* () {
  const dir = yield* tmpdirScoped({
    git: true
  });
  const current = yield* Effect.promise(() => AppRuntime.runPromise(Effect.gen(function* () {
    return (yield* InstanceRef)?.directory;
  }))).pipe(provideInstance(dir));
  expect(current).toBe(dir);
}));
it.live("EffectBridge preserves logger and instance context across async boundaries", () => Effect.gen(function* () {
  const dir = yield* tmpdirScoped({
    git: true
  });
  const result = yield* Effect.promise(() => AppRuntime.runPromise(Effect.gen(function* () {
    const bridge = yield* EffectBridge.make();
    return yield* Effect.promise(() => Promise.resolve().then(() => bridge.promise(Effect.gen(function* () {
      return {
        directory: (yield* InstanceRef)?.directory,
        ...check(yield* Effect.service(Logger.CurrentLoggers))
      };
    }))));
  }))).pipe(provideInstance(dir));
  expect(result.directory).toBe(dir);
  expect(result.effectLogger).toBe(true);
  expect(result.defaultLogger).toBe(false);
}));