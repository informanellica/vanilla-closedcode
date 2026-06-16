/**
 * @file Effect schema for a model identifier config value (a plain string).
 * @module closedcode/config/model-id
 */

import { Schema } from "effect";
import { zod } from "#util/effect-zod.js";
import { withStatics } from "#util/schema.js";

/** Schema for a model ID config value; a bare string with a derived zod static. */
export const ConfigModelID = Schema.String.pipe(withStatics(s => ({
  zod: zod(s)
})));