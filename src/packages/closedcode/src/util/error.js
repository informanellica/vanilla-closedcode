/** @file Helpers for normalizing arbitrary thrown values into readable text and structured data. */

import { isRecord } from "./record.js";

/**
 * Render an arbitrary error value as a human-readable string.
 *
 * For `Error` instances prefers the stack, falling back to `name: message`.
 * Plain objects are JSON-stringified (with a fallback message when not
 * serializable). Everything else is coerced via `String`.
 *
 * @param {*} error - The thrown value to format.
 * @returns {string} A readable representation of `error`.
 */
export function errorFormat(error) {
  if (error instanceof Error) {
    return error.stack ?? `${error.name}: ${error.message}`;
  }
  if (typeof error === "object" && error !== null) {
    try {
      return JSON.stringify(error, null, 2);
    } catch {
      return "Unexpected error (unserializable)";
    }
  }
  return String(error);
}
/**
 * Extract the most meaningful message from an arbitrary error value.
 *
 * Checks, in order: an `Error`'s `message` then `name`; a record's `message`
 * or nested `data.message`; the `String` coercion (unless it is the unhelpful
 * `"[object Object]"`); and finally the formatted form. Returns
 * `"unknown error"` when nothing usable is found.
 *
 * @param {*} error - The thrown value to extract a message from.
 * @returns {string} The best available message string.
 */
export function errorMessage(error) {
  if (error instanceof Error) {
    if (error.message) return error.message;
    if (error.name) return error.name;
  }
  if (isRecord(error) && typeof error.message === "string" && error.message) {
    return error.message;
  }
  if (isRecord(error) && isRecord(error.data) && typeof error.data.message === "string" && error.data.message) {
    return error.data.message;
  }
  const text = String(error);
  if (text && text !== "[object Object]") return text;
  const formatted = errorFormat(error);
  if (formatted && formatted !== "{}") return formatted;
  return "unknown error";
}
/**
 * Convert an arbitrary error value into a flat, serializable data record.
 *
 * For `Error` instances returns `{ type, message, stack, cause, formatted }`.
 * For non-records returns `{ type, message, formatted }`. For other records,
 * copies own enumerable properties (stringifying non-primitive values, using
 * `.message` for nested `Error`s) and backfills `message`, `type`, and
 * `formatted`.
 *
 * @param {*} error - The thrown value to describe.
 * @returns {Object} A plain object capturing the error's relevant fields.
 */
export function errorData(error) {
  if (error instanceof Error) {
    return {
      type: error.name,
      message: errorMessage(error),
      stack: error.stack,
      cause: error.cause === undefined ? undefined : errorFormat(error.cause),
      formatted: errorFormatted(error)
    };
  }
  if (!isRecord(error)) {
    return {
      type: typeof error,
      message: errorMessage(error),
      formatted: errorFormatted(error)
    };
  }
  const data = Object.getOwnPropertyNames(error).reduce((acc, key) => {
    const value = error[key];
    if (value === undefined) return acc;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      acc[key] = value;
      return acc;
    }
    // oxlint-disable-next-line no-base-to-string -- intentional coercion of arbitrary error properties
    acc[key] = value instanceof Error ? value.message : String(value);
    return acc;
  }, {});
  if (typeof data.message !== "string") data.message = errorMessage(error);
  if (typeof data.type !== "string") data.type = error.constructor?.name;
  data.formatted = errorFormatted(error);
  return data;
}
/**
 * Format an error, falling back to its `String` coercion when the formatted
 * form is just an empty object (`"{}"`).
 *
 * @param {*} error - The thrown value to format.
 * @returns {string} The formatted representation, or the `String` coercion.
 */
function errorFormatted(error) {
  const formatted = errorFormat(error);
  if (formatted !== "{}") return formatted;
  return String(error);
}