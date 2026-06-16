/** @file Per-session store cache maintenance: dropping cached data for stale sessions and picking sessions to evict under the cache limit. */
/** Maximum number of sessions whose data is retained in a directory store cache. */
export const SESSION_CACHE_LIMIT = 40;
/**
 * Delete all cached store data (parts, messages, todos, diffs, statuses, permissions, questions) for the given sessions.
 * @param {Object} store - Mutable directory store with keyed sub-maps (part, message, todo, session_diff, session_status, permission, question).
 * @param {Iterable} sessionIDs - Session IDs whose cached data should be removed; falsy entries are ignored.
 */
export function dropSessionCaches(store, sessionIDs) {
  const stale = new Set(Array.from(sessionIDs).filter(Boolean));
  if (stale.size === 0) return;
  for (const key of Object.keys(store.part)) {
    const parts = store.part[key];
    if (!parts?.some(part => stale.has(part?.sessionID ?? ""))) continue;
    delete store.part[key];
  }
  for (const sessionID of stale) {
    delete store.message[sessionID];
    delete store.todo[sessionID];
    delete store.session_diff[sessionID];
    delete store.session_status[sessionID];
    delete store.permission[sessionID];
    delete store.question[sessionID];
  }
}
/**
 * Choose stale session IDs to evict from an LRU `seen` set so its size returns to the limit.
 * The `keep` session is marked most-recently-used; `keep` plus any `preserve` IDs are never evicted.
 * Mutates `input.seen` by promoting `keep` and removing the chosen stale IDs.
 * @param {Object} input - Eviction inputs: {seen: Set, keep: *, preserve: Iterable, limit: number}.
 * @returns {Array} Session IDs evicted from the `seen` set.
 */
export function pickSessionCacheEvictions(input) {
  const stale = [];
  const keep = new Set([input.keep, ...Array.from(input.preserve ?? [])]);
  if (input.seen.has(input.keep)) input.seen.delete(input.keep);
  input.seen.add(input.keep);
  for (const id of input.seen) {
    if (input.seen.size - stale.length <= input.limit) break;
    if (keep.has(id)) continue;
    stale.push(id);
  }
  for (const id of stale) {
    input.seen.delete(id);
  }
  return stale;
}