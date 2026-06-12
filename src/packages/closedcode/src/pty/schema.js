import { Schema } from "effect";
import { Identifier } from "#id/id.js";
import { zod, ZodOverride } from "#util/effect-zod.js";
import { withStatics } from "#util/schema.js";
const ptyIdSchema = Schema.String.annotate({
  [ZodOverride]: Identifier.schema("pty")
}).pipe(Schema.brand("PtyID"));
export const PtyID = ptyIdSchema.pipe(withStatics(schema => ({
  ascending: id => schema.make(Identifier.ascending("pty", id)),
  zod: zod(schema)
})));