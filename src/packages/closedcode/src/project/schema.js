import { Schema } from "effect";
import { zod } from "@/util/effect-zod.js";
import { withStatics } from "@/util/schema.js";
const projectIdSchema = Schema.String.pipe(Schema.brand("ProjectID"));
export const ProjectID = projectIdSchema.pipe(withStatics(schema => ({
  global: schema.make("global"),
  zod: zod(schema)
})));