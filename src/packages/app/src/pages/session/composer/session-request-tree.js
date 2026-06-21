/** @file Walks the session/sub-session tree to find a pending permission or question request. */

/**
 * Find the first request (matching the include predicate) belonging to the
 * given session or any of its descendant sub-sessions.
 * @param {Array} session - Flat list of session items, each with `id` and optional `parentID`.
 * @param {Object} request - Map of session id to an array of pending requests.
 * @param {string} sessionID - Root session id to start the descendant walk from.
 * @param {Function} include - Predicate testing whether a request is eligible; defaults to accept-all.
 * @returns {*} The first matching request, or undefined when none is found.
 */
function sessionTreeRequest(session, request, sessionID, include = () => true) {
  if (!sessionID) return;
  // Defensive against a transiently undefined/holey session list (the synced
  // list can momentarily hold gaps while a turn streams): skip null entries and
  // optional-chain `request` so this composer-render path never throws.
  const map = (session ?? []).reduce((acc, item) => {
    if (!item?.parentID) return acc;
    const list = acc.get(item.parentID);
    if (list) list.push(item.id);
    if (!list) acc.set(item.parentID, [item.id]);
    return acc;
  }, new Map());
  const seen = new Set([sessionID]);
  const ids = [sessionID];
  for (const id of ids) {
    const list = map.get(id);
    if (!list) continue;
    for (const child of list) {
      if (seen.has(child)) continue;
      seen.add(child);
      ids.push(child);
    }
  }
  const id = ids.find(id => request?.[id]?.some(include));
  if (!id) return;
  return request?.[id]?.find(include);
}
/**
 * Find a pending permission request for the session tree.
 * @param {Array} session - Flat list of session items.
 * @param {Object} request - Map of session id to pending permission requests.
 * @param {string} sessionID - Root session id.
 * @param {Function} include - Predicate selecting eligible requests.
 * @returns {*} The matching permission request, or undefined.
 */
export function sessionPermissionRequest(session, request, sessionID, include) {
  return sessionTreeRequest(session, request, sessionID, include);
}
/**
 * Find a pending question request for the session tree.
 * @param {Array} session - Flat list of session items.
 * @param {Object} request - Map of session id to pending question requests.
 * @param {string} sessionID - Root session id.
 * @param {Function} include - Predicate selecting eligible requests.
 * @returns {*} The matching question request, or undefined.
 */
export function sessionQuestionRequest(session, request, sessionID, include) {
  return sessionTreeRequest(session, request, sessionID, include);
}