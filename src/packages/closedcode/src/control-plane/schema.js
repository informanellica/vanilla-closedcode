/** @file Branded WorkspaceID schema and its helpers for generating/validating workspace identifiers. */
import { Schema } from "effect";
import { Identifier } from "#id/id.js";
import { zod, ZodOverride } from "#util/effect-zod.js";
import { withStatics } from "#util/schema.js";
const workspaceIdSchema = Schema.String.annotate({
  [ZodOverride]: Identifier.schema("workspace")
}).pipe(Schema.brand("WorkspaceID"));
/**
 * Branded string schema for workspace identifiers.
 * Adds static helpers: `ascending(id)` to build an ascending "workspace" identifier and
 * `zod` for zod-based validation.
 * @type {Schema.Schema}
 */
export const WorkspaceID = workspaceIdSchema.pipe(withStatics(schema => ({
  ascending: id => schema.make(Identifier.ascending("workspace", id)),
  zod: zod(schema)
})));