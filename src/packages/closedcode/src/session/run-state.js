import { InstanceState } from "@/effect/instance-state.js";
import { Runner } from "@/effect/runner.js";
import { Effect, Layer, Scope, Context } from "effect";
import * as Session from "./session.js";
import { SessionStatus } from "./status.js";
export class Service extends Context.Service()("@closedcode/SessionRunState") {}
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
  const assertNotBusy = Effect.fn("SessionRunState.assertNotBusy")(function* (sessionID) {
    const data = yield* InstanceState.get(state);
    const existing = data.runners.get(sessionID);
    if (existing?.busy) throw new Session.BusyError(sessionID);
  });
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
  const ensureRunning = Effect.fn("SessionRunState.ensureRunning")(function* (sessionID, onInterrupt, work) {
    return yield* (yield* runner(sessionID, onInterrupt)).ensureRunning(work);
  });
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