/** @file Tracks the per-session run state: one Runner per active session, with busy/idle status reporting and cancellation. */
import { InstanceState } from "#effect/instance-state.js";
import { Runner } from "#effect/runner.js";
import { Effect, Layer, Scope, Context } from "effect";
import * as Session from "./session.js";
import { SessionStatus } from "./status.js";
/** Effect service tag for the session run-state manager. */
export class Service extends Context.Service()("@closedcode/SessionRunState") {}
/** Layer that builds the SessionRunState service: keeps a map of session ID to Runner. */
export const layer = Layer.effect(Service, Effect.gen(function* () {
  const status = yield* SessionStatus.Service;
  const state = yield* InstanceState.make(Effect.fn("SessionRunState.state")(function* () {
    const scope = yield* Scope.Scope;
    const runners = new Map();
    yield* Effect.addFinalizer(Effect.fnUntraced(function* () {
      yield* Effect.forEach(runners.values(), runner => runner.cancel, {
        concurrency: "unbounded",
        discard: true
      });
      runners.clear();
    }));
    return {
      runners,
      scope
    };
  }));
  /**
   * Gets the existing Runner for a session or lazily creates one that wires
   * busy/idle status updates and removes itself from the map when it goes idle.
   * @param {string} sessionID - Session to get a runner for.
   * @param {*} onInterrupt - Effect run when the runner's work is interrupted.
   * @returns {*} An Effect yielding the session's Runner.
   */
  const runner = Effect.fn("SessionRunState.runner")(function* (sessionID, onInterrupt) {
    const data = yield* InstanceState.get(state);
    const existing = data.runners.get(sessionID);
    if (existing) return existing;
    const next = Runner.make(data.scope, {
      onIdle: Effect.gen(function* () {
        data.runners.delete(sessionID);
        yield* status.set(sessionID, {
          type: "idle"
        });
      }),
      onBusy: status.set(sessionID, {
        type: "busy"
      }),
      onInterrupt,
      busy: () => {
        throw new Session.BusyError(sessionID);
      }
    });
    data.runners.set(sessionID, next);
    return next;
  });
  /**
   * Throws a BusyError if the session currently has a running Runner.
   * @param {string} sessionID - Session to check.
   * @returns {*} An Effect that succeeds when the session is not busy.
   */
  const assertNotBusy = Effect.fn("SessionRunState.assertNotBusy")(function* (sessionID) {
    const data = yield* InstanceState.get(state);
    const existing = data.runners.get(sessionID);
    if (existing?.busy) throw new Session.BusyError(sessionID);
  });
  /**
   * Cancels the session's in-progress work, or marks it idle if nothing is running.
   * @param {string} sessionID - Session to cancel.
   * @returns {*} An Effect that completes once cancellation/idle status is set.
   */
  const cancel = Effect.fn("SessionRunState.cancel")(function* (sessionID) {
    const data = yield* InstanceState.get(state);
    const existing = data.runners.get(sessionID);
    if (!existing || !existing.busy) {
      yield* status.set(sessionID, {
        type: "idle"
      });
      return;
    }
    yield* existing.cancel;
  });
  /**
   * Ensures `work` runs on the session's Runner, reusing the in-flight run if one exists.
   * @param {string} sessionID - Session to run work for.
   * @param {*} onInterrupt - Effect run if the work is interrupted.
   * @param {*} work - The Effect to execute as the session's main work.
   * @returns {*} An Effect yielding the work's result.
   */
  const ensureRunning = Effect.fn("SessionRunState.ensureRunning")(function* (sessionID, onInterrupt, work) {
    return yield* (yield* runner(sessionID, onInterrupt)).ensureRunning(work);
  });
  /**
   * Starts a shell command on the session's Runner, signaling `ready` once the shell is set up.
   * @param {string} sessionID - Session to run the shell for.
   * @param {*} onInterrupt - Effect run if the work is interrupted.
   * @param {*} work - The shell Effect to execute.
   * @param {*} ready - Latch opened when the shell is ready.
   * @returns {*} An Effect yielding the shell's result.
   */
  const startShell = Effect.fn("SessionRunState.startShell")(function* (sessionID, onInterrupt, work, ready) {
    return yield* (yield* runner(sessionID, onInterrupt)).startShell(work, ready);
  });
  return Service.of({
    assertNotBusy,
    cancel,
    ensureRunning,
    startShell
  });
}));
export const defaultLayer = layer.pipe(Layer.provide(SessionStatus.defaultLayer));
export * as SessionRunState from "./run-state.js";