function sessionTreeRequest(session, request, sessionID, include = () => true) {
  if (!sessionID) return;
  const map = session.reduce((acc, item) => {
    if (!item.parentID) return acc;
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
  const id = ids.find(id => request[id]?.some(include));
  if (!id) return;
  return request[id]?.find(include);
}
export function sessionPermissionRequest(session, request, sessionID, include) {
  return sessionTreeRequest(session, request, sessionID, include);
}
export function sessionQuestionRequest(session, request, sessionID, include) {
  return sessionTreeRequest(session, request, sessionID, include);
}