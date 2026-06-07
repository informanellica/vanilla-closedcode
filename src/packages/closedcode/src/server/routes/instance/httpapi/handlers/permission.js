import { Permission } from "@/permission/index.js";
import { Effect } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { InstanceHttpApi } from "../api.js";
export const permissionHandlers = HttpApiBuilder.group(InstanceHttpApi, "permission", handlers => Effect.gen(function* () {
  const svc = yield* Permission.Service;
  const list = Effect.fn("PermissionHttpApi.list")(function* () {
    return yield* svc.list();
  });
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