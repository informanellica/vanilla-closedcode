/** @file Config schema describing where skills are sourced from (extra paths and remote URLs). */
import { Schema } from "effect";
import { zod } from "#util/effect-zod.js";
import { withStatics } from "#util/schema.js";
/**
 * Schema for the skills section of the configuration.
 * Carries optional additional skill folder paths and optional remote skill URLs,
 * with a derived `zod` static for zod-based validation.
 * @type {Schema.Struct}
 */
export const Info = Schema.Struct({
  paths: Schema.optional(Schema.Array(Schema.String)).annotate({
    description: "Additional paths to skill folders"
  }),
  urls: Schema.optional(Schema.Array(Schema.String)).annotate({
    description: "URLs to fetch skills from (e.g., https://example.com/.well-known/skills/)"
  })
}).pipe(withStatics(s => ({
  zod: zod(s)
})));
export * as ConfigSkills from "./skills.js";