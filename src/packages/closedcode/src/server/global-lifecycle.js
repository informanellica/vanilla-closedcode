/** @file Server-wide lifecycle helpers: dispose all instances and broadcast a global "disposed" event over the global bus. */
import { GlobalBus } from "#bus/global.js";
import { InstanceStore } from "#project/instance-store.js";
import * as Log from "core/util/log";
import { Effect } from "effect";
import { Event } from "./event.js";
const log = Log.create({
  service: "server"
});
/**
 * Effect that emits a global "disposed" event on the global bus for the "global" directory.
 * @type {Effect}
 */
export const emitGlobalDisposed = Effect.sync(() => GlobalBus.emit("event", {
  directory: "global",
  payload: {
    type: Event.Disposed.type,
    properties: {}
  }
}));
/**
 * Dispose every active instance from the InstanceStore and then emit the global "disposed" event.
 * The whole sequence is run uninterruptibly so disposal and notification cannot be torn apart.
 * @param {Object} options - Optional settings. When `swallowErrors` is true, disposal failures are logged as warnings instead of failing the Effect.
 * @returns {Effect} An Effect that disposes all instances and emits the global disposed event.
 */
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