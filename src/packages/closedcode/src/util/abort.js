/** @file Helpers for building AbortControllers/AbortSignals that auto-abort after a timeout. */

/**
 * Creates an AbortController that automatically aborts after a timeout.
 *
 * Uses bind() instead of arrow functions to avoid capturing the surrounding
 * scope in closures. Arrow functions like `() => controller.abort()` capture
 * request bodies and other large objects, preventing GC for the timer lifetime.
 *
 * @param {number} ms - Timeout in milliseconds
 * @returns {Object} Object with `controller` (AbortController), `signal` (AbortSignal), and `clearTimeout` (Function that cancels the timer)
 */
export function abortAfter(ms) {
  const controller = new AbortController();
  const id = setTimeout(controller.abort.bind(controller), ms);
  return {
    controller,
    signal: controller.signal,
    clearTimeout: () => globalThis.clearTimeout(id)
  };
}

/**
 * Combines multiple AbortSignals with a timeout.
 *
 * @param {number} ms - Timeout in milliseconds
 * @param {...AbortSignal} signals - Additional signals to combine
 * @returns {Object} Object with `signal` (combined AbortSignal that aborts on timeout or when any input signal aborts) and `clearTimeout` (Function that cancels the timer)
 */
export function abortAfterAny(ms, ...signals) {
  const timeout = abortAfter(ms);
  const signal = AbortSignal.any([timeout.signal, ...signals]);
  return {
    signal,
    clearTimeout: timeout.clearTimeout
  };
}