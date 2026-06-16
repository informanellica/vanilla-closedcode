/** @file Scratch/placeholder module containing dummy constants and helpers. */

/** Placeholder string constant. */
export const foo = "42";

/** Placeholder numeric constant. */
export const bar = 123;

/**
 * Logs a fixed message to the console; has no other effect.
 *
 * @returns {void}
 */
export function dummyFunction() {
  console.log("This is a dummy function");
}

/**
 * Returns a pseudo-random boolean.
 *
 * @returns {boolean} `true` roughly half the time (when `Math.random()` exceeds 0.5).
 */
export function randomHelper() {
  return Math.random() > 0.5;
}