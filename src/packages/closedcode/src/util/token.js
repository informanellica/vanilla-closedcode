/** @module closedcode/util/token */
/** @file Rough token-count estimation based on a fixed characters-per-token ratio. */

/** Approximate number of characters represented by a single token. */
const CHARS_PER_TOKEN = 4;

/**
 * Estimates the token count of a string using a fixed characters-per-token ratio.
 *
 * @param {string} input - Text to estimate; falsy values are treated as empty.
 * @returns {number} Estimated token count, never negative.
 */
export function estimate(input) {
  return Math.max(0, Math.round((input || "").length / CHARS_PER_TOKEN));
}
export * as Token from "./token.js";