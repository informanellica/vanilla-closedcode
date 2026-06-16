/** @file Promise helper that rejects if the wrapped promise does not settle within a deadline. */

/**
 * Races a promise against a timeout, rejecting if it does not settle in time.
 *
 * @param {Promise} promise - The promise to wrap; its timer is cleared once it settles.
 * @param {number} ms - Timeout in milliseconds before rejection.
 * @returns {Promise} A promise that resolves/rejects with `promise`, or rejects with a timeout `Error` after `ms`.
 */
export function withTimeout(promise, ms) {
  let timeout;
  return Promise.race([promise.finally(() => {
    clearTimeout(timeout);
  }), new Promise((_, reject) => {
    timeout = setTimeout(() => {
      reject(new Error(`Operation timed out after ${ms}ms`));
    }, ms);
  })]);
}