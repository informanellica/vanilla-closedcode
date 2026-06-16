/** @file Env service: a per-instance, mutable snapshot of process environment variables with get/all/set/remove. */
import { Context, Effect, Layer } from "effect";
import { InstanceState } from "#effect/instance-state.js";
/** Effect service tag for environment-variable access. */
export class Service extends Context.Service()("@closedcode/Env") {}
/**
 * Layer providing the Env service, seeded from a snapshot of `process.env`.
 * Exposes get(key), all(), set(key, value) and remove(key).
 * @type {Layer}
 */
export const layer = Layer.effect(Service, Effect.gen(function* () {
  const state = yield* InstanceState.make(Effect.fn("Env.state")(() => Effect.succeed({
    ...process.env
  })));
  const get = Effect.fn("Env.get")(key => InstanceState.use(state, env => env[key]));
  const all = Effect.fn("Env.all")(() => InstanceState.get(state));
  const set = Effect.fn("Env.set")(function* (key, value) {
    const env = yield* InstanceState.get(state);
    env[key] = value;
  });
  const remove = Effect.fn("Env.remove")(function* (key) {
    const env = yield* InstanceState.get(state);
    delete env[key];
  });
  return Service.of({
    get,
    all,
    set,
    remove
  });
}));
/** Default Env layer (same as `layer`). @type {Layer} */
export const defaultLayer = layer;
export * as Env from "./index.js";