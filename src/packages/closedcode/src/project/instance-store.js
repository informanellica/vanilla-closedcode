/** @file InstanceStore Effect service: a per-directory cache that boots, caches, reloads, and disposes instances, emitting disposal events on the global bus. */
import { GlobalBus } from "#bus/global.js";
import { WorkspaceContext } from "#control-plane/workspace-context.js";
import { InstanceRef } from "#effect/instance-ref.js";
import { disposeInstance as runDisposers } from "#effect/instance-registry.js";
import { AppFileSystem } from "core/filesystem";
import { Context, Deferred, Duration, Effect, Exit, Layer, Scope } from "effect";
import { InstanceBootstrap } from "./bootstrap-service.js";
import * as Project from "./project.js";

/** Effect Context tag identifying the instance store service. */
export class Service extends Context.Service()("@closedcode/InstanceStore") {}

/**
 * Effect layer providing the InstanceStore Service.
 * Maintains a Map keyed by resolved directory whose entries hold a Deferred
 * resolving to the booted instance context, and wires up disposal so all
 * instances are cleaned up when the layer's scope closes.
 */
export const layer = Layer.effect(Service, Effect.gen(function* () {
  const project = yield* Project.Service;
  const bootstrap = yield* InstanceBootstrap.Service;
  const scope = yield* Scope.Scope;
  const cache = new Map();

  /**
   * Resolve an instance context for the input directory and run the bootstrap.
   * Uses the supplied project/worktree when present, otherwise derives them via
   * Project.fromDirectory.
   *
   * @param {Object} input - Boot input with `directory` and optional `project`/`worktree`.
   * @returns {Effect} Effect yielding the booted instance context.
   */
  const boot = input => Effect.gen(function* () {
    const ctx = input.project && input.worktree ? {
      directory: input.directory,
      worktree: input.worktree,
      project: input.project
    } : yield* project.fromDirectory(input.directory).pipe(Effect.map(result => ({
      directory: input.directory,
      worktree: result.sandbox,
      project: result.project
    })));
    yield* bootstrap.run.pipe(Effect.provideService(InstanceRef, ctx));
    return ctx;
  }).pipe(Effect.withSpan("InstanceStore.boot"));
  /**
   * Remove a cache entry, but only if it is still the current entry for the directory.
   *
   * @param {string} directory - The resolved directory key.
   * @param {Object} entry - The cache entry expected to be present.
   * @returns {Effect} Effect yielding true if the entry was removed, false if it was stale.
   */
  const removeEntry = (directory, entry) => Effect.sync(() => {
    if (cache.get(directory) !== entry) return false;
    cache.delete(directory);
    return true;
  });

  /**
   * Run boot for an entry and settle its Deferred with the resulting Exit,
   * removing the cache entry on failure.
   *
   * @param {string} directory - The resolved directory key.
   * @param {Object} input - Boot input merged with `directory`.
   * @param {Object} entry - The cache entry whose Deferred will be completed.
   * @returns {Effect} Effect that completes once the Deferred is settled.
   */
  const completeLoad = (directory, input, entry) => Effect.gen(function* () {
    const exit = yield* Effect.exit(boot({
      ...input,
      directory
    }));
    if (Exit.isFailure(exit)) yield* removeEntry(directory, entry);
    yield* Deferred.done(entry.deferred, exit).pipe(Effect.asVoid);
  });
  /**
   * Emit a `server.instance.disposed` event on the global bus.
   *
   * @param {{directory: string, project: string}} input - Directory and project id of the disposed instance.
   * @returns {Effect} Effect that emits the event.
   */
  const emitDisposed = input => Effect.sync(() => GlobalBus.emit("event", {
    directory: input.directory,
    project: input.project,
    workspace: WorkspaceContext.workspaceID,
    payload: {
      type: "server.instance.disposed",
      properties: {
        directory: input.directory
      }
    }
  }));
  /**
   * Run the registered disposers for an instance context and emit a disposed event.
   *
   * @param {Object} ctx - Instance context with `directory` and `project`.
   * @returns {Effect} Effect that performs disposal.
   */
  const disposeContext = Effect.fn("InstanceStore.disposeContext")(function* (ctx) {
    yield* Effect.logInfo("disposing instance", {
      directory: ctx.directory
    });
    yield* Effect.promise(() => runDisposers(ctx.directory));
    yield* emitDisposed({
      directory: ctx.directory,
      project: ctx.project.id
    });
  });
  /**
   * Dispose an instance and remove its cache entry, guarding against the entry
   * being replaced before and after disposal.
   *
   * @param {string} directory - The resolved directory key.
   * @param {Object} entry - The cache entry expected to be present.
   * @param {Object} ctx - The instance context to dispose.
   * @returns {Effect} Effect yielding true if the entry was disposed and removed.
   */
  const disposeEntry = Effect.fnUntraced(function* (directory, entry, ctx) {
    if (cache.get(directory) !== entry) return false;
    yield* disposeContext(ctx);
    if (cache.get(directory) !== entry) return false;
    cache.delete(directory);
    return true;
  });
  /**
   * Load the instance for the input directory, returning the cached context if
   * present or booting a new one. Boot runs forked in the layer scope so
   * concurrent callers share the same Deferred.
   *
   * @param {Object} input - Load input with `directory` and optional `project`/`worktree`.
   * @returns {Effect} Effect yielding the loaded instance context.
   */
  const load = input => {
    const directory = AppFileSystem.resolve(input.directory);
    return Effect.uninterruptibleMask(restore => Effect.gen(function* () {
      const existing = cache.get(directory);
      if (existing) return yield* restore(Deferred.await(existing.deferred));
      const entry = {
        deferred: Deferred.makeUnsafe()
      };
      cache.set(directory, entry);
      yield* Effect.gen(function* () {
        yield* Effect.logInfo("creating instance", {
          directory
        });
        yield* completeLoad(directory, input, entry);
      }).pipe(Effect.forkIn(scope, {
        startImmediately: true
      }));
      return yield* restore(Deferred.await(entry.deferred));
    })).pipe(Effect.withSpan("InstanceStore.load"));
  };
  /**
   * Reload the instance for the input directory: install a fresh cache entry,
   * dispose the previous instance (if any) once it has finished loading, then
   * boot anew.
   *
   * @param {Object} input - Reload input with `directory` and optional `project`.
   * @returns {Effect} Effect yielding the reloaded instance context.
   */
  const reload = input => {
    const directory = AppFileSystem.resolve(input.directory);
    return Effect.uninterruptibleMask(restore => Effect.gen(function* () {
      const previous = cache.get(directory);
      const entry = {
        deferred: Deferred.makeUnsafe()
      };
      cache.set(directory, entry);
      yield* Effect.gen(function* () {
        yield* Effect.logInfo("reloading instance", {
          directory
        });
        if (previous) {
          yield* Deferred.await(previous.deferred).pipe(Effect.ignore);
          yield* Effect.promise(() => runDisposers(directory));
          yield* emitDisposed({
            directory,
            project: input.project?.id
          });
        }
        yield* completeLoad(directory, input, entry);
      }).pipe(Effect.forkIn(scope, {
        startImmediately: true
      }));
      return yield* restore(Deferred.await(entry.deferred));
    })).pipe(Effect.withSpan("InstanceStore.reload"));
  };
  /**
   * Dispose the given instance context. Only the cached entry matching this
   * exact context is removed; stale or mismatched contexts are ignored.
   *
   * @param {Object} ctx - The instance context to dispose.
   * @returns {Effect} Effect that performs the disposal.
   */
  const dispose = Effect.fn("InstanceStore.dispose")(function* (ctx) {
    const entry = cache.get(ctx.directory);
    if (!entry) return yield* disposeContext(ctx);
    const exit = yield* Deferred.await(entry.deferred).pipe(Effect.exit);
    if (Exit.isFailure(exit)) return yield* removeEntry(ctx.directory, entry).pipe(Effect.asVoid);
    if (exit.value !== ctx) return;
    yield* disposeEntry(ctx.directory, entry, ctx).pipe(Effect.asVoid);
  });
  /**
   * Dispose every cached instance once, awaiting each entry's load result and
   * logging/cleaning up failures. Wrapped by `cachedDisposeAll` so concurrent
   * calls share a single run.
   *
   * @returns {Effect} Effect that disposes all cached instances.
   */
  const disposeAllOnce = Effect.fnUntraced(function* () {
    yield* Effect.logInfo("disposing all instances");
    yield* Effect.forEach([...cache.entries()], item => Effect.gen(function* () {
      const exit = yield* Deferred.await(item[1].deferred).pipe(Effect.exit);
      if (Exit.isFailure(exit)) {
        yield* Effect.logWarning("instance dispose failed", {
          key: item[0],
          cause: exit.cause
        });
        yield* removeEntry(item[0], item[1]);
        return;
      }
      yield* disposeEntry(item[0], item[1], exit.value);
    }), {
      discard: true
    });
  });
  // TTL-cached wrapper so simultaneous disposeAll calls reuse one in-flight run.
  const cachedDisposeAll = yield* Effect.cachedWithTTL(disposeAllOnce(), Duration.zero);

  /**
   * Dispose all cached instances, deduplicating concurrent invocations.
   *
   * @returns {Effect} Effect that disposes all instances.
   */
  const disposeAll = Effect.fn("InstanceStore.disposeAll")(function* () {
    return yield* cachedDisposeAll;
  });

  /**
   * Load the instance for the input directory and run the given effect with its
   * context provided as InstanceRef.
   *
   * @param {Object} input - Load input with `directory`.
   * @param {Effect} effect - The effect to run within the loaded instance context.
   * @returns {Effect} Effect yielding the result of `effect`.
   */
  const provide = (input, effect) => load(input).pipe(Effect.flatMap(ctx => effect.pipe(Effect.provideService(InstanceRef, ctx))));
  yield* Effect.addFinalizer(() => disposeAll().pipe(Effect.ignore));
  return Service.of({
    load,
    reload,
    dispose,
    disposeAll,
    provide
  });
}));

/** InstanceStore layer with the Project service dependency provided by its default layer. */
export const defaultLayer = layer.pipe(Layer.provide(Project.defaultLayer));
export * as InstanceStore from "./instance-store.js";