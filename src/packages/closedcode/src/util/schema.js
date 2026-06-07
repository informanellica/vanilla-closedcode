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
 */
export function Newtype() {
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