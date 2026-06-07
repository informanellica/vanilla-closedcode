import { GlobalBus } from "@/bus/global.js";
import { InstanceStore } from "@/project/instance-store.js";
import * as Log from "core/util/log";
import { Effect } from "effect";
import { Event } from "./event.js";
const log = Log.create({
  service: "server"
});
export const emitGlobalDisposed = Effect.sync(() => GlobalBus.emit("event", {
  directory: "global",
  payload: {
    type: Event.Disposed.type,
    properties: {}
  }
}));
export const disposeAllInstancesAndEmitGlobalDisposed = Effect.fn("Server.disposeAllInstancesAndEmitGlobalDisposed")(function* (options) {
  const store = yield* InstanceStore.Service;
  yield* Effect.gen(function* () {
    yield* options?.swallowErrors ? store.disposeAll().pipe(Effect.catchCause(cause => Effect.sync(() => {
      log.warn("global disposal failed", {
        cause
      });
    }))) : store.disposeAll();
    yield* emitGlobalDisposed;
  }).pipe(Effect.uninterruptible);
});
export * as GlobalLifecycle from "./global-lifecycle.js";