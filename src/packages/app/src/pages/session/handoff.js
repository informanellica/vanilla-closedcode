const MAX = 40;
const store = {
  session: new Map(),
  terminal: new Map()
};
const touch = (map, key, value) => {
  map.delete(key);
  map.set(key, value);
  while (map.size > MAX) {
    const first = map.keys().next().value;
    if (first === undefined) return;
    map.delete(first);
  }
};
export const setSessionHandoff = (key, patch) => {
  const prev = store.session.get(key) ?? {
    prompt: "",
    files: {}
  };
  touch(store.session, key, {
    ...prev,
    ...patch
  });
};
export const getSessionHandoff = key => store.session.get(key);
export const setTerminalHandoff = (key, value) => {
  touch(store.terminal, key, value);
};
export const getTerminalHandoff = key => store.terminal.get(key);