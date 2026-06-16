/** @file Schema-validated function wrapper built on Zod. */

import { z } from "zod";

/**
 * Wrap a callback so its input is validated against a Zod schema before the
 * callback runs.
 *
 * The returned function parses its argument with `schema` and passes the parsed
 * result to `cb`; on validation failure it logs a trace plus the Zod issues and
 * rethrows. The wrapper also exposes `.force` (calls `cb` with the raw input,
 * skipping validation) and `.schema` (the original schema).
 *
 * @param {Object} schema - A Zod schema used to validate/parse the input.
 * @param {Function} cb - The callback invoked with the parsed input.
 * @returns {Function} A validating wrapper around `cb`, augmented with
 *   `force(input)` (bypasses validation) and `schema` (the provided schema).
 */
export function fn(schema, cb) {
  const result = input => {
    let parsed;
    try {
      parsed = schema.parse(input);
    } catch (e) {
      console.trace("schema validation failure stack trace:");
      if (e instanceof z.ZodError) {
        console.error("schema validation issues:", JSON.stringify(e.issues, null, 2));
      }
      throw e;
    }
    return cb(parsed);
  };
  result.force = input => cb(input);
  result.schema = schema;
  return result;
}