/** @file Wraps a cleanup callback in a disposable so it runs via `using`/`await using` (Symbol.dispose / Symbol.asyncDispose). */

/**
 * Wraps a callback in an object that runs it when disposed.
 *
 * The returned object implements both `Symbol.dispose` (synchronous, for `using`)
 * and `Symbol.asyncDispose` (asynchronous, for `await using`), so the callback fires
 * automatically when the binding goes out of scope.
 *
 * @param {Function} fn - The cleanup callback to invoke on disposal
 * @returns {Object} A disposable object with `[Symbol.dispose]` and `[Symbol.asyncDispose]` methods
 */
export function defer(fn) {
  return {
    [Symbol.dispose]() {
      void fn();
    },
    [Symbol.asyncDispose]() {
      return Promise.resolve(fn());
    }
  };
}