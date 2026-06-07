import { Schema } from "effect";
import { Identifier } from "@/id/id.js";
import { zod, ZodOverride } from "@/util/effect-zod.js";
import { withStatics } from "@/util/schema.js";
const toolIdSchema = Schema.String.annotate({
  [ZodOverride]: Identifier.schema("tool")
}).pipe(Schema.brand("ToolID"));
export const ToolID = toolIdSchema.pipe(withStatics(schema => ({
  ascending: id => schema.make(Identifier.ascending("tool", id)),
  zod: zod(schema)
})));