import { Schema } from "effect";
import z from "zod";
import { zod } from "@/util/effect-zod.js";

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
    static isInstance(input) {
      return typeof input === "object" && input !== null && "name" in input && input.name === tag;
    }
    name = tag;
    constructor(data, options) {
      super(tag, options);
      this.data = data;
    }
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