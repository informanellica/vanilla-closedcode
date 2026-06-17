/** @file Helper that wraps a callback with Zod input validation and exposes a bypass and the schema. */

/**
 * Wrap a callback so its input is validated against a Zod schema before invocation.
 * The returned function also carries `force` (invoke without validation) and `schema` properties.
 * @param {Object} schema - A Zod schema used to parse/validate the input.
 * @param {Function} cb - The callback invoked with the parsed (or raw, via `force`) input.
 * @returns {Function} A wrapper function with `.force` and `.schema` attached.
 */
export function fn(schema, cb) {
  const result = input => {
    const parsed = schema.parse(input);
    return cb(parsed);
  };
  result.force = input => cb(input);
  result.schema = schema;
  return result;
}