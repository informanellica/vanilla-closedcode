/** @file Schema and default value for console/org-derived configuration state. */
import { Schema } from "effect";
import { zod } from "#util/effect-zod.js";
import { NonNegativeInt } from "#util/schema.js";
/**
 * Effect Schema class describing console/org-derived state: which providers are
 * managed by the console, the active org name, and the number of switchable orgs.
 * Exposes a derived `.zod` compatibility schema.
 */
export class ConsoleState extends Schema.Class("ConsoleState")({
  consoleManagedProviders: Schema.mutable(Schema.Array(Schema.String)),
  activeOrgName: Schema.optional(Schema.String),
  switchableOrgCount: NonNegativeInt
}) {
  static zod = zod(this);
}
/** A default, empty {@link ConsoleState} (no managed providers, no active org). */
export const emptyConsoleState = ConsoleState.make({
  consoleManagedProviders: [],
  activeOrgName: undefined,
  switchableOrgCount: 0
});