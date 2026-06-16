/**
 * @file Branded string schemas for provider and model identifiers, with helpers
 * (zod conversion, and pre-made ids for the local lmstudio/ollama providers).
 * @module closedcode/provider/schema
 */
import { Schema } from "effect";
import { zod } from "#util/effect-zod.js";
import { withStatics } from "#util/schema.js";
const providerIdSchema = Schema.String.pipe(Schema.brand("ProviderID"));
/** Branded provider id schema; statics include `zod`, `lmstudio`, and `ollama` constants. */
export const ProviderID = providerIdSchema.pipe(withStatics(schema => ({
  zod: zod(schema),
  lmstudio: schema.make("lmstudio"),
  ollama: schema.make("ollama")
})));
const modelIdSchema = Schema.String.pipe(Schema.brand("ModelID"));
/** Branded model id schema; statics include the `zod` converter. */
export const ModelID = modelIdSchema.pipe(withStatics(schema => ({
  zod: zod(schema)
})));