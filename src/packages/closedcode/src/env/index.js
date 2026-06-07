import { Context, Effect, Layer } from "effect";
import { InstanceState } from "@/effect/instance-state.js";
export class Service extends Context.Service()("@closedcode/Env") {}
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
export const defaultLayer = layer;
export * as Env from "./index.js";