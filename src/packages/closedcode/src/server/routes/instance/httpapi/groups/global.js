/** @file Experimental HttpApi route definitions for global (non-instance-scoped) server routes: health, event stream, config, dispose, upgrade. */
import { Config } from "#config/config.js";
import { BusEvent } from "#bus/bus-event.js";
import { SyncEvent } from "#sync/index.js";
import "#server/event.js";
import { Schema } from "effect";
import { HttpApi, HttpApiEndpoint, HttpApiError, HttpApiGroup, OpenApi } from "effect/unstable/httpapi";
import { described } from "./metadata.js";
/** Success schema for the health endpoint: a constant healthy flag plus the server version. */
const GlobalHealth = Schema.Struct({
  healthy: Schema.Literal(true),
  version: Schema.String
});
/** Schema for a single global event: its directory/project/workspace scope plus a bus or sync event payload. */
const GlobalEventSchema = Schema.Struct({
  directory: Schema.String,
  project: Schema.optional(Schema.String),
  workspace: Schema.optional(Schema.String),
  payload: Schema.Union([...BusEvent.effectPayloads(), ...SyncEvent.effectPayloads()])
}).annotate({
  identifier: "GlobalEvent"
});
/** Payload schema for the upgrade endpoint: an optional target version (latest when omitted). */
export const GlobalUpgradeInput = Schema.Struct({
  target: Schema.optional(Schema.String)
});
/** Success schema for the upgrade endpoint: either success with the new version or failure with an error message. */
const GlobalUpgradeResult = Schema.Union([Schema.Struct({
  success: Schema.Literal(true),
  version: Schema.String
}), Schema.Struct({
  success: Schema.Literal(false),
  error: Schema.String
})]);
/** URL path constants for each global route, keyed by endpoint name. */
export const GlobalPaths = {
  health: "/global/health",
  event: "/global/event",
  config: "/global/config",
  dispose: "/global/dispose",
  upgrade: "/global/upgrade"
};
/**
 * HttpApi definition for the global route group.
 * Bundles the health, event-stream, config get/update, dispose, and upgrade endpoints (no instance middleware).
 */
export const GlobalApi = HttpApi.make("global").add(HttpApiGroup.make("global").add(HttpApiEndpoint.get("health", GlobalPaths.health, {
  success: described(GlobalHealth, "Health information")
}).annotateMerge(OpenApi.annotations({
  identifier: "global.health",
  summary: "Get health",
  description: "Get health information about the ClosedCode server."
})), HttpApiEndpoint.get("event", GlobalPaths.event, {
  success: GlobalEventSchema
}).annotateMerge(OpenApi.annotations({
  identifier: "global.event",
  summary: "Get global events",
  description: "Subscribe to global events from the ClosedCode system using server-sent events."
})), HttpApiEndpoint.get("configGet", GlobalPaths.config, {
  success: described(Config.Info, "Get global config info")
}).annotateMerge(OpenApi.annotations({
  identifier: "global.config.get",
  summary: "Get global configuration",
  description: "Retrieve the current global ClosedCode configuration settings and preferences."
})), HttpApiEndpoint.patch("configUpdate", GlobalPaths.config, {
  payload: Config.Info,
  success: described(Config.Info, "Successfully updated global config"),
  error: HttpApiError.BadRequest
}).annotateMerge(OpenApi.annotations({
  identifier: "global.config.update",
  summary: "Update global configuration",
  description: "Update global ClosedCode configuration settings and preferences."
})), HttpApiEndpoint.post("dispose", GlobalPaths.dispose, {
  success: described(Schema.Boolean, "Global disposed")
}).annotateMerge(OpenApi.annotations({
  identifier: "global.dispose",
  summary: "Dispose instance",
  description: "Clean up and dispose all ClosedCode instances, releasing all resources."
})), HttpApiEndpoint.post("upgrade", GlobalPaths.upgrade, {
  payload: GlobalUpgradeInput,
  success: described(GlobalUpgradeResult, "Upgrade result"),
  error: HttpApiError.BadRequest
}).annotateMerge(OpenApi.annotations({
  identifier: "global.upgrade",
  summary: "Upgrade closedcode",
  description: "Upgrade closedcode to the specified version or latest if not specified."
}))).annotateMerge(OpenApi.annotations({
  title: "global",
  description: "Global server routes."
})));