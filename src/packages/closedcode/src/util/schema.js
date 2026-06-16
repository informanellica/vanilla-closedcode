/** @file Reusable Effect Schema building blocks: numeric refinements, optional-key handling, static-method attachment, and nominal newtypes. */
import { Option, Schema, SchemaGetter } from "effect";
import { zod, ZodOverride } from "./effect-zod.js";

/**
 * Integer greater than zero.
 */
export const PositiveInt = Schema.Int.check(Schema.isGreaterThan(0));

/**
 * Integer greater than or equal to zero.
 */
export const NonNegativeInt = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));

/**
 * Optional public JSON field that can hold explicit `undefined` on the type
 * side but encodes it as an omitted key, matching legacy `JSON.stringify`.
 *
 * @param {Schema} schema - The inner schema describing the field's value.
 * @returns {Schema} An optional-key schema that decodes a missing key as `undefined` and encodes `undefined` back to a missing key.
 */
export const optionalOmitUndefined = schema => Schema.optionalKey(schema).pipe(Schema.decodeTo(Schema.optional(schema), {
  decode: SchemaGetter.passthrough({
    strict: false
  }),
  encode: SchemaGetter.transformOptional(Option.filter(value => value !== undefined))
}), Schema.annotate({
  [ZodOverride]: zod(schema).optional()
}));

/**
 * Strip `readonly` from a nested type. Stand-in for `effect`'s `Types.DeepMutable`
 * until `effect:core/x228my` ("Types.DeepMutable widens unknown to `{}`") lands.
 *
 * The upstream version falls through `unknown` into `{ -readonly [K in keyof T]: ... }`
 * where `keyof unknown = never`, so `unknown` collapses to `{}`. This local
 * version gates the object branch on `extends object` (which `unknown` does
 * not) so `unknown` passes through untouched.
 *
 * Primitive bailout matches upstream — without it, branded strings like
 * `string & Brand<"SessionID">` fall into the object branch and get their
 * prototype methods walked.
 *
 * Tuple branch preserves readonly tuples (e.g. `ConfigPlugin.Spec`'s
 * `readonly [string, Options]`); the general array branch would otherwise
 * widen them to unbounded arrays.
 */
// eslint-disable-next-line @typescript-eslint/ban-types

/**
 * Attach static methods to a schema object. Designed to be used with `.pipe()`:
 *
 * @example
 *   export const Foo = fooSchema.pipe(
 *     withStatics((schema) => ({
 *       zero: schema.make(0),
 *       from: Schema.decodeUnknownOption(schema),
 *     }))
 *   )
 *
 * @param {Function} methods - Factory that receives the schema and returns an object of static members to attach.
 * @returns {Function} A pipe-able transform `(schema) => schema` that mutates the schema in place with the produced members.
 */
export const withStatics = methods => schema => Object.assign(schema, methods(schema));

/**
 * Nominal wrapper for scalar types. The class itself is a valid schema —
 * pass it directly to `Schema.decode`, `Schema.decodeEffect`, etc.
 *
 * Overrides `~type.make` on the derived `Schema.Opaque` so `Schema.Schema.Type`
 * of a field using this newtype resolves to `Self` rather than the underlying
 * branded phantom. Without that override, passing a class instance to code
 * typed against `Schema.Schema.Type<FieldSchema>` would require a cast even
 * though the values are structurally equivalent at runtime.
 *
 * @example
 *   class QuestionID extends Newtype<QuestionID>()("QuestionID", Schema.String) {
 *     static make(id: string): QuestionID {
 *       return this.make(id)
 *     }
 *   }
 *
 *   Schema.decodeEffect(QuestionID)(input)
 *
 * @returns {Function} A curried factory `(tag, schema) => Base` producing a newtype class wrapping the given schema.
 */
export function Newtype() {
  /**
   * @param {string} tag - Identifier tag for the nominal newtype.
   * @param {Schema} schema - The underlying scalar schema being wrapped.
   * @returns {Function} A class whose prototype is the schema and whose `make` returns the raw value.
   */
  return (tag, schema) => {
    class Base {
      static make(value) {
        return value;
      }
    }
    Object.setPrototypeOf(Base, schema);
    return Base;
  };
}