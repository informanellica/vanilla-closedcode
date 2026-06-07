import {  test  } from "@jest/globals"
import {  Cause, Effect, Exit, Layer  } from "effect"
import * as TestClock from "effect/testing/TestClock";
import * as TestConsole from "effect/testing/TestConsole";
import {  withTmpdirInstance  } from "../fixture/fixture.js"
function isInstanceOptions(options) {
  return !!options && typeof options === "object" && ("git" in options || "config" in options);
}
function instanceArgs(options, testOptions) {
  if (typeof options === "number") return {
    instanceOptions: undefined,
    testOptions: options
  };
  if (isInstanceOptions(options)) return {
    instanceOptions: options,
    testOptions
  };
  return {
    instanceOptions: undefined,
    testOptions: options
  };
}
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
  const instance = (name, value, options, opts) => {
    const args = instanceArgs(options, opts);
    return test(name, () => run(body(value).pipe(withTmpdirInstance(args.instanceOptions)), liveLayer), args.testOptions);
  };
  instance.only = (name, value, options, opts) => {
    const args = instanceArgs(options, opts);
    return test.only(name, () => run(body(value).pipe(withTmpdirInstance(args.instanceOptions)), liveLayer), args.testOptions);
  };
  instance.skip = (name, value, options, opts) => {
    const args = instanceArgs(options, opts);
    return test.skip(name, () => run(body(value).pipe(withTmpdirInstance(args.instanceOptions)), liveLayer), args.testOptions);
  };
  return {
    effect,
    live,
    instance
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