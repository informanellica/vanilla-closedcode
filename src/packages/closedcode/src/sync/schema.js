import { Schema } from "effect";
import { Identifier } from "#id/id.js";
import { zod, ZodOverride } from "#util/effect-zod.js";
import { withStatics } from "#util/schema.js";
/**
 * @file Schema for sync event identifiers: a branded string with helpers to
 * mint monotonically-ascending event IDs.
 */

/**
 * Branded string schema for sync event IDs. Exposes static helpers:
 * `ascending(id)` mints a new ascending EventID and `zod` is the Zod equivalent.
 */
export const EventID = Schema.String.annotate({
  [ZodOverride]: Identifier.schema("event")
}).pipe(Schema.brand("EventID"), withStatics(s => ({
  ascending: id => s.make(Identifier.ascending("event", id)),
  zod: zod(s)
})));