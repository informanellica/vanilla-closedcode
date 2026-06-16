/** @file Experimental HttpApi route definitions for permission requests: list pending requests and reply to them. */
import { Permission } from "#permission/index.js";
import { PermissionID } from "#permission/schema.js";
import { Schema } from "effect";
import { HttpApi, HttpApiEndpoint, HttpApiError, HttpApiGroup, OpenApi } from "effect/unstable/httpapi";
import { Authorization } from "../middleware/authorization.js";
import { InstanceContextMiddleware } from "../middleware/instance-context.js";
import { WorkspaceRoutingMiddleware } from "../middleware/workspace-routing.js";
import { described } from "./metadata.js";
/** Base URL path for the permission route group. */
const root = "/permission";
/** Payload schema for replying to a permission request: the reply decision plus an optional message. */
const ReplyPayload = Schema.Struct({
  reply: Permission.Reply,
  message: Schema.optional(Schema.String)
});
/**
 * HttpApi definition for the experimental permission route group.
 * Bundles the list and reply endpoints under instance-context, workspace-routing, and authorization middleware.
 */
export const PermissionApi = HttpApi.make("permission").add(HttpApiGroup.make("permission").add(HttpApiEndpoint.get("list", root, {
  success: described(Schema.Array(Permission.Request), "List of pending permissions")
}).annotateMerge(OpenApi.annotations({
  identifier: "permission.list",
  summary: "List pending permissions",
  description: "Get all pending permission requests across all sessions."
})), HttpApiEndpoint.post("reply", `${root}/:requestID/reply`, {
  params: {
    requestID: PermissionID
  },
  payload: ReplyPayload,
  success: described(Schema.Boolean, "Permission processed successfully"),
  error: [HttpApiError.BadRequest, HttpApiError.NotFound]
}).annotateMerge(OpenApi.annotations({
  identifier: "permission.reply",
  summary: "Respond to permission request",
  description: "Approve or deny a permission request from the AI assistant."
}))).annotateMerge(OpenApi.annotations({
  title: "permission",
  description: "Experimental HttpApi permission routes."
})).middleware(InstanceContextMiddleware).middleware(WorkspaceRoutingMiddleware).middleware(Authorization)).annotateMerge(OpenApi.annotations({
  title: "closedcode experimental HttpApi",
  version: "0.0.1",
  description: "Experimental HttpApi surface for selected instance routes."
}));