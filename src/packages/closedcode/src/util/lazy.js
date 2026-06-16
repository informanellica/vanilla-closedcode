/** @file Lazy memoization helper that defers and caches a single computation. */

/**
 * Create a lazily-evaluated, memoized accessor for `fn`.
 *
 * The first call invokes `fn` and caches its result; subsequent calls return
 * the cached value without re-invoking `fn`. The returned accessor exposes
 * `reset()` to clear the cache and `loaded()` to query whether `fn` has run.
 *
 * @param {Function} fn - The producer whose result is computed once and cached.
 * @returns {Function} An accessor returning the cached value, augmented with
 *   `reset()` (clears the cache so the next call recomputes) and `loaded()`
 *   (returns a boolean indicating whether the value has been computed).
 */
export function lazy(fn) {
  let value;
  let loaded = false;
  const result = () => {
    if (loaded) return value;
    value = fn();
    loaded = true;
    return value;
  };
  result.reset = () => {
    loaded = false;
    value = undefined;
  };
  result.loaded = () => loaded;
  return result;
}