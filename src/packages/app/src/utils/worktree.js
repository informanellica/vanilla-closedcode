/** @file Worktree status registry: tracks per-directory pending/ready/failed state and lets callers await readiness. */
/**
 * Strip trailing slashes/backslashes so a directory maps to a single registry key.
 * @param {string} directory - A worktree directory path.
 * @returns {string} The normalized key (no trailing separators).
 */
const normalize = directory => directory.replace(/[\\/]+$/, "");
const state = new Map();
const waiters = new Map();
/**
 * Create a deferred: a promise paired with its resolve function.
 * @returns {Object} An object with `promise` and `resolve` fields.
 */
function deferred() {
  const box = {
    resolve: _ => {}
  };
  const promise = new Promise(resolve => {
    box.resolve = resolve;
  });
  return {
    promise,
    resolve: box.resolve
  };
}
/**
 * Registry tracking each worktree directory's lifecycle state (pending/ready/failed)
 * and resolving pending waiters when a terminal state is reached.
 */
export const Worktree = {
  /**
   * Get the current state record for a directory.
   * @param {string} directory - The worktree directory path.
   * @returns {Object} The state record ({ status, ... }), or undefined if unknown.
   */
  get(directory) {
    return state.get(normalize(directory));
  },
  /**
   * Mark a directory as pending (no-op if it already has a non-pending state).
   * @param {string} directory - The worktree directory path.
   * @returns {void}
   */
  pending(directory) {
    const key = normalize(directory);
    const current = state.get(key);
    if (current && current.status !== "pending") return;
    state.set(key, {
      status: "pending"
    });
  },
  /**
   * Mark a directory ready and resolve any pending waiter.
   * @param {string} directory - The worktree directory path.
   * @returns {void}
   */
  ready(directory) {
    const key = normalize(directory);
    const next = {
      status: "ready"
    };
    state.set(key, next);
    const waiter = waiters.get(key);
    if (!waiter) return;
    waiters.delete(key);
    waiter.resolve(next);
  },
  /**
   * Mark a directory failed (with a message) and resolve any pending waiter.
   * @param {string} directory - The worktree directory path.
   * @param {string} message - Failure description stored on the state record.
   * @returns {void}
   */
  failed(directory, message) {
    const key = normalize(directory);
    const next = {
      status: "failed",
      message
    };
    state.set(key, next);
    const waiter = waiters.get(key);
    if (!waiter) return;
    waiters.delete(key);
    waiter.resolve(next);
  },
  /**
   * Await a directory's terminal state, resolving immediately if it is already
   * ready/failed, otherwise resolving when ready()/failed() is next called.
   * @param {string} directory - The worktree directory path.
   * @returns {Promise<Object>} Resolves to the terminal state record.
   */
  wait(directory) {
    const key = normalize(directory);
    const current = state.get(key);
    if (current && current.status !== "pending") return Promise.resolve(current);
    const existing = waiters.get(key);
    if (existing) return existing.promise;
    const waiter = deferred();
    waiters.set(key, waiter);
    return waiter.promise;
  }
};