import { Schema } from "effect";
import { Identifier } from "@/id/id.js";
import { zod, ZodOverride } from "@/util/effect-zod.js";
import { withStatics } from "@/util/schema.js";
export const EventID = Schema.String.annotate({
  [ZodOverride]: Identifier.schema("event")
}).pipe(Schema.brand("EventID"), withStatics(s => ({
  ascending: id => s.make(Identifier.ascending("event", id)),
  zod: zod(s)
})));