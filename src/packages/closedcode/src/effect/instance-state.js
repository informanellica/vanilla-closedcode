/** @file InstanceState: per-instance lazily-initialized state cached by directory, with helpers to resolve the current instance/workspace context, build the cache, and read/invalidate entries. */
import { Effect, Fiber, ScopedCache, Context } from "effect";
import * as EffectLogger from "core/effect/logger";
import { Instance } from "#project/instance.js";
import { LocalContext } from "#util/local-context.js";
import { InstanceRef, WorkspaceRef } from "./instance-ref.js";
import { registerDisposer } from "./instance-registry.js";
import { WorkspaceContext } from "#control-plane/workspace-context.js";
const TypeId = "~closedcode/InstanceState";
/**
 * Bind a callback to the current instance context so it stays attached when
 * invoked later. Prefers the legacy `Instance.bind`; if no legacy context
 * exists, falls back to the InstanceRef captured from the current fiber.
 * @param {Function} fn - The callback to bind.
 * @returns {Function} A wrapped callback that restores the instance context, or the original when no context is available.
 */
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
/** Effect resolving the current instance: InstanceRef if set, otherwise the legacy Instance.current. */
export const context = Effect.gen(function* () {
  return (yield* InstanceRef) ?? Instance.current;
});
/** Effect resolving the current workspace ID: WorkspaceRef if set, otherwise the legacy WorkspaceContext.workspaceID. */
export const workspaceID = Effect.gen(function* () {
  return (yield* WorkspaceRef) ?? WorkspaceContext.workspaceID;
});
/** Effect resolving the current instance's directory. */
export const directory = Effect.map(context, ctx => ctx.directory);
/**
 * Create a per-instance state holder backed by a ScopedCache keyed on directory.
 * Each directory's state is lazily initialized via `init` and invalidated when
 * its instance is disposed.
 * @param {Function} init - Effect-returning initializer receiving the instance, producing the state value.
 * @returns {Effect} Effect resolving to a state handle (carrying the internal cache).
 */
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
/**
 * Get (initializing if needed) the state for the current instance directory.
 * @param {Object} self - State handle from `make`.
 * @returns {Effect} Effect resolving to the cached state value.
 */
export const get = self => Effect.gen(function* () {
  return yield* ScopedCache.get(self.cache, yield* directory);
});
/**
 * Read the current instance's state and project it through a selector.
 * @param {Object} self - State handle from `make`.
 * @param {Function} select - Selector mapping the state to a derived value.
 * @returns {Effect} Effect resolving to the selected value.
 */
export const use = (self, select) => Effect.map(get(self), select);
/**
 * Read the current instance's state and flat-map it through an Effect-returning selector.
 * @param {Object} self - State handle from `make`.
 * @param {Function} select - Effect-returning selector applied to the state.
 * @returns {Effect} Effect resolving to the selector's result.
 */
export const useEffect = (self, select) => Effect.flatMap(get(self), select);
/**
 * Check whether state is already cached for the current instance directory.
 * @param {Object} self - State handle from `make`.
 * @returns {Effect} Effect resolving to true when present.
 */
export const has = self => Effect.gen(function* () {
  return yield* ScopedCache.has(self.cache, yield* directory);
});
/**
 * Invalidate the cached state for the current instance directory.
 * @param {Object} self - State handle from `make`.
 * @returns {Effect} Effect that completes once the entry is invalidated.
 */
export const invalidate = self => Effect.gen(function* () {
  return yield* ScopedCache.invalidate(self.cache, yield* directory);
});
export * as InstanceState from "./instance-state.js";