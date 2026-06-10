import { Schema } from "effect";
import { zod } from "#util/effect-zod.js";
import { NonNegativeInt } from "#util/schema.js";
export class ConsoleState extends Schema.Class("ConsoleState")({
  consoleManagedProviders: Schema.mutable(Schema.Array(Schema.String)),
  activeOrgName: Schema.optional(Schema.String),
  switchableOrgCount: NonNegativeInt
}) {
  static zod = zod(this);
}
export const emptyConsoleState = ConsoleState.make({
  consoleManagedProviders: [],
  activeOrgName: undefined,
  switchableOrgCount: 0
});