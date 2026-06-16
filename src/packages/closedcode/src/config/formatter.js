/** @file Config schema for code formatters (per-formatter command, env, and file extensions). */
export * as ConfigFormatter from "./formatter.js";
import { Schema } from "effect";
import { zod } from "#util/effect-zod.js";
import { withStatics } from "#util/schema.js";
/**
 * Schema for a single formatter entry: optional `disabled` flag, `command`
 * argv, `environment` variables, and the `extensions` it applies to.
 * Exposes a derived `.zod` compatibility schema.
 */
export const Entry = Schema.Struct({
  disabled: Schema.optional(Schema.Boolean),
  command: Schema.optional(Schema.mutable(Schema.Array(Schema.String))),
  environment: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  extensions: Schema.optional(Schema.mutable(Schema.Array(Schema.String)))
}).pipe(withStatics(s => ({
  zod: zod(s)
})));
/**
 * Schema for the `formatter` config value: either a boolean toggle for built-ins
 * or a record of formatter id to {@link Entry} overrides. Exposes a derived `.zod` schema.
 */
export const Info = Schema.Union([Schema.Boolean, Schema.Record(Schema.String, Entry)]).pipe(withStatics(s => ({
  zod: zod(s)
})));