/** @module EventV2 */
/** @file V2 event definitions: branded event IDs, payload schema construction, and gated SyncEvent dispatch. */
import { Identifier } from "#id/id.js";
import { SyncEvent } from "#sync/index.js";
import { withStatics } from "#util/schema.js";
import { Flag } from "core/flag/flag";
import * as Schema from "effect/Schema";

/**
 * Branded schema for event IDs, with a static `create()` that mints a new ascending `"evt"` identifier.
 */
export const ID = Schema.String.pipe(Schema.brand("Event.ID"), withStatics(s => ({
  create: () => s.make(Identifier.create("evt", "ascending"))
})));

/**
 * Defines an event: builds its payload struct schema and a paired SyncEvent definition.
 *
 * @param {Object} input - Event definition input.
 * @param {string} input.type - Literal event type discriminator.
 * @param {Object} input.schema - Field schemas for the event's `data` struct.
 * @param {number} input.version - Schema version (defaults to 1 for the SyncEvent).
 * @param {*} input.aggregate - Aggregate descriptor the event belongs to.
 * @returns {Object} The payload schema augmented with `Sync`, `version`, and `aggregate` members.
 */
export function define(input) {
  const Payload = Schema.Struct({
    id: ID,
    metadata: Schema.Record(Schema.String, Schema.Unknown).pipe(Schema.optional),
    type: Schema.Literal(input.type),
    data: Schema.Struct(input.schema)
  }).annotate({
    identifier: input.type
  });
  const Sync = SyncEvent.define({
    type: input.type,
    version: input.version ?? 1,
    aggregate: input.aggregate,
    schema: Payload.fields.data
  });
  return Object.assign(Payload, {
    Sync,
    version: input.version,
    aggregate: input.aggregate
  });
}
/**
 * Dispatches an event via SyncEvent, but only when the experimental event-system flag is enabled.
 *
 * @param {Object} def - An event definition produced by {@link define}.
 * @param {Object} data - The event payload data.
 * @param {Object} options - Options forwarded to `SyncEvent.run`.
 * @returns {Promise|undefined} The SyncEvent write promise, or `undefined` when the experimental flag is off.
 */
export function run(def, data, options) {
  if (!Flag.CLOSEDCODE_EXPERIMENTAL_EVENT_SYSTEM) return;
  // Return the promise so callers can await the (now async) SyncEvent write and
  // surface its errors, instead of it running fire-and-forget.
  return SyncEvent.run(def, data, options);
}
export * as EventV2 from "./event.js";