/** @file HttpApi route definitions for the experimental workspace group: list adapters/workspaces, create, status, remove, and session restore. */
import { Workspace } from "#control-plane/workspace.js";
import { WorkspaceAdapterEntry } from "#control-plane/types.js";
import { NonNegativeInt } from "#util/schema.js";
import { Schema, Struct } from "effect";
import { HttpApi, HttpApiEndpoint, HttpApiError, HttpApiGroup, OpenApi } from "effect/unstable/httpapi";
import { Authorization } from "../middleware/authorization.js";
import { InstanceContextMiddleware } from "../middleware/instance-context.js";
import { WorkspaceRoutingMiddleware } from "../middleware/workspace-routing.js";
import { described } from "./metadata.js";
/** Base URL path prefix for all experimental workspace endpoints. */
const root = "/experimental/workspace";
/** Request body schema for creating a workspace, derived from Workspace.CreateInput minus projectID, with extra made optional. */
export const CreatePayload = Schema.Struct({
  ...Struct.omit(Workspace.CreateInput.fields, ["projectID", "extra"]),
  extra: Schema.optional(Workspace.CreateInput.fields.extra)
});
/** Request body schema for restoring a session into a workspace, derived from Workspace.SessionRestoreInput minus the path-supplied workspaceID. */
export const SessionRestorePayload = Schema.Struct(Struct.omit(Workspace.SessionRestoreInput.fields, ["workspaceID"]));
/** Response schema for the session-restore endpoint, returning the total number of events scheduled for replay. */
export const SessionRestoreResponse = Schema.Struct({
  total: NonNegativeInt
});
/** Map of endpoint name to URL path template for every workspace route. */
export const WorkspacePaths = {
  adapters: `${root}/adapter`,
  list: root,
  status: `${root}/status`,
  remove: `${root}/:id`,
  sessionRestore: `${root}/:id/session-restore`
};
/**
 * Experimental HttpApi surface for the workspace group, exposing endpoints to list
 * available workspace adapters, list/create workspaces, query connection status,
 * remove a workspace, and restore a session's events into a workspace.
 * The group is guarded by instance-context, workspace-routing, and authorization middleware.
 */
export const WorkspaceApi = HttpApi.make("workspace").add(HttpApiGroup.make("workspace").add(HttpApiEndpoint.get("adapters", WorkspacePaths.adapters, {
  success: described(Schema.Array(WorkspaceAdapterEntry), "Workspace adapters")
}).annotateMerge(OpenApi.annotations({
  identifier: "experimental.workspace.adapter.list",
  summary: "List workspace adapters",
  description: "List all available workspace adapters for the current project."
})), HttpApiEndpoint.get("list", WorkspacePaths.list, {
  success: described(Schema.Array(Workspace.Info), "Workspaces")
}).annotateMerge(OpenApi.annotations({
  identifier: "experimental.workspace.list",
  summary: "List workspaces",
  description: "List all workspaces."
})), HttpApiEndpoint.post("create", WorkspacePaths.list, {
  payload: CreatePayload,
  success: described(Workspace.Info, "Workspace created"),
  error: HttpApiError.BadRequest
}).annotateMerge(OpenApi.annotations({
  identifier: "experimental.workspace.create",
  summary: "Create workspace",
  description: "Create a workspace for the current project."
})), HttpApiEndpoint.get("status", WorkspacePaths.status, {
  success: described(Schema.Array(Workspace.ConnectionStatus), "Workspace status")
}).annotateMerge(OpenApi.annotations({
  identifier: "experimental.workspace.status",
  summary: "Workspace status",
  description: "Get connection status for workspaces in the current project."
})), HttpApiEndpoint.delete("remove", WorkspacePaths.remove, {
  params: {
    id: Workspace.Info.fields.id
  },
  success: described(Schema.UndefinedOr(Workspace.Info), "Workspace removed"),
  error: HttpApiError.BadRequest
}).annotateMerge(OpenApi.annotations({
  identifier: "experimental.workspace.remove",
  summary: "Remove workspace",
  description: "Remove an existing workspace."
})), HttpApiEndpoint.post("sessionRestore", WorkspacePaths.sessionRestore, {
  params: {
    id: Workspace.Info.fields.id
  },
  payload: SessionRestorePayload,
  success: described(SessionRestoreResponse, "Session replay started"),
  error: HttpApiError.BadRequest
}).annotateMerge(OpenApi.annotations({
  identifier: "experimental.workspace.sessionRestore",
  summary: "Restore session into workspace",
  description: "Replay a session's sync events into the target workspace in batches."
}))).annotateMerge(OpenApi.annotations({
  title: "workspace",
  description: "Experimental HttpApi workspace routes."
})).middleware(InstanceContextMiddleware).middleware(WorkspaceRoutingMiddleware).middleware(Authorization)).annotateMerge(OpenApi.annotations({
  title: "closedcode experimental HttpApi",
  version: "0.0.1",
  description: "Experimental HttpApi surface for selected instance routes."
}));