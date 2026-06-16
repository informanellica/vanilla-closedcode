/** @file HTTP API handlers for the "workspace" group: list adapters/workspaces, create/remove workspaces, query status, and restore sessions. */
import { listAdapters } from "#control-plane/adapters/index.js";
import { Workspace } from "#control-plane/workspace.js";
import * as InstanceState from "#effect/instance-state.js";
import { Effect } from "effect";
import { HttpApiBuilder, HttpApiError } from "effect/unstable/httpapi";
import { InstanceHttpApi } from "../api.js";
/**
 * Builds the "workspace" HTTP API handler group: adapters/list/create/status/remove/sessionRestore endpoints.
 * @type {Object}
 */
export const workspaceHandlers = HttpApiBuilder.group(InstanceHttpApi, "workspace", handlers => Effect.gen(function* () {
  const workspace = yield* Workspace.Service;
  /**
   * Lists the workspace adapters available for the current instance's project.
   * @returns {Effect} Effect resolving to the array of adapters.
   */
  const adapters = Effect.fn("WorkspaceHttpApi.adapters")(function* () {
    const instance = yield* InstanceState.context;
    return yield* Effect.promise(() => listAdapters(instance.project.id));
  });
  /**
   * Lists the workspaces belonging to the current instance's project.
   * @returns {Effect} Effect resolving to the array of workspaces.
   */
  const list = Effect.fn("WorkspaceHttpApi.list")(function* () {
    return yield* workspace.list((yield* InstanceState.context).project);
  });
  /**
   * Creates a workspace under the current project, defaulting extra to null and mapping failures to BadRequest.
   * @param {Object} ctx - Request context whose payload describes the workspace to create.
   * @returns {Effect} Effect resolving to the created workspace, or failing with HttpApiError.BadRequest.
   */
  const create = Effect.fn("WorkspaceHttpApi.create")(function* (ctx) {
    const instance = yield* InstanceState.context;
    return yield* workspace.create({
      ...ctx.payload,
      extra: ctx.payload.extra ?? null,
      projectID: instance.project.id
    }).pipe(Effect.mapError(() => new HttpApiError.BadRequest({})));
  });
  /**
   * Returns status entries restricted to workspaces that belong to the current project.
   * @returns {Effect} Effect resolving to the filtered array of workspace status records.
   */
  const status = Effect.fn("WorkspaceHttpApi.status")(function* () {
    const ids = new Set((yield* workspace.list((yield* InstanceState.context).project)).map(item => item.id));
    return (yield* workspace.status()).filter(item => ids.has(item.workspaceID));
  });
  /**
   * Removes a workspace by id.
   * @param {Object} ctx - Request context with params.id.
   * @returns {Effect} Effect resolving to the removal result.
   */
  const remove = Effect.fn("WorkspaceHttpApi.remove")(function* (ctx) {
    return yield* workspace.remove(ctx.params.id);
  });
  /**
   * Restores a session into the given workspace, mapping failures to BadRequest.
   * @param {Object} ctx - Request context with params.id (workspace) and payload.sessionID.
   * @returns {Effect} Effect resolving to the restore result, or failing with HttpApiError.BadRequest.
   */
  const sessionRestore = Effect.fn("WorkspaceHttpApi.sessionRestore")(function* (ctx) {
    return yield* workspace.sessionRestore({
      workspaceID: ctx.params.id,
      sessionID: ctx.payload.sessionID
    }).pipe(Effect.mapError(() => new HttpApiError.BadRequest({})));
  });
  return handlers.handle("adapters", adapters).handle("list", list).handle("create", create).handle("status", status).handle("remove", remove).handle("sessionRestore", sessionRestore);
}));