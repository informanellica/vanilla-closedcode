/** @file Per-session, per-tab scroll-position cache with debounced flushing to a persistence backend. */
import { createStore, produce } from "../lib/store.js";
/**
 * Create a debounced scroll-position store keyed by session and tab.
 * Positions are seeded from an external snapshot on first read, cached reactively, and flushed via `opts.onFlush` after a debounce.
 * @param {Object} opts - Collaborators: {debounceMs: number, getSnapshot: Function, onFlush: Function}. `debounceMs` defaults to 200; `getSnapshot(sessionKey)` returns saved positions; `onFlush(sessionKey, positions)` persists them.
 * @returns {Object} API: {cache, drop, flush, flushAll, scroll, seed, setScroll, dispose}.
 */
export function createScrollPersistence(opts) {
  const wait = opts.debounceMs ?? 200;
  const [cache, setCache] = createStore({});
  const dirty = new Set();
  const timers = new Map();
  /**
   * Shallow-copy a tab-keyed position map, keeping only entries with a position {x, y}.
   * @param {Object} input - Map of tab to {x, y} position.
   * @returns {Object} A new map of tab to {x, y}.
   */
  function clone(input) {
    const out = {};
    if (!input) return out;
    for (const key of Object.keys(input)) {
      const pos = input[key];
      if (!pos) continue;
      out[key] = {
        x: pos.x,
        y: pos.y
      };
    }
    return out;
  }
  /**
   * Populate the cache for a session from the external snapshot when it has no cached positions yet.
   * @param {string} sessionKey - Session identifier.
   */
  function seed(sessionKey) {
    const next = clone(opts.getSnapshot(sessionKey));
    const current = cache[sessionKey];
    if (!current) {
      setCache(sessionKey, next);
      return;
    }
    if (Object.keys(current).length > 0) return;
    if (Object.keys(next).length === 0) return;
    setCache(sessionKey, next);
  }
  /**
   * Read the saved scroll position for a session/tab, seeding from the snapshot first.
   * @param {string} sessionKey - Session identifier.
   * @param {string} tab - Tab identifier.
   * @returns {Object} The {x, y} position, or undefined when none is recorded.
   */
  function scroll(sessionKey, tab) {
    seed(sessionKey);
    return cache[sessionKey]?.[tab] ?? opts.getSnapshot(sessionKey)?.[tab];
  }
  /**
   * (Re)arm the debounce timer that flushes a session's dirty positions.
   * @param {string} sessionKey - Session identifier.
   */
  function schedule(sessionKey) {
    const prev = timers.get(sessionKey);
    if (prev) clearTimeout(prev);
    timers.set(sessionKey, setTimeout(() => flush(sessionKey), wait));
  }
  /**
   * Record a scroll position for a session/tab, marking it dirty and scheduling a flush when it changed.
   * @param {string} sessionKey - Session identifier.
   * @param {string} tab - Tab identifier.
   * @param {Object} pos - New position {x, y}.
   */
  function setScroll(sessionKey, tab, pos) {
    seed(sessionKey);
    const prev = cache[sessionKey]?.[tab];
    if (prev?.x === pos.x && prev?.y === pos.y) return;
    setCache(sessionKey, tab, {
      x: pos.x,
      y: pos.y
    });
    dirty.add(sessionKey);
    schedule(sessionKey);
  }
  /**
   * Immediately persist a session's cached positions if dirty, clearing its timer and dirty flag.
   * @param {string} sessionKey - Session identifier.
   */
  function flush(sessionKey) {
    const timer = timers.get(sessionKey);
    if (timer) clearTimeout(timer);
    timers.delete(sessionKey);
    if (!dirty.has(sessionKey)) return;
    dirty.delete(sessionKey);
    opts.onFlush(sessionKey, clone(cache[sessionKey]));
  }
  /** Flush every session that currently has dirty positions. */
  function flushAll() {
    const keys = Array.from(dirty);
    if (keys.length === 0) return;
    for (const key of keys) {
      flush(key);
    }
  }
  /**
   * Discard cached positions and pending timers for the given sessions without flushing them.
   * @param {Array} keys - Session identifiers to drop.
   */
  function drop(keys) {
    if (keys.length === 0) return;
    for (const key of keys) {
      const timer = timers.get(key);
      if (timer) clearTimeout(timer);
      timers.delete(key);
      dirty.delete(key);
    }
    setCache(produce(draft => {
      for (const key of keys) {
        delete draft[key];
      }
    }));
  }
  /** Tear down all pending timers and their cached state (drops without flushing). */
  function dispose() {
    drop(Array.from(timers.keys()));
  }
  return {
    cache,
    drop,
    flush,
    flushAll,
    scroll,
    seed,
    setScroll,
    dispose
  };
}