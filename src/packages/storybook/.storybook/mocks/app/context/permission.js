const accepted = new Set();
function key(sessionID, directory) {
  return `${directory ?? ""}:${sessionID}`;
}
export function usePermission() {
  return {
    autoResponds() {
      return false;
    },
    isAutoAccepting(sessionID, directory) {
      return accepted.has(key(sessionID, directory));
    },
    toggleAutoAccept(sessionID, directory) {
      const next = key(sessionID, directory);
      if (accepted.has(next)) {
        accepted.delete(next);
        return;
      }
      accepted.add(next);
    }
  };
}