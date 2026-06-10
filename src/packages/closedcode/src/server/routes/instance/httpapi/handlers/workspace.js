import { listAdapters } from "#control-plane/adapters/index.js";
import { Workspace } from "#control-plane/workspace.js";
import * as InstanceState from "#effect/instance-state.js";
import { Effect } from "effect";
import { HttpApiBuilder, HttpApiError } from "effect/unstable/httpapi";
import { InstanceHttpApi } from "../api.js";
export const workspaceHandlers = HttpApiBuilder.group(InstanceHttpApi, "workspace", handlers => Effect.gen(function* () {
  const workspace = yield* Workspace.Service;
  const adapters = Effect.fn("WorkspaceHttpApi.adapters")(function* () {
    const instance = yield* InstanceState.context;
    return yield* Effect.promise(() => listAdapters(instance.project.id));
  });
  const list = Effect.fn("WorkspaceHttpApi.list")(function* () {
    return yield* workspace.list((yield* InstanceState.context).project);
  });
  const create = Effect.fn("WorkspaceHttpApi.create")(function* (ctx) {
    const instance = yield* InstanceState.context;
    return yield* workspace.create({
      ...ctx.payload,
      extra: ctx.payload.extra ?? null,
      projectID: instance.project.id
    }).pipe(Effect.mapError(() => new HttpApiError.BadRequest({})));
  });
  const status = Effect.fn("WorkspaceHttpApi.status")(function* () {
    const ids = new Set((yield* workspace.list((yield* InstanceState.context).project)).map(item => item.id));
    return (yield* workspace.status()).filter(item => ids.has(item.workspaceID));
  });
  const remove = Effect.fn("WorkspaceHttpApi.remove")(function* (ctx) {
    return yield* workspace.remove(ctx.params.id);
  });
  const sessionRestore = Effect.fn("WorkspaceHttpApi.sessionRestore")(function* (ctx) {
    return yield* workspace.sessionRestore({
      workspaceID: ctx.params.id,
      sessionID: ctx.payload.sessionID
    }).pipe(Effect.mapError(() => new HttpApiError.BadRequest({})));
  });
  return handlers.handle("adapters", adapters).handle("list", list).handle("create", create).handle("status", status).handle("remove", remove).handle("sessionRestore", sessionRestore);
}));