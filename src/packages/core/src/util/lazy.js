/** @file Helper that memoizes a zero-argument factory so it runs at most once. */

/**
 * Create a lazily-evaluated, memoized accessor. The factory runs on first call;
 * subsequent calls return the cached value (including undefined).
 * @param {Function} fn - Zero-argument factory producing the value to cache.
 * @returns {Function} A getter that returns the memoized value.
 */
export function lazy(fn) {
  let value;
  let loaded = false;
  return () => {
    if (loaded) return value;
    loaded = true;
    value = fn();
    return value;
  };
}