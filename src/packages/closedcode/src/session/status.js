/** @file Tracks and broadcasts per-session run status (idle, busy, retry) over the bus. */
import { BusEvent } from "#bus/bus-event.js";
import { Bus } from "#bus/index.js";
import { InstanceState } from "#effect/instance-state.js";
import { SessionID } from "./schema.js";
import { zod } from "#util/effect-zod.js";
import { NonNegativeInt, withStatics } from "#util/schema.js";
import { Effect, Layer, Context, Schema } from "effect";
/**
 * Schema for a session's status: one of "idle", "busy", or "retry" (with attempt count, message, and next-retry timestamp).
 */
export const Info = Schema.Union([Schema.Struct({
  type: Schema.Literal("idle")
}), Schema.Struct({
  type: Schema.Literal("retry"),
  attempt: NonNegativeInt,
  message: Schema.String,
  next: NonNegativeInt
}), Schema.Struct({
  type: Schema.Literal("busy")
})]).annotate({
  identifier: "SessionStatus"
}).pipe(withStatics(s => ({
  zod: zod(s)
})));
/**
 * Bus event definitions for session status changes.
 * @property {Object} Status - Published whenever a session's status changes; carries sessionID and the new status.
 * @property {Object} Idle - Deprecated; published when a session becomes idle; carries only sessionID.
 */
export const Event = {
  Status: BusEvent.define("session.status", Schema.Struct({
    sessionID: SessionID,
    status: Info
  })),
  // deprecated
  Idle: BusEvent.define("session.idle", Schema.Struct({
    sessionID: SessionID
  }))
};
export class Service extends Context.Service()("@closedcode/SessionStatus") {}
/**
 * Effect Layer providing the SessionStatus service, which keeps per-session status in instance state and publishes status changes on the bus.
 */
export const layer = Layer.effect(Service, Effect.gen(function* () {
  const bus = yield* Bus.Service;
  const state = yield* InstanceState.make(Effect.fn("SessionStatus.state")(() => Effect.succeed(new Map())));
  /**
   * Returns the current status for a session, defaulting to idle when none is recorded.
   * @param {string} sessionID - The session identifier.
   * @returns {Object} The status object (e.g. `{ type: "idle" }`).
   */
  const get = Effect.fn("SessionStatus.get")(function* (sessionID) {
    const data = yield* InstanceState.get(state);
    return data.get(sessionID) ?? {
      type: "idle"
    };
  });
  /**
   * Returns a snapshot copy of all currently tracked session statuses.
   * @returns {Map} A new Map of sessionID to status.
   */
  const list = Effect.fn("SessionStatus.list")(function* () {
    return new Map(yield* InstanceState.get(state));
  });
  /**
   * Sets a session's status and publishes a Status event. When the status is idle, also publishes the deprecated Idle event and clears the stored entry.
   * @param {string} sessionID - The session identifier.
   * @param {Object} status - The new status object (idle, busy, or retry).
   * @returns {void}
   */
  const set = Effect.fn("SessionStatus.set")(function* (sessionID, status) {
    const data = yield* InstanceState.get(state);
    yield* bus.publish(Event.Status, {
      sessionID,
      status
    });
    if (status.type === "idle") {
      yield* bus.publish(Event.Idle, {
        sessionID
      });
      data.delete(sessionID);
      return;
    }
    data.set(sessionID, status);
  });
  return Service.of({
    get,
    list,
    set
  });
}));
/** The SessionStatus layer with its Bus dependency provided. */
export const defaultLayer = layer.pipe(Layer.provide(Bus.layer));
export * as SessionStatus from "./status.js";