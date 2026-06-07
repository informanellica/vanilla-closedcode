import { Cause, Deferred, Effect, Exit, Fiber, Schema, SynchronizedRef } from "effect";
export class Cancelled extends Schema.TaggedErrorClass()("RunnerCancelled", {}) {}
export const make = (scope, opts) => {
  const ref = SynchronizedRef.makeUnsafe({
    _tag: "Idle"
  });
  const idle = opts?.onIdle ?? Effect.void;
  const busy = opts?.onBusy ?? Effect.void;
  const onInterrupt = opts?.onInterrupt;
  let ids = 0;
  const state = () => SynchronizedRef.getUnsafe(ref);
  const next = () => {
    ids += 1;
    return ids;
  };
  const complete = (done, exit) => Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause) ? Deferred.fail(done, new Cancelled()).pipe(Effect.asVoid) : Deferred.done(done, exit).pipe(Effect.asVoid);
  const awaitDone = done => Deferred.await(done).pipe(Effect.catchTag("RunnerCancelled", e => onInterrupt ?? Effect.die(e)));
  const idleIfCurrent = () => SynchronizedRef.modify(ref, st => [st._tag === "Idle" ? idle : Effect.void, st]).pipe(Effect.flatten);
  const finishRun = (id, done, exit) => SynchronizedRef.modify(ref, st => [Effect.gen(function* () {
    if (st._tag === "Running" && st.run.id === id) yield* idle;
    yield* complete(done, exit);
  }), st._tag === "Running" && st.run.id === id ? {
    _tag: "Idle"
  } : st]).pipe(Effect.flatten);
  const startRun = (work, done) => Effect.gen(function* () {
    const id = next();
    const fiber = yield* work.pipe(Effect.onExit(exit => finishRun(id, done, exit)), Effect.forkIn(scope));
    return {
      id,
      done,
      fiber
    };
  });
  const finishShell = id => SynchronizedRef.modifyEffect(ref, Effect.fnUntraced(function* (st) {
    if (st._tag === "Shell" && st.shell.id === id) {
      return [idle, {
        _tag: "Idle"
      }];
    }
    if (st._tag === "ShellThenRun" && st.shell.id === id) {
      const run = yield* startRun(st.run.work, st.run.done);
      return [Effect.void, {
        _tag: "Running",
        run
      }];
    }
    return [Effect.void, st];
  })).pipe(Effect.flatten);
  const stopShell = shell => Effect.gen(function* () {
    if (shell.ready) yield* shell.ready.await.pipe(Effect.exit, Effect.asVoid);
    yield* Deferred.succeed(shell.cancelled, undefined).pipe(Effect.asVoid);
    yield* Fiber.interrupt(shell.fiber);
  });
  const ensureRunning = work => SynchronizedRef.modifyEffect(ref, Effect.fnUntraced(function* (st) {
    switch (st._tag) {
      case "Running":
      case "ShellThenRun":
        return [awaitDone(st.run.done), st];
      case "Shell":
        {
          const run = {
            id: next(),
            done: yield* Deferred.make(),
            work
          };
          return [awaitDone(run.done), {
            _tag: "ShellThenRun",
            shell: st.shell,
            run
          }];
        }
      case "Idle":
        {
          const done = yield* Deferred.make();
          const run = yield* startRun(work, done);
          return [awaitDone(done), {
            _tag: "Running",
            run
          }];
        }
    }
  })).pipe(Effect.flatten);
  const startShell = (work, ready) => SynchronizedRef.modifyEffect(ref, Effect.fnUntraced(function* (st) {
    if (st._tag !== "Idle") {
      return [Effect.sync(() => {
        if (opts?.busy) opts.busy();
        throw new Error("Runner is busy");
      }), st];
    }
    yield* busy;
    const id = next();
    const cancelled = yield* Deferred.make();
    const fiber = yield* work.pipe(Effect.ensuring(finishShell(id)), Effect.forkChild);
    const shell = {
      id,
      cancelled,
      ready,
      fiber
    };
    return [Effect.gen(function* () {
      const exit = yield* Fiber.await(fiber);
      if (Exit.isSuccess(exit)) return exit.value;
      if (Cause.hasInterruptsOnly(exit.cause) || (yield* Deferred.isDone(cancelled)) && Cause.hasInterrupts(exit.cause) && !Cause.hasDies(exit.cause)) {
        if (onInterrupt) return yield* onInterrupt;
        return yield* Effect.die(new Cancelled());
      }
      return yield* Effect.failCause(exit.cause);
    }), {
      _tag: "Shell",
      shell
    }];
  })).pipe(Effect.flatten);
  const cancel = SynchronizedRef.modify(ref, st => {
    switch (st._tag) {
      case "Idle":
        return [Effect.void, st];
      case "Running":
        return [Effect.gen(function* () {
          yield* Fiber.interrupt(st.run.fiber);
          yield* Deferred.await(st.run.done).pipe(Effect.exit, Effect.asVoid);
          yield* idleIfCurrent();
        }), {
          _tag: "Idle"
        }];
      case "Shell":
        return [Effect.gen(function* () {
          yield* stopShell(st.shell);
          yield* idleIfCurrent();
        }), {
          _tag: "Idle"
        }];
      case "ShellThenRun":
        return [Effect.gen(function* () {
          yield* stopShell(st.shell);
          yield* Deferred.fail(st.run.done, new Cancelled()).pipe(Effect.asVoid);
          yield* idleIfCurrent();
        }), {
          _tag: "Idle"
        }];
    }
  }).pipe(Effect.flatten);
  return {
    get state() {
      return state();
    },
    get busy() {
      return state()._tag !== "Idle";
    },
    ensureRunning,
    startShell,
    cancel
  };
};
export * as Runner from "./runner.js";