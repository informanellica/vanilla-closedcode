const key = (directory, sessionID) => `${directory}\n${sessionID}`;
export const SESSION_PREFETCH_TTL = 15_000;
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
const version = id => rev.get(id) ?? 0;
export function getSessionPrefetch(directory, sessionID) {
  return cache.get(key(directory, sessionID));
}
export function getSessionPrefetchPromise(directory, sessionID) {
  return inflight.get(key(directory, sessionID));
}
export function clearSessionPrefetchInflight() {
  inflight.clear();
}
export function isSessionPrefetchCurrent(directory, sessionID, value) {
  return version(key(directory, sessionID)) === value;
}
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
export function setSessionPrefetch(input) {
  cache.set(key(input.directory, input.sessionID), {
    limit: input.limit,
    cursor: input.cursor,
    complete: input.complete,
    at: input.at ?? Date.now()
  });
}
export function clearSessionPrefetch(directory, sessionIDs) {
  for (const sessionID of sessionIDs) {
    if (!sessionID) continue;
    const id = key(directory, sessionID);
    rev.set(id, version(id) + 1);
    cache.delete(id);
    inflight.delete(id);
  }
}
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