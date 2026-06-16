/** @file Branded ID schemas (SessionID, MessageID, PartID) for the session domain, with ascending/descending ULID generators. */
import { Schema } from "effect";
import { Identifier } from "#id/id.js";
import { zod, ZodOverride } from "#util/effect-zod.js";
import { withStatics } from "#util/schema.js";
/**
 * Branded schema for session identifiers. Exposes static helpers:
 * `descending(id)` to make a time-descending session ID and `zod` for the zod codec.
 */
export const SessionID = Schema.String.annotate({
  [ZodOverride]: Identifier.schema("session")
}).pipe(Schema.brand("SessionID"), withStatics(s => ({
  descending: id => s.make(Identifier.descending("session", id)),
  zod: zod(s)
})));
/**
 * Branded schema for message identifiers. Exposes static helpers:
 * `ascending(id)` to make a time-ascending message ID and `zod` for the zod codec.
 */
export const MessageID = Schema.String.annotate({
  [ZodOverride]: Identifier.schema("message")
}).pipe(Schema.brand("MessageID"), withStatics(s => ({
  ascending: id => s.make(Identifier.ascending("message", id)),
  zod: zod(s)
})));
/**
 * Branded schema for message part identifiers. Exposes static helpers:
 * `ascending(id)` to make a time-ascending part ID and `zod` for the zod codec.
 */
export const PartID = Schema.String.annotate({
  [ZodOverride]: Identifier.schema("part")
}).pipe(Schema.brand("PartID"), withStatics(s => ({
  ascending: id => s.make(Identifier.ascending("part", id)),
  zod: zod(s)
})));