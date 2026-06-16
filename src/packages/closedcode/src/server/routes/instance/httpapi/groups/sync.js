/** @file HttpApi route definitions for the sync group: start workspace sync, replay event histories, and list sync events. */
import { NonNegativeInt } from "#util/schema.js";
import { Schema } from "effect";
import { HttpApi, HttpApiEndpoint, HttpApiError, HttpApiGroup, OpenApi } from "effect/unstable/httpapi";
import { Authorization } from "../middleware/authorization.js";
import { InstanceContextMiddleware } from "../middleware/instance-context.js";
import { WorkspaceRoutingMiddleware } from "../middleware/workspace-routing.js";
import { described } from "./metadata.js";
/** Base URL path prefix for all sync endpoints. */
const root = "/sync";
/** Schema for a single sync event to replay, identified by event ID, aggregate ID, sequence number, type, and free-form data. */
export const ReplayEvent = Schema.Struct({
  id: Schema.String,
  aggregateID: Schema.String,
  seq: NonNegativeInt,
  type: Schema.String,
  data: Schema.Record(Schema.String, Schema.Unknown)
});
/** Request body schema for the replay endpoint: the target directory and a non-empty array of events to replay. */
export const ReplayPayload = Schema.Struct({
  directory: Schema.String,
  events: Schema.NonEmptyArray(ReplayEvent)
});
/** Response schema for the replay endpoint, returning the session ID produced by the replay. */
export const ReplayResponse = Schema.Struct({
  sessionID: Schema.String
});
/** Request body schema for the history endpoint: a map of aggregate ID to the last known sequence number. */
export const HistoryPayload = Schema.Record(Schema.String, NonNegativeInt);
/** Schema for a single sync event returned by the history endpoint (uses snake_case aggregate_id on the wire). */
export const HistoryEvent = Schema.Struct({
  id: Schema.String,
  aggregate_id: Schema.String,
  seq: NonNegativeInt,
  type: Schema.String,
  data: Schema.Record(Schema.String, Schema.Unknown)
});
/** Map of endpoint name to URL path template for every sync route. */
export const SyncPaths = {
  start: `${root}/start`,
  replay: `${root}/replay`,
  history: `${root}/history`
};
/**
 * Experimental HttpApi surface for the sync group, exposing endpoints to start
 * workspace sync loops, replay a complete event history, and list sync events.
 * The group is guarded by instance-context, workspace-routing, and authorization middleware.
 */
export const SyncApi = HttpApi.make("sync").add(HttpApiGroup.make("sync").add(HttpApiEndpoint.post("start", SyncPaths.start, {
  success: described(Schema.Boolean, "Workspace sync started")
}).annotateMerge(OpenApi.annotations({
  identifier: "sync.start",
  summary: "Start workspace sync",
  description: "Start sync loops for workspaces in the current project that have active sessions."
})), HttpApiEndpoint.post("replay", SyncPaths.replay, {
  payload: ReplayPayload,
  success: described(ReplayResponse, "Replayed sync events"),
  error: HttpApiError.BadRequest
}).annotateMerge(OpenApi.annotations({
  identifier: "sync.replay",
  summary: "Replay sync events",
  description: "Validate and replay a complete sync event history."
})), HttpApiEndpoint.post("history", SyncPaths.history, {
  payload: HistoryPayload,
  success: described(Schema.Array(HistoryEvent), "Sync events"),
  error: HttpApiError.BadRequest
}).annotateMerge(OpenApi.annotations({
  identifier: "sync.history.list",
  summary: "List sync events",
  description: "List sync events for all aggregates. Keys are aggregate IDs the client already knows about, values are the last known sequence ID. Events with seq > value are returned for those aggregates. Aggregates not listed in the input get their full history."
}))).annotateMerge(OpenApi.annotations({
  title: "sync",
  description: "Experimental HttpApi sync routes."
})).middleware(InstanceContextMiddleware).middleware(WorkspaceRoutingMiddleware).middleware(Authorization)).annotateMerge(OpenApi.annotations({
  title: "closedcode experimental HttpApi",
  version: "0.0.1",
  description: "Experimental HttpApi surface for selected instance routes."
}));