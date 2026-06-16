/** @file Module-level cache and in-flight tracking for session message prefetches, keyed by directory + session, with TTL and revision-based invalidation. */
/**
 * Build the cache key combining directory and session ID (newline-separated to avoid collisions).
 * @param {*} directory - Directory descriptor or path key.
 * @param {*} sessionID - Session identifier.
 * @returns {string} Composite cache key.
 */
const key = (directory, sessionID) => `${directory}\n${sessionID}`;
/** Time-to-live, in milliseconds, before a cached prefetch entry is considered stale. */
export const SESSION_PREFETCH_TTL = 15_000;
/**
 * Decide whether a session prefetch can be skipped given the existing cache entry and request shape.
 * For a message-driven request, skips when complete or the cached limit already exceeds the chunk; otherwise skips while within the TTL.
 * @param {Object} input - Decision inputs: {message: *, info: Object, chunk: number, now: number}. `info` holds {complete: boolean, limit: number, at: number}.
 * @returns {boolean} True when the prefetch should be skipped.
 */
export function shouldSkipSessionPrefetch(input) {
  if (input.message) {
    if (!input.info) return true;
    if (input.info.complete) return true;
    if (input.info.limit > input.chunk) return true;
  } else {
    if (!input.info) return false;
  }
  return (input.now ?? Date.now()) - input.info.at < SESSION_PREFETCH_TTL;
}
const cache = new Map();
const inflight = new Map();
const rev = new Map();
/**
 * Current revision number for a cache key; entries default to 0 and increment on invalidation.
 * @param {string} id - Composite cache key.
 * @returns {number} The key's current revision.
 */
const version = id => rev.get(id) ?? 0;
/**
 * Read the cached prefetch metadata for a session.
 * @param {*} directory - Directory descriptor or path key.
 * @param {*} sessionID - Session identifier.
 * @returns {Object} Cached entry {limit, cursor, complete, at}, or undefined when absent.
 */
export function getSessionPrefetch(directory, sessionID) {
  return cache.get(key(directory, sessionID));
}
/**
 * Read the in-flight prefetch promise for a session, if one is running.
 * @param {*} directory - Directory descriptor or path key.
 * @param {*} sessionID - Session identifier.
 * @returns {Promise} The pending prefetch promise, or undefined when none is in flight.
 */
export function getSessionPrefetchPromise(directory, sessionID) {
  return inflight.get(key(directory, sessionID));
}
/** Clear all tracked in-flight prefetch promises (e.g. on teardown). */
export function clearSessionPrefetchInflight() {
  inflight.clear();
}
/**
 * Check whether a captured revision still matches the current revision for a session (i.e. not invalidated since).
 * @param {*} directory - Directory descriptor or path key.
 * @param {*} sessionID - Session identifier.
 * @param {number} value - Previously captured revision number.
 * @returns {boolean} True when the prefetch result is still current.
 */
export function isSessionPrefetchCurrent(directory, sessionID, value) {
  return version(key(directory, sessionID)) === value;
}
/**
 * Run a prefetch task for a session, deduplicating against any already-running promise for the same key.
 * The task receives the captured revision so its caller can detect invalidation; the in-flight entry self-clears on settle.
 * @param {Object} input - Run inputs: {directory: *, sessionID: *, task: Function}. `task` accepts the revision number and returns a Promise.
 * @returns {Promise} The shared in-flight promise for this session.
 */
export function runSessionPrefetch(input) {
  const id = key(input.directory, input.sessionID);
  const pending = inflight.get(id);
  if (pending) return pending;
  const value = version(id);
  const promise = input.task(value).finally(() => {
    if (inflight.get(id) === promise) inflight.delete(id);
  });
  inflight.set(id, promise);
  return promise;
}
/**
 * Store prefetch metadata for a session in the cache, stamping the access time when not provided.
 * @param {Object} input - Cache entry inputs: {directory: *, sessionID: *, limit: number, cursor: *, complete: boolean, at: number}. `at` defaults to now.
 */
export function setSessionPrefetch(input) {
  cache.set(key(input.directory, input.sessionID), {
    limit: input.limit,
    cursor: input.cursor,
    complete: input.complete,
    at: input.at ?? Date.now()
  });
}
/**
 * Invalidate cached and in-flight prefetches for specific sessions, bumping each key's revision.
 * @param {*} directory - Directory descriptor or path key.
 * @param {Iterable} sessionIDs - Session IDs to invalidate; falsy entries are skipped.
 */
export function clearSessionPrefetch(directory, sessionIDs) {
  for (const sessionID of sessionIDs) {
    if (!sessionID) continue;
    const id = key(directory, sessionID);
    rev.set(id, version(id) + 1);
    cache.delete(id);
    inflight.delete(id);
  }
}
/**
 * Invalidate cached and in-flight prefetches for every session under a directory, bumping each matching key's revision.
 * @param {*} directory - Directory descriptor or path key whose entries should be cleared.
 */
export function clearSessionPrefetchDirectory(directory) {
  const prefix = `${directory}\n`;
  const keys = new Set([...cache.keys(), ...inflight.keys()]);
  for (const id of keys) {
    if (!id.startsWith(prefix)) continue;
    rev.set(id, version(id) + 1);
    cache.delete(id);
    inflight.delete(id);
  }
}