import { getFilename } from "core/util/path";
import { pathKey } from "@/utils/path-key.js";
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
const isRootVisibleSession = (session, directory) => pathKey(session.directory) === pathKey(directory) && !session.parentID && !session.time?.archived;
export const roots = store => (store.session ?? []).filter(session => isRootVisibleSession(session, store.path.directory));
export const sortedRootSessions = (store, now) => roots(store).sort(sortSessions(now));
export const latestRootSession = (stores, now) => stores.flatMap(roots).sort(sortSessions(now))[0];
export function hasProjectPermissions(request, include = () => true) {
  return Object.values(request ?? {}).some(list => list?.some(include));
}
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
export const displayName = project => project.name || getFilename(project.worktree);
export const errorMessage = (err, fallback) => {
  if (err && typeof err === "object" && "data" in err) {
    const data = err.data;
    if (data?.message) return data.message;
  }
  if (err instanceof Error) return err.message;
  return fallback;
};
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