/** @file In-memory LRU handoff store carrying session prompt/file state and terminal state across navigations. */
const MAX = 40;
const store = {
  session: new Map(),
  terminal: new Map()
};
/**
 * Insert/refresh a key in an LRU map, evicting the oldest entries past MAX.
 * @param {Map} map - The LRU map to mutate.
 * @param {string} key - Entry key (re-inserted to mark as most-recently-used).
 * @param {*} value - Value to store for the key.
 * @returns {void}
 */
const touch = (map, key, value) => {
  map.delete(key);
  map.set(key, value);
  while (map.size > MAX) {
    const first = map.keys().next().value;
    if (first === undefined) return;
    map.delete(first);
  }
};
/**
 * Merge a partial patch into the stored session handoff for a key (creating a default record when absent).
 * @param {string} key - Session key.
 * @param {Object} patch - Partial handoff fields to merge (e.g. prompt, files).
 * @returns {void}
 */
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
/**
 * Read the stored session handoff for a key.
 * @param {string} key - Session key.
 * @returns {Object} The handoff record, or undefined when none exists.
 */
export const getSessionHandoff = key => store.session.get(key);
/**
 * Store the handoff value for a terminal key.
 * @param {string} key - Terminal key.
 * @param {*} value - Terminal handoff value to store.
 * @returns {void}
 */
export const setTerminalHandoff = (key, value) => {
  touch(store.terminal, key, value);
};
/**
 * Read the stored terminal handoff for a key.
 * @param {string} key - Terminal key.
 * @returns {*} The terminal handoff value, or undefined when none exists.
 */
export const getTerminalHandoff = key => store.terminal.get(key);