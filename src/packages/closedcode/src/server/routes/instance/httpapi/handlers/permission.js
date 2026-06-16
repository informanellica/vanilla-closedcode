/** @file HTTP API handlers for the "permission" group: listing pending permission requests and replying to them. */
import { Permission } from "#permission/index.js";
import { Effect } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { InstanceHttpApi } from "../api.js";
/**
 * Registers the handlers for the "permission" HTTP API group on the instance API.
 * @type {Object}
 */
export const permissionHandlers = HttpApiBuilder.group(InstanceHttpApi, "permission", handlers => Effect.gen(function* () {
  const svc = yield* Permission.Service;
  /**
   * Lists the pending permission requests.
   * @returns {Effect} Effect yielding the list of permission requests.
   */
  const list = Effect.fn("PermissionHttpApi.list")(function* () {
    return yield* svc.list();
  });
  /**
   * Replies to a pending permission request.
   * @param {Object} ctx - Handler context; `params.requestID` identifies the request and `payload` carries `reply` and an optional `message`.
   * @returns {Effect} Effect yielding `true` on success.
   */
  const reply = Effect.fn("PermissionHttpApi.reply")(function* (ctx) {
    yield* svc.reply({
      requestID: ctx.params.requestID,
      reply: ctx.payload.reply,
      message: ctx.payload.message
    });
    return true;
  });
  return handlers.handle("list", list).handle("reply", reply);
}));