import { base64Encode } from "core/util/encode";
export function acceptKey(sessionID, directory) {
  if (!directory) return sessionID;
  return `${base64Encode(directory)}/${sessionID}`;
}
export function directoryAcceptKey(directory) {
  return `${base64Encode(directory)}/*`;
}
function accepted(autoAccept, sessionID, directory) {
  const key = acceptKey(sessionID, directory);
  const directoryKey = directory ? directoryAcceptKey(directory) : undefined;
  return autoAccept[key] ?? autoAccept[sessionID] ?? (directoryKey ? autoAccept[directoryKey] : undefined);
}
export function isDirectoryAutoAccepting(autoAccept, directory) {
  const key = directoryAcceptKey(directory);
  return autoAccept[key] ?? false;
}
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
export function autoRespondsPermission(autoAccept, session, permission, directory) {
  const value = sessionLineage(session, permission.sessionID).map(id => accepted(autoAccept, id, directory)).find(item => item !== undefined);
  return value ?? false;
}