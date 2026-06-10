import { BusEvent } from "#bus/bus-event.js";
import { Bus } from "#bus/index.js";
import { InstanceState } from "#effect/instance-state.js";
import { SessionID } from "./schema.js";
import { zod } from "#util/effect-zod.js";
import { NonNegativeInt, withStatics } from "#util/schema.js";
import { Effect, Layer, Context, Schema } from "effect";
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
export const layer = Layer.effect(Service, Effect.gen(function* () {
  const bus = yield* Bus.Service;
  const state = yield* InstanceState.make(Effect.fn("SessionStatus.state")(() => Effect.succeed(new Map())));
  const get = Effect.fn("SessionStatus.get")(function* (sessionID) {
    const data = yield* InstanceState.get(state);
    return data.get(sessionID) ?? {
      type: "idle"
    };
  });
  const list = Effect.fn("SessionStatus.list")(function* () {
    return new Map(yield* InstanceState.get(state));
  });
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
export const defaultLayer = layer.pipe(Layer.provide(Bus.layer));
export * as SessionStatus from "./status.js";