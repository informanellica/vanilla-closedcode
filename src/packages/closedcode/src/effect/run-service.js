import { Effect, Fiber, Layer, ManagedRuntime } from "effect";
import * as Context from "effect/Context";
import { Instance } from "#project/instance.js";
import { LocalContext } from "#util/local-context.js";
import { InstanceRef, WorkspaceRef } from "./instance-ref.js";
import * as Observability from "core/effect/observability";
import { WorkspaceContext } from "#control-plane/workspace-context.js";
import { memoMap } from "core/effect/memo-map";
export function attachWith(effect, refs) {
  if (!refs.instance && !refs.workspace) return effect;
  if (!refs.instance) return effect.pipe(Effect.provideService(WorkspaceRef, refs.workspace));
  if (!refs.workspace) return effect.pipe(Effect.provideService(InstanceRef, refs.instance));
  return effect.pipe(Effect.provideService(InstanceRef, refs.instance), Effect.provideService(WorkspaceRef, refs.workspace));
}
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