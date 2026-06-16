/** @file Factory for Effect Schema-backed error classes matching the legacy NamedError wire shape. */

import { Schema } from "effect";
import z from "zod";
import { zod } from "#util/effect-zod.js";

/**
 * Create a Schema-backed NamedError-shaped class.
 *
 * Drop-in replacement for `NamedError.create(tag, zodShape)` but backed by
 * `Schema.Struct` under the hood. The wire shape emitted by the derived
 * `.Schema` is still `{ name: tag, data: {...fields} }` so the generated
 * OpenAPI/SDK output is byte-identical to the original NamedError schema.
 *
 * Preserves the existing surface:
 *   - static `Schema` (Zod schema of the wire shape)
 *   - static `isInstance(x)`
 *   - instance `toObject()` returning `{ name, data }`
 *   - `new X({ ...data }, { cause })`
 *
 * @param {string} tag - The error name/tag used as the literal `name` on the wire and the class name.
 * @param {Object} fields - A map of field name to Effect Schema used to build the error's `data` struct.
 * @returns {Function} An Error subclass with static `Schema`, `EffectSchema`, `tag`, and `isInstance`, plus an instance `toObject()`.
 */
export function namedSchemaError(tag, fields) {
  // Wire shape matches the original NamedError output so the SDK stays stable.
  const dataSchema = Schema.Struct(fields);
  const wire = z.object({
    name: z.literal(tag),
    data: zod(dataSchema)
  }).meta({
    ref: tag
  });

  // Effect Schema for the wire shape — used by HttpApi OpenAPI generation.
  const effectSchema = Schema.Struct({
    name: Schema.Literal(tag),
    data: dataSchema
  }).annotate({
    identifier: tag
  });
  class NamedSchemaError extends Error {
    static Schema = wire;
    static EffectSchema = effectSchema;
    static tag = tag;
    /**
     * Structurally test whether a value is an instance of this error by matching its `name` to the tag.
     * @param {*} input - The value to test.
     * @returns {boolean} True if `input` is an object whose `name` equals the tag.
     */
    static isInstance(input) {
      return typeof input === "object" && input !== null && "name" in input && input.name === tag;
    }
    name = tag;
    /**
     * @param {Object} data - The error payload conforming to the configured `fields` schema.
     * @param {Object} [options] - Standard Error options (e.g. `{ cause }`).
     */
    constructor(data, options) {
      super(tag, options);
      this.data = data;
    }
    /**
     * Serialize the error to its wire shape.
     * @returns {{name: string, data: Object}} The `{ name, data }` representation.
     */
    toObject() {
      return {
        name: tag,
        data: this.data
      };
    }
  }
  Object.defineProperty(NamedSchemaError, "name", {
    value: tag
  });
  return NamedSchemaError;
}