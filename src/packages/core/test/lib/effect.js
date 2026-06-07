import {  test  } from "@jest/globals"
import {  Cause, Effect, Exit, Layer  } from "effect"
import * as TestClock from "effect/testing/TestClock";
import * as TestConsole from "effect/testing/TestConsole";
const body = value => Effect.suspend(() => typeof value === "function" ? value() : value);
const run = (value, layer) => Effect.gen(function* () {
  const exit = yield* body(value).pipe(Effect.scoped, Effect.provide(layer), Effect.exit);
  if (Exit.isFailure(exit)) {
    for (const err of Cause.prettyErrors(exit.cause)) {
      yield* Effect.logError(err);
    }
  }
  return yield* exit;
}).pipe(Effect.runPromise);
const make = (testLayer, liveLayer) => {
  const effect = (name, value, opts) => test(name, () => run(value, testLayer), opts);
  effect.only = (name, value, opts) => test.only(name, () => run(value, testLayer), opts);
  effect.skip = (name, value, opts) => test.skip(name, () => run(value, testLayer), opts);
  const live = (name, value, opts) => test(name, () => run(value, liveLayer), opts);
  live.only = (name, value, opts) => test.only(name, () => run(value, liveLayer), opts);
  live.skip = (name, value, opts) => test.skip(name, () => run(value, liveLayer), opts);
  return {
    effect,
    live
  };
};

// Test environment with TestClock and TestConsole
const testEnv = Layer.mergeAll(TestConsole.layer, TestClock.layer());

// Live environment - uses real clock, but keeps TestConsole for output capture
const liveEnv = TestConsole.layer;
const it = make(testEnv, liveEnv);
const testEffect = layer => make(Layer.provideMerge(layer, testEnv), Layer.provideMerge(layer, liveEnv));
export { it };
export { testEffect };