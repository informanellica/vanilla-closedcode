/** @file Tiny helper to immediately invoke a function expression (inline IIFE). */

/**
 * Immediately invoke the given function and return its result.
 * @param {Function} fn - The function to call right away.
 * @returns {*} Whatever `fn` returns.
 */
export function iife(fn) {
  return fn();
}