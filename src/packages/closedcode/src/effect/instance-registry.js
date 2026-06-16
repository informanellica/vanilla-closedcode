/** @file Global registry of per-instance disposer callbacks, run when an instance (identified by directory) is torn down. */
const disposers = new Set();
/**
 * Register a disposer to be invoked when an instance is disposed.
 * @param {Function} disposer - Callback receiving the disposed instance's directory.
 * @returns {Function} An unregister function that removes the disposer.
 */
export function registerDisposer(disposer) {
  disposers.add(disposer);
  return () => {
    disposers.delete(disposer);
  };
}
/**
 * Dispose the instance for a directory by running every registered disposer,
 * waiting for all to settle regardless of individual failures.
 * @param {string} directory - The instance directory being disposed.
 * @returns {Promise<void>} Resolves once all disposers have settled.
 */
export async function disposeInstance(directory) {
  await Promise.allSettled([...disposers].map(disposer => disposer(directory)));
}