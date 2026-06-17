/**
 * Shared Effect Schema primitives for the v2 session model (e.g. millisecond/DateTime conversion).
 * @module closedcode/v2/schema
 */
import { DateTime, Schema, SchemaGetter } from "effect";

/**
 * Schema that encodes/decodes between an epoch-millisecond number and an Effect DateTimeUtc value.
 * Decoding turns a finite millisecond number into a DateTimeUtc; encoding turns a DateTimeUtc back into epoch millis.
 * @type {Object}
 */
export const DateTimeUtcFromMillis = Schema.Finite.pipe(Schema.decodeTo(Schema.DateTimeUtc, {
  decode: SchemaGetter.transform(value => DateTime.makeUnsafe(value)),
  encode: SchemaGetter.transform(value => DateTime.toEpochMillis(value))
}));
export * as V2Schema from "./schema.js";