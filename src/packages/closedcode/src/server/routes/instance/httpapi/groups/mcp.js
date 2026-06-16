/** @file Experimental HttpApi route definitions for Model Context Protocol (MCP) servers: status, add, OAuth flow, connect/disconnect. */
import { MCP } from "#mcp/index.js";
import { ConfigMCP } from "#config/mcp.js";
import { Schema } from "effect";
import { HttpApi, HttpApiEndpoint, HttpApiError, HttpApiGroup, OpenApi } from "effect/unstable/httpapi";
import { Authorization } from "../middleware/authorization.js";
import { InstanceContextMiddleware } from "../middleware/instance-context.js";
import { WorkspaceRoutingMiddleware } from "../middleware/workspace-routing.js";
import { described } from "./metadata.js";
/** Payload schema for adding an MCP server: its name and configuration. */
export const AddPayload = Schema.Struct({
  name: Schema.String,
  config: ConfigMCP.Info
});
/** Schema mapping each MCP server name to its connection status. */
export const StatusMap = Schema.Record(Schema.String, MCP.Status);
/** Success schema for starting MCP OAuth: the authorization URL plus the opaque OAuth state token. */
export const AuthStartResponse = Schema.Struct({
  authorizationUrl: Schema.String,
  oauthState: Schema.String
});
/** Payload schema for the MCP OAuth callback: the authorization code returned by the provider. */
export const AuthCallbackPayload = Schema.Struct({
  code: Schema.String
});
/** Success schema for removing MCP OAuth credentials: a constant success flag. */
export const AuthRemoveResponse = Schema.Struct({
  success: Schema.Literal(true)
});
/** Error thrown (HTTP 400) when an MCP server does not support OAuth authentication. */
export class UnsupportedOAuthError extends Schema.ErrorClass("McpUnsupportedOAuthError")({
  error: Schema.String
}, {
  httpApiStatus: 400
}) {}
/** URL path constants for each MCP route, keyed by endpoint name. */
export const McpPaths = {
  status: "/mcp",
  auth: "/mcp/:name/auth",
  authCallback: "/mcp/:name/auth/callback",
  authAuthenticate: "/mcp/:name/auth/authenticate",
  connect: "/mcp/:name/connect",
  disconnect: "/mcp/:name/disconnect"
};
/**
 * HttpApi definition for the experimental MCP route group.
 * Bundles the status/add/auth/connect/disconnect endpoints under instance-context, workspace-routing, and authorization middleware.
 */
export const McpApi = HttpApi.make("mcp").add(HttpApiGroup.make("mcp").add(HttpApiEndpoint.get("status", McpPaths.status, {
  success: described(Schema.Record(Schema.String, MCP.Status), "MCP server status")
}).annotateMerge(OpenApi.annotations({
  identifier: "mcp.status",
  summary: "Get MCP status",
  description: "Get the status of all Model Context Protocol (MCP) servers."
})), HttpApiEndpoint.post("add", McpPaths.status, {
  payload: AddPayload,
  success: described(StatusMap, "MCP server added successfully"),
  error: HttpApiError.BadRequest
}).annotateMerge(OpenApi.annotations({
  identifier: "mcp.add",
  summary: "Add MCP server",
  description: "Dynamically add a new Model Context Protocol (MCP) server to the system."
})), HttpApiEndpoint.post("authStart", McpPaths.auth, {
  params: {
    name: Schema.String
  },
  success: described(AuthStartResponse, "OAuth flow started"),
  error: [UnsupportedOAuthError, HttpApiError.NotFound]
}).annotateMerge(OpenApi.annotations({
  identifier: "mcp.auth.start",
  summary: "Start MCP OAuth",
  description: "Start OAuth authentication flow for a Model Context Protocol (MCP) server."
})), HttpApiEndpoint.post("authCallback", McpPaths.authCallback, {
  params: {
    name: Schema.String
  },
  payload: AuthCallbackPayload,
  success: described(MCP.Status, "OAuth authentication completed"),
  error: [HttpApiError.BadRequest, HttpApiError.NotFound]
}).annotateMerge(OpenApi.annotations({
  identifier: "mcp.auth.callback",
  summary: "Complete MCP OAuth",
  description: "Complete OAuth authentication for a Model Context Protocol (MCP) server using the authorization code."
})), HttpApiEndpoint.post("authAuthenticate", McpPaths.authAuthenticate, {
  params: {
    name: Schema.String
  },
  success: described(MCP.Status, "OAuth authentication completed"),
  error: [UnsupportedOAuthError, HttpApiError.NotFound]
}).annotateMerge(OpenApi.annotations({
  identifier: "mcp.auth.authenticate",
  summary: "Authenticate MCP OAuth",
  description: "Start OAuth flow and wait for callback (opens browser)."
})), HttpApiEndpoint.delete("authRemove", McpPaths.auth, {
  params: {
    name: Schema.String
  },
  success: described(AuthRemoveResponse, "OAuth credentials removed"),
  error: HttpApiError.NotFound
}).annotateMerge(OpenApi.annotations({
  identifier: "mcp.auth.remove",
  summary: "Remove MCP OAuth",
  description: "Remove OAuth credentials for an MCP server."
})), HttpApiEndpoint.post("connect", McpPaths.connect, {
  params: {
    name: Schema.String
  },
  success: described(Schema.Boolean, "MCP server connected successfully")
}).annotateMerge(OpenApi.annotations({
  identifier: "mcp.connect",
  description: "Connect an MCP server."
})), HttpApiEndpoint.post("disconnect", McpPaths.disconnect, {
  params: {
    name: Schema.String
  },
  success: described(Schema.Boolean, "MCP server disconnected successfully")
}).annotateMerge(OpenApi.annotations({
  identifier: "mcp.disconnect",
  description: "Disconnect an MCP server."
}))).annotateMerge(OpenApi.annotations({
  title: "mcp",
  description: "Experimental HttpApi MCP routes."
})).middleware(InstanceContextMiddleware).middleware(WorkspaceRoutingMiddleware).middleware(Authorization)).annotateMerge(OpenApi.annotations({
  title: "closedcode experimental HttpApi",
  version: "0.0.1",
  description: "Experimental HttpApi surface for selected instance routes."
}));