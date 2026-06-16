/**
 * @file Effect schemas for permission config: the `ask`/`allow`/`deny` actions,
 * per-target rule maps, and the per-tool permission input (with shorthand
 * normalization) used to decide which operations require confirmation.
 * @module closedcode/config/permission
 */

export * as ConfigPermission from "./permission.js";
import { Schema, SchemaGetter } from "effect";
import { zod } from "#util/effect-zod.js";
import { withStatics } from "#util/schema.js";

/** Schema for a single permission decision: `"ask"`, `"allow"`, or `"deny"`. */
export const Action = Schema.Literals(["ask", "allow", "deny"]).annotate({
  identifier: "PermissionActionConfig"
}).pipe(withStatics(s => ({
  zod: zod(s)
})));

/** Schema for a map of target pattern to {@link Action} (per-target rules). */
export const Object = Schema.Record(Schema.String, Action).annotate({
  identifier: "PermissionObjectConfig"
}).pipe(withStatics(s => ({
  zod: zod(s)
})));

/** Schema for a permission rule: either a single {@link Action} or an {@link Object} of per-target actions. */
export const Rule = Schema.Union([Action, Object]).annotate({
  identifier: "PermissionRuleConfig"
}).pipe(withStatics(s => ({
  zod: zod(s)
})));
// Known permission keys get explicit types in the Effect schema for generated
// docs/types. Runtime config parsing uses Effect's `propertyOrder: "original"`
// parse option so user key order is preserved for permission precedence.
const InputObject = Schema.StructWithRest(Schema.Struct({
  read: Schema.optional(Rule),
  edit: Schema.optional(Rule),
  glob: Schema.optional(Rule),
  grep: Schema.optional(Rule),
  list: Schema.optional(Rule),
  bash: Schema.optional(Rule),
  task: Schema.optional(Rule),
  external_directory: Schema.optional(Rule),
  todowrite: Schema.optional(Action),
  question: Schema.optional(Action),
  webfetch: Schema.optional(Action),
  websearch: Schema.optional(Action),
  lsp: Schema.optional(Rule),
  doom_loop: Schema.optional(Action),
  skill: Schema.optional(Rule)
}), [Schema.Record(Schema.String, Rule)]);

// Input the user writes in config: either a single Action (shorthand for "*")
// or an object of per-target rules.
const InputSchema = Schema.Union([Action, InputObject]);

// Normalise the Action shorthand into `{ "*": action }`. Object inputs pass
// through untouched.
/**
 * Normalize a permission input into its object form.
 * @param {string|Object} input - Either an Action shorthand string or a per-target rule object.
 * @returns {Object} `{ "*": input }` for a string shorthand, or the object unchanged.
 */
const normalizeInput = input => typeof input === "string" ? {
  "*": input
} : input;

/** Schema for a fully-decoded permission config; accepts the shorthand or object input and decodes to the per-tool object form. */
export const Info = InputSchema.pipe(Schema.decodeTo(InputObject, {
  decode: SchemaGetter.transform(normalizeInput),
  // Not perfectly invertible (we lose whether the user originally typed an
  // Action shorthand), but the object form is always a valid representation
  // of the same rules.
  encode: SchemaGetter.passthrough({
    strict: false
  })
})).annotate({
  identifier: "PermissionConfig"
}).pipe(
// Walker already emits the decodeTo transform into the derived zod (see
// `encoded()` in effect-zod.ts), so just expose that directly.
withStatics(s => ({
  zod: zod(s)
})));