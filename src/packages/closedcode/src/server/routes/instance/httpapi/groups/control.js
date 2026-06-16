/**
 * @file Effect HttpApi group for the control-plane routes: set/remove provider auth
 * credentials and write server log entries.
 */
import { Auth } from "#auth/index.js";
import { ProviderID } from "#provider/schema.js";
import { Schema } from "effect";
import { HttpApi, HttpApiEndpoint, HttpApiError, HttpApiGroup, OpenApi } from "effect/unstable/httpapi";
import { described } from "./metadata.js";
// Path params for the auth endpoints: the target provider.
const AuthParams = Schema.Struct({
  providerID: ProviderID
});
// Optional query params scoping a log entry to a directory/workspace.
const LogQuery = Schema.Struct({
  directory: Schema.optional(Schema.String),
  workspace: Schema.optional(Schema.String)
});
/** Schema for a log entry payload posted to the /log endpoint. */
export const LogInput = Schema.Struct({
  service: Schema.String.annotate({
    description: "Service name for the log entry"
  }),
  level: Schema.Union([Schema.Literal("debug"), Schema.Literal("info"), Schema.Literal("error"), Schema.Literal("warn")]).annotate({
    description: "Log level"
  }),
  message: Schema.String.annotate({
    description: "Log message"
  }),
  extra: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)).annotate({
    description: "Additional metadata for the log entry"
  })
});
/** Route paths exposed by the control API group. */
export const ControlPaths = {
  auth: "/auth/:providerID",
  log: "/log"
};
/** Effect HttpApi group exposing PUT/DELETE /auth/:providerID and POST /log. */
export const ControlApi = HttpApi.make("control").add(HttpApiGroup.make("control").add(HttpApiEndpoint.put("authSet", ControlPaths.auth, {
  params: AuthParams,
  payload: Auth.Info,
  success: described(Schema.Boolean, "Successfully set authentication credentials"),
  error: HttpApiError.BadRequest
}).annotateMerge(OpenApi.annotations({
  identifier: "auth.set",
  summary: "Set auth credentials",
  description: "Set authentication credentials"
})), HttpApiEndpoint.delete("authRemove", ControlPaths.auth, {
  params: AuthParams,
  success: described(Schema.Boolean, "Successfully removed authentication credentials"),
  error: HttpApiError.BadRequest
}).annotateMerge(OpenApi.annotations({
  identifier: "auth.remove",
  summary: "Remove auth credentials",
  description: "Remove authentication credentials"
})), HttpApiEndpoint.post("log", ControlPaths.log, {
  query: LogQuery,
  payload: LogInput,
  success: described(Schema.Boolean, "Log entry written successfully"),
  error: HttpApiError.BadRequest
}).annotateMerge(OpenApi.annotations({
  identifier: "app.log",
  summary: "Write log",
  description: "Write a log entry to the server logs with specified level and metadata."
}))).annotateMerge(OpenApi.annotations({
  title: "control",
  description: "Control plane routes."
})));