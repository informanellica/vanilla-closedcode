import { Effect, Fiber, ScopedCache, Context } from "effect";
import * as EffectLogger from "core/effect/logger";
import { Instance } from "@/project/instance.js";
import { LocalContext } from "@/util/local-context.js";
import { InstanceRef, WorkspaceRef } from "./instance-ref.js";
import { registerDisposer } from "./instance-registry.js";
import { WorkspaceContext } from "@/control-plane/workspace-context.js";
const TypeId = "~closedcode/InstanceState";
export const bind = fn => {
  try {
    return Instance.bind(fn);
  } catch (err) {
    if (!(err instanceof LocalContext.NotFound)) throw err;
  }
  const fiber = Fiber.getCurrent();
  const ctx = fiber ? Context.getReferenceUnsafe(fiber.context, InstanceRef) : undefined;
  if (!ctx) return fn;
  return (...args) => Instance.restore(ctx, () => fn(...args));
};
export const context = Effect.gen(function* () {
  return (yield* InstanceRef) ?? Instance.current;
});
export const workspaceID = Effect.gen(function* () {
  return (yield* WorkspaceRef) ?? WorkspaceContext.workspaceID;
});
export const directory = Effect.map(context, ctx => ctx.directory);
export const make = init => Effect.gen(function* () {
  const cache = yield* ScopedCache.make({
    capacity: Number.POSITIVE_INFINITY,
    lookup: () => Effect.gen(function* () {
      return yield* init(yield* context);
    })
  });
  const off = registerDisposer(directory => Effect.runPromise(ScopedCache.invalidate(cache, directory).pipe(Effect.provide(EffectLogger.layer))));
  yield* Effect.addFinalizer(() => Effect.sync(off));
  return {
    [TypeId]: TypeId,
    cache
  };
});
export const get = self => Effect.gen(function* () {
  return yield* ScopedCache.get(self.cache, yield* directory);
});
export const use = (self, select) => Effect.map(get(self), select);
export const useEffect = (self, select) => Effect.flatMap(get(self), select);
export const has = self => Effect.gen(function* () {
  return yield* ScopedCache.has(self.cache, yield* directory);
});
export const invalidate = self => Effect.gen(function* () {
  return yield* ScopedCache.invalidate(self.cache, yield* directory);
});
export * as InstanceState from "./instance-state.js";