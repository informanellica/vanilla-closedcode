import { Effect, Exit } from "effect";
import { WorkspaceContext } from "@/control-plane/workspace-context.js";
import { Instance } from "@/project/instance.js";
import { LocalContext } from "@/util/local-context.js";
import { InstanceRef, WorkspaceRef } from "./instance-ref.js";
import { attachWith } from "./run-service.js";
function restore(instance, workspace, fn) {
  if (instance && workspace !== undefined) {
    return WorkspaceContext.restore(workspace, () => Instance.restore(instance, fn));
  }
  if (instance) return Instance.restore(instance, fn);
  if (workspace !== undefined) return WorkspaceContext.restore(workspace, fn);
  return fn();
}

/**
 * Bridge from Effect into a Promise-returning JS callback while installing
 * legacy `Instance.context` and `WorkspaceContext` AsyncLocalStorage for
 * the duration of the callback. Effect's `InstanceRef`/`WorkspaceRef` do
 * not propagate across async/await boundaries inside `Effect.promise(() =>
 * async fn)` callbacks that re-enter Effect via `AppRuntime.runPromise`,
 * but Node's AsyncLocalStorage does. Use this whenever an Effect crosses
 * into JS that may itself spawn new Effect runtimes (workspace adapters,
 * legacy plugins, etc.).
 *
 * Mirrors `Effect.promise` but restores legacy ALS first.
 */
export const fromPromise = fn => Effect.gen(function* () {
  const instance = yield* InstanceRef;
  const workspace = yield* WorkspaceRef;
  return yield* Effect.promise(() => Promise.resolve(restore(instance, workspace, () => fn())));
});
export function make() {
  return Effect.gen(function* () {
    const ctx = yield* Effect.context();
    const value = yield* InstanceRef;
    const instance = value ?? (() => {
      try {
        return Instance.current;
      } catch (err) {
        if (!(err instanceof LocalContext.NotFound)) throw err;
      }
    })();
    const workspace = (yield* WorkspaceRef) ?? WorkspaceContext.workspaceID;
    const attach = effect => attachWith(effect, {
      instance,
      workspace
    });
    const wrap = effect => attach(effect).pipe(Effect.provide(ctx));
    return {
      promise: effect => restore(instance, workspace, () => Effect.runPromise(wrap(effect))),
      fork: effect => restore(instance, workspace, () => Effect.runFork(wrap(effect))),
      run: effect => Effect.callback(resume => {
        restore(instance, workspace, () => Effect.runPromiseExit(wrap(effect)).then(exit => resume(Exit.isSuccess(exit) ? Effect.succeed(exit.value) : Effect.failCause(exit.cause))));
      })
    };
  });
}
export * as EffectBridge from "./bridge.js";