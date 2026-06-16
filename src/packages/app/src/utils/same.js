/** @file Shallow array-equality helper used as a memo `equals` comparator. */

/**
 * Shallow equality check for two array-like values (used as a Solid memo
 * `equals` so a memo re-emitting the same elements does not notify dependents).
 * @param {Array} a - First array-like value.
 * @param {Array} b - Second array-like value.
 * @returns {boolean} True when both are the same reference, or have equal length and identical elements by `===`.
 */
export function same(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  return a.every((x, i) => x === b[i]);
}