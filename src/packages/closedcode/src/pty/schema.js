/**
 * @file Schema and branded ID type for PTY sessions (`PtyID`), with an
 * ascending-id constructor and Zod interop.
 */
import { Schema } from "effect";
import { Identifier } from "#id/id.js";
import { zod, ZodOverride } from "#util/effect-zod.js";
import { withStatics } from "#util/schema.js";
const ptyIdSchema = Schema.String.annotate({
  [ZodOverride]: Identifier.schema("pty")
}).pipe(Schema.brand("PtyID"));
/**
 * Branded schema for PTY session identifiers.
 * Adds static helpers: `ascending(id)` to mint a new monotonically-ascending
 * PtyID, and `zod` for Zod-based validation.
 * @type {Object}
 */
export const PtyID = ptyIdSchema.pipe(withStatics(schema => ({
  ascending: id => schema.make(Identifier.ascending("pty", id)),
  zod: zod(schema)
})));