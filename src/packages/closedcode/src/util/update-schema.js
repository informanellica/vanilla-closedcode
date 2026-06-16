/** @file Helper that derives a fully-nullable Zod object schema from an existing one. */
import z from "zod";

/**
 * Builds a new Zod object schema where every field of `schema` is required-then-nullable.
 *
 * @param {Object} schema - A Zod object schema to transform.
 * @returns {Object} A new Zod object schema with the same keys, each made nullable.
 */
export function updateSchema(schema) {
  const next = {};
  for (const [k, v] of Object.entries(schema.required().shape)) {
    next[k] = v.nullable();
  }
  return z.object(next);
}