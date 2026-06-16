/** @file HTTP API handlers for the "control" group: setting/removing provider auth credentials and emitting log entries. */
import { Auth } from "#auth/index.js";
import * as Log from "core/util/log";
import { Effect } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { RootHttpApi } from "../api.js";
/**
 * Registers the handlers for the "control" HTTP API group on the root API.
 * @type {Object}
 */
export const controlHandlers = HttpApiBuilder.group(RootHttpApi, "control", handlers => Effect.gen(function* () {
  const auth = yield* Auth.Service;
  /**
   * Stores the auth credentials for the given provider.
   * @param {Object} ctx - Handler context; `params.providerID` is the provider ID and `payload` is the credential record to store.
   * @returns {Effect} Effect yielding `true` on success.
   */
  const authSet = Effect.fn("ControlHttpApi.authSet")(function* (ctx) {
    yield* auth.set(ctx.params.providerID, ctx.payload).pipe(Effect.orDie);
    return true;
  });
  /**
   * Removes the stored auth credentials for the given provider.
   * @param {Object} ctx - Handler context; `params.providerID` is the provider ID to remove.
   * @returns {Effect} Effect yielding `true` on success.
   */
  const authRemove = Effect.fn("ControlHttpApi.authRemove")(function* (ctx) {
    yield* auth.remove(ctx.params.providerID).pipe(Effect.orDie);
    return true;
  });
  /**
   * Writes a log entry using a logger scoped to the requested service.
   * @param {Object} ctx - Handler context; `payload` carries `service`, `level`, `message`, and optional `extra` fields.
   * @returns {Effect} Effect yielding `true` on success.
   */
  const log = Effect.fn("ControlHttpApi.log")(function* (ctx) {
    const logger = Log.create({
      service: ctx.payload.service
    });
    logger[ctx.payload.level](ctx.payload.message, ctx.payload.extra);
    return true;
  });
  return handlers.handle("authSet", authSet).handle("authRemove", authRemove).handle("log", log);
}));