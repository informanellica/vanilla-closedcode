/** @file Pure helpers for the layout shell: session sorting/selection, project display names, error-message extraction, and persisted workspace ordering. */
import { getFilename } from "core/util/path";
import { pathKey } from "@/utils/path-key.js";
/**
 * Build a session comparator that orders recently-updated sessions (within the
 * last minute) ascending by id, places recent sessions before stale ones, and
 * orders the rest by most-recently-updated first.
 * @param {number} now - Current timestamp in milliseconds.
 * @returns {Function} A comparator (a, b) for Array.prototype.sort.
 */
function sortSessions(now) {
  const oneMinuteAgo = now - 60 * 1000;
  return (a, b) => {
    const aUpdated = a.time.updated ?? a.time.created;
    const bUpdated = b.time.updated ?? b.time.created;
    const aRecent = aUpdated > oneMinuteAgo;
    const bRecent = bUpdated > oneMinuteAgo;
    if (aRecent && bRecent) return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    if (aRecent && !bRecent) return -1;
    if (!aRecent && bRecent) return 1;
    return bUpdated - aUpdated;
  };
}
/**
 * Determine whether a session is a visible root session for a directory
 * (matching directory, no parent, not archived).
 * @param {Object} session - The session record.
 * @param {string} directory - The directory to match against.
 * @returns {boolean} True when the session is a visible root for the directory.
 */
const isRootVisibleSession = (session, directory) => pathKey(session.directory) === pathKey(directory) && !session.parentID && !session.time?.archived;
/**
 * Get the visible root sessions for a directory store.
 * @param {Object} store - The directory data store ({ session, path }).
 * @returns {Array} The visible root sessions.
 */
export const roots = store => (store.session ?? []).filter(session => isRootVisibleSession(session, store.path.directory));
/**
 * Get a directory store's root sessions sorted for display.
 * @param {Object} store - The directory data store.
 * @param {number} now - Current timestamp in milliseconds.
 * @returns {Array} The sorted root sessions.
 */
export const sortedRootSessions = (store, now) => roots(store).sort(sortSessions(now));
/**
 * Find the most recent root session across several directory stores.
 * @param {Array} stores - Directory data stores.
 * @param {number} now - Current timestamp in milliseconds.
 * @returns {Object} The latest root session, or undefined when none exist.
 */
export const latestRootSession = (stores, now) => stores.flatMap(roots).sort(sortSessions(now))[0];
/**
 * Check whether any permission list in a request matches the include predicate.
 * @param {Object} request - Map of permission lists keyed by type.
 * @param {Function} include - Predicate applied to each permission entry (defaults to always true).
 * @returns {boolean} True when at least one matching permission exists.
 */
export function hasProjectPermissions(request, include = () => true) {
  return Object.values(request ?? {}).some(list => list?.some(include));
}
/**
 * Walk the parent chain from the active session up toward the root and return
 * the direct child of the root that the active session descends from.
 * @param {Array} sessions - All sessions to walk.
 * @param {string} rootID - The root session id.
 * @param {string} activeID - The currently active session id.
 * @returns {Object} The root's child on the active path, or undefined when none applies.
 */
export const childSessionOnPath = (sessions, rootID, activeID) => {
  if (!activeID || activeID === rootID) return;
  const map = new Map((sessions ?? []).map(session => [session.id, session]));
  let id = activeID;
  while (id) {
    const session = map.get(id);
    if (!session?.parentID) return;
    if (session.parentID === rootID) return session;
    id = session.parentID;
  }
};
/**
 * Get a project's display name: its custom name, or the worktree folder name.
 * @param {Object} project - The project record ({ name, worktree }).
 * @returns {string} The display name.
 */
export const displayName = project => project.name || getFilename(project.worktree);
/**
 * Extract a human-readable message from an error of any shape, with a fallback.
 * @param {*} err - The error value (structured error, Error, or other).
 * @param {string} fallback - Message returned when none can be extracted.
 * @returns {string} The error message or the fallback.
 */
export const errorMessage = (err, fallback) => {
  if (err && typeof err === "object" && "data" in err) {
    const data = err.data;
    if (data?.message) return data.message;
  }
  if (err instanceof Error) return err.message;
  return fallback;
};
/**
 * Compute the effective ordering of workspace directories: the local root first,
 * then live directories ordered to honor a persisted order, with unknown live
 * directories appended and stale persisted entries dropped.
 * @param {string} local - The local (root) worktree directory, always placed first.
 * @param {Array} dirs - The live set of workspace directories.
 * @param {Array} persisted - The previously persisted ordering (may be undefined).
 * @returns {Array} The ordered workspace directories.
 */
export const effectiveWorkspaceOrder = (local, dirs, persisted) => {
  const root = pathKey(local);
  const live = new Map();
  for (const dir of dirs) {
    const key = pathKey(dir);
    if (key === root) continue;
    if (!live.has(key)) live.set(key, dir);
  }
  if (!persisted?.length) return [local, ...live.values()];
  const result = [local];
  for (const dir of persisted) {
    const key = pathKey(dir);
    if (key === root) continue;
    const match = live.get(key);
    if (!match) continue;
    result.push(match);
    live.delete(key);
  }
  return [...result, ...live.values()];
};