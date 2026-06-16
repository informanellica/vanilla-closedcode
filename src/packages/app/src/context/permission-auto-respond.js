/** @file Pure helpers for the permission auto-accept store: builds the storage keys and decides whether a permission request should be auto-responded to, considering session lineage and directory-wide rules. */
import { base64Encode } from "core/util/encode";
/**
 * Builds the auto-accept storage key for a session, scoped by directory when one is given.
 * @param {string} sessionID - The session id.
 * @param {string} directory - The directory the session belongs to (optional).
 * @returns {string} The key (`<base64(dir)>/<sessionID>` when scoped, otherwise the bare session id).
 */
export function acceptKey(sessionID, directory) {
  if (!directory) return sessionID;
  return `${base64Encode(directory)}/${sessionID}`;
}
/**
 * Builds the directory-wide auto-accept key (matches every session in the directory).
 * @param {string} directory - The directory.
 * @returns {string} The wildcard key (`<base64(dir)>/*`).
 */
export function directoryAcceptKey(directory) {
  return `${base64Encode(directory)}/*`;
}
/**
 * Looks up the auto-accept value for a session, preferring the directory-scoped key,
 * then the bare session key, then the directory-wide wildcard.
 * @param {Object} autoAccept - The auto-accept store (key to boolean map).
 * @param {string} sessionID - The session id.
 * @param {string} directory - The directory the session belongs to (optional).
 * @returns {boolean} The stored value, or undefined when no key matches.
 */
function accepted(autoAccept, sessionID, directory) {
  const key = acceptKey(sessionID, directory);
  const directoryKey = directory ? directoryAcceptKey(directory) : undefined;
  return autoAccept[key] ?? autoAccept[sessionID] ?? (directoryKey ? autoAccept[directoryKey] : undefined);
}
/**
 * Reports whether directory-wide auto-accept is enabled for the given directory.
 * @param {Object} autoAccept - The auto-accept store (key to boolean map).
 * @param {string} directory - The directory.
 * @returns {boolean} True when the directory wildcard key is set to true.
 */
export function isDirectoryAutoAccepting(autoAccept, directory) {
  const key = directoryAcceptKey(directory);
  return autoAccept[key] ?? false;
}
/**
 * Walks the parent chain of a session to produce the lineage of session ids (self first, then ancestors).
 * Cycle-safe via a visited set.
 * @param {Array} session - All sessions ({id, parentID}) for the directory.
 * @param {string} sessionID - The starting session id.
 * @returns {Array} Ordered list of session ids from the given session up through its ancestors.
 */
function sessionLineage(session, sessionID) {
  const parent = session.reduce((acc, item) => {
    if (item.parentID) acc.set(item.id, item.parentID);
    return acc;
  }, new Map());
  const seen = new Set([sessionID]);
  const ids = [sessionID];
  for (const id of ids) {
    const parentID = parent.get(id);
    if (!parentID || seen.has(parentID)) continue;
    seen.add(parentID);
    ids.push(parentID);
  }
  return ids;
}
/**
 * Decides whether a permission request should be auto-responded to.
 * A child session inherits auto-accept from any ancestor; the first defined value along the lineage wins.
 * @param {Object} autoAccept - The auto-accept store (key to boolean map).
 * @param {Array} session - All sessions ({id, parentID}) for the directory.
 * @param {Object} permission - The permission request (must include `sessionID`).
 * @param {string} directory - The directory the permission belongs to (optional).
 * @returns {boolean} True when the request should be auto-accepted, otherwise false.
 */
export function autoRespondsPermission(autoAccept, session, permission, directory) {
  const value = sessionLineage(session, permission.sessionID).map(id => accepted(autoAccept, id, directory)).find(item => item !== undefined);
  return value ?? false;
}