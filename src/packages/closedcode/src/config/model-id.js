import { Schema } from "effect";
import { zod } from "#util/effect-zod.js";
import { withStatics } from "#util/schema.js";
export const ConfigModelID = Schema.String.pipe(withStatics(s => ({
  zod: zod(s)
})));