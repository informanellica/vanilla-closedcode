import { Schema } from "effect";
import { Identifier } from "@/id/id.js";
import { zod, ZodOverride } from "@/util/effect-zod.js";
import { withStatics } from "@/util/schema.js";
const workspaceIdSchema = Schema.String.annotate({
  [ZodOverride]: Identifier.schema("workspace")
}).pipe(Schema.brand("WorkspaceID"));
export const WorkspaceID = workspaceIdSchema.pipe(withStatics(schema => ({
  ascending: id => schema.make(Identifier.ascending("workspace", id)),
  zod: zod(schema)
})));