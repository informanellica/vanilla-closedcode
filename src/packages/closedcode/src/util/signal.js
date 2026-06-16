/** @file One-shot signal primitive: a promise paired with a function that resolves it. */

/**
 * Creates a one-shot signal: a promise that stays pending until `trigger` is called.
 *
 * @returns {{trigger: Function, wait: Function}} Object whose `trigger()` resolves the underlying promise and `wait()` returns that promise.
 */
export function signal() {
  let resolve;
  const promise = new Promise(r => resolve = r);
  return {
    /**
     * Resolves the underlying promise, releasing any awaiters.
     *
     * @returns {void}
     */
    trigger() {
      return resolve();
    },
    /**
     * Returns the promise that resolves once `trigger` is called.
     *
     * @returns {Promise} The signal promise.
     */
    wait() {
      return promise;
    }
  };
}