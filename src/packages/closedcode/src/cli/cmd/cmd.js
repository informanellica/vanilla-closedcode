/** @file Identity helper for declaring CLI command modules with type/shape inference. */
/**
 * Identity helper that returns a yargs command-module object unchanged, used so command definitions
 * pick up the expected shape/types at their declaration site.
 * @param {Object} input - The yargs command module (command, describe, builder, handler).
 * @returns {Object} The same `input` object.
 */
export function cmd(input) {
  return input;
}