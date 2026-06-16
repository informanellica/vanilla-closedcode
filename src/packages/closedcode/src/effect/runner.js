/** @file Single-slot async work runner: serializes a "run" against an optional long-lived "shell", with cancellation, via Effect fibers and a synchronized state machine. */
import { Cause, Deferred, Effect, Exit, Fiber, Schema, SynchronizedRef } from "effect";
/** Tagged error used internally to signal that a run/shell was cancelled rather than failed. */
export class Cancelled extends Schema.TaggedErrorClass()("RunnerCancelled", {}) {}
/**
 * Create a runner that owns one execution slot and a small state machine
 * (Idle / Running / Shell / ShellThenRun), forking work into the given scope.
 * @param {Scope} scope - Effect scope into which forked work is attached.
 * @param {Object} opts - Optional callbacks/effects: onIdle, onBusy, onInterrupt effects and a busy() callback.
 * @returns {Object} Runner with `state`/`busy` getters and `ensureRunning`, `startShell`, `cancel` members.
 */
export const make = (scope, opts) => {
  const ref = SynchronizedRef.makeUnsafe({
    _tag: "Idle"
  });
  const idle = opts?.onIdle ?? Effect.void;
  const busy = opts?.onBusy ?? Effect.void;
  const onInterrupt = opts?.onInterrupt;
  let ids = 0;
  /** Read the current runner state unsafely (synchronously). @returns {Object} The tagged state value. */
  const state = () => SynchronizedRef.getUnsafe(ref);
  /** Allocate the next monotonic run/shell id. @returns {number} The new id. */
  const next = () => {
    ids += 1;
    return ids;
  };
  /**
   * Resolve a Deferred from an Exit, mapping interrupt-only failures to a Cancelled error.
   * @param {Deferred} done - The Deferred to settle.
   * @param {Exit} exit - The Exit describing how the work ended.
   * @returns {Effect} Effect that completes the Deferred.
   */
  const complete = (done, exit) => Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause) ? Deferred.fail(done, new Cancelled()).pipe(Effect.asVoid) : Deferred.done(done, exit).pipe(Effect.asVoid);
  /**
   * Await a run's Deferred, converting a Cancelled result into the onInterrupt effect (or a die).
   * @param {Deferred} done - The Deferred to await.
   * @returns {Effect} Effect yielding the run result.
   */
  const awaitDone = done => Deferred.await(done).pipe(Effect.catchTag("RunnerCancelled", e => onInterrupt ?? Effect.die(e)));
  /** Run the onIdle effect only if the runner is currently Idle. @returns {Effect} The idle effect or void. */
  const idleIfCurrent = () => SynchronizedRef.modify(ref, st => [st._tag === "Idle" ? idle : Effect.void, st]).pipe(Effect.flatten);
  /**
   * Transition out of a finished run (matching by id), running onIdle and settling the Deferred.
   * @param {number} id - The run id that finished.
   * @param {Deferred} done - The run's Deferred to settle.
   * @param {Exit} exit - The Exit describing how the run ended.
   * @returns {Effect} Effect that performs the transition.
   */
  const finishRun = (id, done, exit) => SynchronizedRef.modify(ref, st => [Effect.gen(function* () {
    if (st._tag === "Running" && st.run.id === id) yield* idle;
    yield* complete(done, exit);
  }), st._tag === "Running" && st.run.id === id ? {
    _tag: "Idle"
  } : st]).pipe(Effect.flatten);
  /**
   * Fork the given work into the scope as a run, wiring its exit to finishRun.
   * @param {Effect} work - The effect to execute as the run.
   * @param {Deferred} done - The Deferred to settle when the run ends.
   * @returns {Effect} Effect yielding the run record {id, done, fiber}.
   */
  const startRun = (work, done) => Effect.gen(function* () {
    const id = next();
    const fiber = yield* work.pipe(Effect.onExit(exit => finishRun(id, done, exit)), Effect.forkIn(scope));
    return {
      id,
      done,
      fiber
    };
  });
  /**
   * Handle a shell ending (matching by id): go Idle for a plain Shell, or start the queued run for ShellThenRun.
   * @param {number} id - The shell id that ended.
   * @returns {Effect} Effect performing the transition.
   */
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
  /**
   * Gracefully stop a shell: await its readiness, mark it cancelled, then interrupt its fiber.
   * @param {Object} shell - The shell record {id, cancelled, ready, fiber}.
   * @returns {Effect} Effect that stops the shell.
   */
  const stopShell = shell => Effect.gen(function* () {
    if (shell.ready) yield* shell.ready.await.pipe(Effect.exit, Effect.asVoid);
    yield* Deferred.succeed(shell.cancelled, undefined).pipe(Effect.asVoid);
    yield* Fiber.interrupt(shell.fiber);
  });
  /**
   * Ensure a run is in flight, joining the existing run or queuing behind a shell as appropriate.
   * @param {Effect} work - The effect to run.
   * @returns {Effect} Effect that resolves when the run completes (awaitDone semantics).
   */
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
  /**
   * Start a long-lived shell; fails if the runner is not Idle. Resolves with the shell's
   * result, mapping interrupt/cancellation into onInterrupt or a Cancelled die.
   * @param {Effect} work - The shell effect to run.
   * @param {Object} ready - A Deferred-like readiness handle awaited before cancellation.
   * @returns {Effect} Effect yielding the shell's success value.
   */
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
  /**
   * Cancel whatever is in flight (run and/or shell) and return the runner to Idle.
   * @type {Effect}
   */
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
    /** Current tagged runner state. @returns {Object} The state value. */
    get state() {
      return state();
    },
    /** Whether the runner is doing anything (not Idle). @returns {boolean} True when busy. */
    get busy() {
      return state()._tag !== "Idle";
    },
    ensureRunning,
    startShell,
    cancel
  };
};
export * as Runner from "./runner.js";