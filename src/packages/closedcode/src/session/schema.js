import { Schema } from "effect";
import { Identifier } from "#id/id.js";
import { zod, ZodOverride } from "#util/effect-zod.js";
import { withStatics } from "#util/schema.js";
export const SessionID = Schema.String.annotate({
  [ZodOverride]: Identifier.schema("session")
}).pipe(Schema.brand("SessionID"), withStatics(s => ({
  descending: id => s.make(Identifier.descending("session", id)),
  zod: zod(s)
})));
export const MessageID = Schema.String.annotate({
  [ZodOverride]: Identifier.schema("message")
}).pipe(Schema.brand("MessageID"), withStatics(s => ({
  ascending: id => s.make(Identifier.ascending("message", id)),
  zod: zod(s)
})));
export const PartID = Schema.String.annotate({
  [ZodOverride]: Identifier.schema("part")
}).pipe(Schema.brand("PartID"), withStatics(s => ({
  ascending: id => s.make(Identifier.ascending("part", id)),
  zod: zod(s)
})));