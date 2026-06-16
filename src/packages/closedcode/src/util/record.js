/** @file Type guard for plain record/object values. */

/**
 * Test whether a value is a non-null, non-array object (a plain record).
 * @param {*} value - The value to test.
 * @returns {boolean} True if `value` is a non-null object that is not an array.
 */
export function isRecord(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}