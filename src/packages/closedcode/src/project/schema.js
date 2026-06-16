/** @file Schema definitions for project identifiers (branded ProjectID with `global` constant and zod bridge). */
import { Schema } from "effect";
import { zod } from "#util/effect-zod.js";
import { withStatics } from "#util/schema.js";
const projectIdSchema = Schema.String.pipe(Schema.brand("ProjectID"));

/**
 * Branded string schema for project identifiers.
 * Exposes static `global` (the well-known global project id) and `zod`
 * (an equivalent zod schema) helpers.
 */
export const ProjectID = projectIdSchema.pipe(withStatics(schema => ({
  global: schema.make("global"),
  zod: zod(schema)
})));