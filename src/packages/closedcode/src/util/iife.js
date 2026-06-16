/** @file Immediately-invoked function expression helper. */

/**
 * Immediately invoke a function and return its result.
 * Useful for inlining a small block of computed setup as a single expression.
 *
 * @param {Function} fn - The function to invoke immediately.
 * @returns {*} The value returned by `fn`.
 */
export function iife(fn) {
  return fn();
}