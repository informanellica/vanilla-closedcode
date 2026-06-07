import { GlobalBus } from "@/bus/global.js";
import { WorkspaceContext } from "@/control-plane/workspace-context.js";
import { InstanceRef } from "@/effect/instance-ref.js";
import { disposeInstance as runDisposers } from "@/effect/instance-registry.js";
import { AppFileSystem } from "core/filesystem";
import { Context, Deferred, Duration, Effect, Exit, Layer, Scope } from "effect";
import { InstanceBootstrap } from "./bootstrap-service.js";
import * as Project from "./project.js";
export class Service extends Context.Service()("@closedcode/InstanceStore") {}
export const layer = Layer.effect(Service, Effect.gen(function* () {
  const project = yield* Project.Service;
  const bootstrap = yield* InstanceBootstrap.Service;
  const scope = yield* Scope.Scope;
  const cache = new Map();
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
  const removeEntry = (directory, entry) => Effect.sync(() => {
    if (cache.get(directory) !== entry) return false;
    cache.delete(directory);
    return true;
  });
  const completeLoad = (directory, input, entry) => Effect.gen(function* () {
    const exit = yield* Effect.exit(boot({
      ...input,
      directory
    }));
    if (Exit.isFailure(exit)) yield* removeEntry(directory, entry);
    yield* Deferred.done(entry.deferred, exit).pipe(Effect.asVoid);
  });
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
  const disposeEntry = Effect.fnUntraced(function* (directory, entry, ctx) {
    if (cache.get(directory) !== entry) return false;
    yield* disposeContext(ctx);
    if (cache.get(directory) !== entry) return false;
    cache.delete(directory);
    return true;
  });
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
  const dispose = Effect.fn("InstanceStore.dispose")(function* (ctx) {
    const entry = cache.get(ctx.directory);
    if (!entry) return yield* disposeContext(ctx);
    const exit = yield* Deferred.await(entry.deferred).pipe(Effect.exit);
    if (Exit.isFailure(exit)) return yield* removeEntry(ctx.directory, entry).pipe(Effect.asVoid);
    if (exit.value !== ctx) return;
    yield* disposeEntry(ctx.directory, entry, ctx).pipe(Effect.asVoid);
  });
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
  const cachedDisposeAll = yield* Effect.cachedWithTTL(disposeAllOnce(), Duration.zero);
  const disposeAll = Effect.fn("InstanceStore.disposeAll")(function* () {
    return yield* cachedDisposeAll;
  });
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
export const defaultLayer = layer.pipe(Layer.provide(Project.defaultLayer));
export * as InstanceStore from "./instance-store.js";