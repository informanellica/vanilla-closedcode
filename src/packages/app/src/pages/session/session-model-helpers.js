/** @file Thin helpers for resetting and restoring the local session model. */

/**
 * Clears the local session model back to its initial empty state.
 * @param {Object} local - The local session store exposing `session.reset()`.
 * @returns {void}
 */
export const resetSessionModel = local => {
  local.session.reset();
};
/**
 * Restores the local session model from a serialized message snapshot.
 * @param {Object} local - The local session store exposing `session.restore()`.
 * @param {*} msg - The message/state snapshot to restore.
 * @returns {void}
 */
export const syncSessionModel = (local, msg) => {
  local.session.restore(msg);
};