import { Identifier } from "@/id/id.js";
import { SyncEvent } from "@/sync/index.js";
import { withStatics } from "@/util/schema.js";
import { Flag } from "core/flag/flag";
import * as Schema from "effect/Schema";
export const ID = Schema.String.pipe(Schema.brand("Event.ID"), withStatics(s => ({
  create: () => s.make(Identifier.create("evt", "ascending"))
})));
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
export function run(def, data, options) {
  if (!Flag.CLOSEDCODE_EXPERIMENTAL_EVENT_SYSTEM) return;
  SyncEvent.run(def, data, options);
}
export * as EventV2 from "./event.js";