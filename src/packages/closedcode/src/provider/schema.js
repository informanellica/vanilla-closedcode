import { Schema } from "effect";
import { zod } from "@/util/effect-zod.js";
import { withStatics } from "@/util/schema.js";
const providerIdSchema = Schema.String.pipe(Schema.brand("ProviderID"));
export const ProviderID = providerIdSchema.pipe(withStatics(schema => ({
  zod: zod(schema),
  lmstudio: schema.make("lmstudio"),
  ollama: schema.make("ollama")
})));
const modelIdSchema = Schema.String.pipe(Schema.brand("ModelID"));
export const ModelID = modelIdSchema.pipe(withStatics(schema => ({
  zod: zod(schema)
})));