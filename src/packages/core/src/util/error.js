import z from "zod";
/**
 * @file Factory base class for named, Zod-schema-validated error types that serialize to a plain object.
 */

/**
 * Base class for structured, named errors. Use the static `create` factory to define concrete
 * error classes that carry a name, a Zod-validated `data` payload, and a serializable form.
 */
export class NamedError extends Error {
  /**
   * Check whether an arbitrary value is an error-like object with the given name.
   * @param {*} error - The value to inspect.
   * @param {string} name - The error name to match against.
   * @returns {boolean} True when error is a non-null object whose `name` equals `name`.
   */
  static hasName(error, name) {
    return typeof error === "object" && error !== null && "name" in error && error.name === name;
  }
  /**
   * Create a concrete NamedError subclass bound to a name and a Zod schema for its `data` payload.
   * The returned class exposes `Schema`, an `isInstance` guard, and `toObject`/`schema` instance methods.
   * @param {string} name - The literal error name (also used as the schema ref).
   * @param {Object} data - A Zod schema describing the shape of the error's `data` field.
   * @returns {Function} A NamedError subclass constructable as `new Subclass(data, options)`.
   */
  static create(name, data) {
    const schema = z.object({
      name: z.literal(name),
      data
    }).meta({
      ref: name
    });
    const result = class extends NamedError {
      static Schema = schema;
      name = name;
      constructor(data, options) {
        super(name, options);
        this.data = data;
        this.name = name;
      }
      /**
       * Structural guard: true when input is an object whose `name` matches this error's name.
       * @param {*} input - The value to test.
       * @returns {boolean} Whether input looks like an instance of this error type.
       */
      static isInstance(input) {
        return typeof input === "object" && "name" in input && input.name === name;
      }
      /**
       * Get the Zod schema describing this error (name plus validated data payload).
       * @returns {Object} The Zod schema for this error type.
       */
      schema() {
        return schema;
      }
      /**
       * Serialize this error to a plain, transport-friendly object.
       * @returns {Object} An object with the error `name` and its `data` payload.
       */
      toObject() {
        return {
          name: name,
          data: this.data
        };
      }
    };
    Object.defineProperty(result, "name", {
      value: name
    });
    return result;
  }
  static Unknown = NamedError.create("UnknownError", z.object({
    message: z.string()
  }));
}