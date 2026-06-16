/** @file Pure helpers for trimming a directory's session list down to a kept set of roots, recent roots, and their relevant children. */
import { cmp } from "./utils.js";
import { SESSION_RECENT_LIMIT, SESSION_RECENT_WINDOW } from "./types.js";
/**
 * Resolve a session's effective update timestamp, falling back to its creation time.
 * @param {Object} session - Session with a `time` object {updated, created}.
 * @returns {number} The updated timestamp, or the created timestamp when unset.
 */
export function sessionUpdatedAt(session) {
  return session.time.updated ?? session.time.created;
}
/**
 * Comparator ordering sessions most-recently-updated first, breaking ties by ascending id.
 * @param {Object} a - First session.
 * @param {Object} b - Second session.
 * @returns {number} Negative if `a` sorts before `b`, positive if after, zero if equal.
 */
export function compareSessionRecent(a, b) {
  const aUpdated = sessionUpdatedAt(a);
  const bUpdated = sessionUpdatedAt(b);
  if (aUpdated !== bUpdated) return bUpdated - aUpdated;
  return cmp(a.id, b.id);
}
/**
 * Select up to `limit` most-recent sessions updated after `cutoff`, deduplicated by id and kept sorted recent-first.
 * @param {Array} sessions - Candidate sessions; entries without an id are skipped.
 * @param {number} limit - Maximum number of sessions to retain.
 * @param {number} cutoff - Timestamp threshold; sessions updated at or before it are excluded.
 * @returns {Array} The selected sessions, ordered most-recently-updated first.
 */
export function takeRecentSessions(sessions, limit, cutoff) {
  if (limit <= 0) return [];
  const selected = [];
  const seen = new Set();
  for (const session of sessions) {
    if (!session?.id) continue;
    if (seen.has(session.id)) continue;
    seen.add(session.id);
    if (sessionUpdatedAt(session) <= cutoff) continue;
    const index = selected.findIndex(x => compareSessionRecent(session, x) < 0);
    if (index === -1) selected.push(session);
    if (index !== -1) selected.splice(index, 0, session);
    if (selected.length > limit) selected.pop();
  }
  return selected;
}
/**
 * Trim a session list to a manageable kept set: the first `limit` root sessions, recently-updated roots beyond that,
 * and children that belong to a kept root, carry permissions, or were updated within the recent window.
 * Archived sessions and entries without ids are dropped; the result is sorted by ascending id.
 * @param {Array} input - All sessions for the directory.
 * @param {Object} options - Trim options: {limit: number, now: number, permission: Object}. `now` defaults to Date.now(); `permission` maps session id to an array.
 * @returns {Array} The retained sessions sorted by ascending id.
 */
export function trimSessions(input, options) {
  const limit = Math.max(0, options.limit);
  const cutoff = (options.now ?? Date.now()) - SESSION_RECENT_WINDOW;
  const all = input.filter(s => !!s?.id).filter(s => !s.time?.archived).sort((a, b) => cmp(a.id, b.id));
  const roots = all.filter(s => !s.parentID);
  const children = all.filter(s => !!s.parentID);
  const base = roots.slice(0, limit);
  const recent = takeRecentSessions(roots.slice(limit), SESSION_RECENT_LIMIT, cutoff);
  const keepRoots = [...base, ...recent];
  const keepRootIds = new Set(keepRoots.map(s => s.id));
  const keepChildren = children.filter(s => {
    if (s.parentID && keepRootIds.has(s.parentID)) return true;
    const perms = options.permission[s.id] ?? [];
    if (perms.length > 0) return true;
    return sessionUpdatedAt(s) > cutoff;
  });
  return [...keepRoots, ...keepChildren].sort((a, b) => cmp(a.id, b.id));
}