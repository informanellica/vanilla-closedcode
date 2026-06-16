/** @file Run-service helpers: attach the ambient instance/workspace context to effects and build per-service ManagedRuntimes whose run methods auto-attach that context. */
import { Effect, Fiber, Layer, ManagedRuntime } from "effect";
import * as Context from "effect/Context";
import { Instance } from "#project/instance.js";
import { LocalContext } from "#util/local-context.js";
import { InstanceRef, WorkspaceRef } from "./instance-ref.js";
import * as Observability from "core/effect/observability";
import { WorkspaceContext } from "#control-plane/workspace-context.js";
import { memoMap } from "core/effect/memo-map";
/**
 * Provide the given instance and/or workspace references to an effect, omitting
 * whichever is absent.
 * @param {Effect} effect - The effect to augment.
 * @param {Object} refs - { instance, workspace } references to provide (either may be undefined).
 * @returns {Effect} The effect with the available references provided.
 */
export function attachWith(effect, refs) {
  if (!refs.instance && !refs.workspace) return effect;
  if (!refs.instance) return effect.pipe(Effect.provideService(WorkspaceRef, refs.workspace));
  if (!refs.workspace) return effect.pipe(Effect.provideService(InstanceRef, refs.instance));
  return effect.pipe(Effect.provideService(InstanceRef, refs.instance), Effect.provideService(WorkspaceRef, refs.workspace));
}
/**
 * Attach the ambient instance/workspace context to an effect, resolving each
 * from the legacy WorkspaceContext/Instance, then falling back to the current
 * fiber's InstanceRef/WorkspaceRef references.
 * @param {Effect} effect - The effect to augment.
 * @returns {Effect} The effect with the resolved references provided.
 */
export function attach(effect) {
  const workspace = WorkspaceContext.workspaceID;
  const instance = (() => {
    try {
      return Instance.current;
    } catch (err) {
      if (!(err instanceof LocalContext.NotFound)) throw err;
    }
  })();
  if (instance && workspace !== undefined) return attachWith(effect, {
    instance,
    workspace
  });
  const fiber = Fiber.getCurrent();
  return attachWith(effect, {
    instance: instance ?? (fiber ? Context.getReferenceUnsafe(fiber.context, InstanceRef) : undefined),
    workspace: workspace ?? (fiber ? Context.getReferenceUnsafe(fiber.context, WorkspaceRef) : undefined)
  });
}
/**
 * Build a lazily-initialized ManagedRuntime for a single service. The returned
 * runners accept a callback `fn`, run it against the service (via `service.use`)
 * with the ambient instance/workspace context attached, and share one runtime
 * created on first use.
 * @param {Object} service - The service tag, providing a `use(fn)` helper.
 * @param {Layer} layer - The layer providing the service.
 * @returns {Object} An object with runSync, runPromiseExit, runPromise, runFork, and runCallback runners.
 */
export function makeRuntime(service, layer) {
  let rt;
  const getRuntime = () => rt ??= ManagedRuntime.make(Layer.provideMerge(layer, Observability.layer), {
    memoMap
  });
  return {
    runSync: fn => getRuntime().runSync(attach(service.use(fn))),
    runPromiseExit: (fn, options) => getRuntime().runPromiseExit(attach(service.use(fn)), options),
    runPromise: (fn, options) => getRuntime().runPromise(attach(service.use(fn)), options),
    runFork: fn => getRuntime().runFork(attach(service.use(fn))),
    runCallback: fn => getRuntime().runCallback(attach(service.use(fn)))
  };
}