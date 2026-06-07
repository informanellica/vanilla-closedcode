import { createStore, produce } from "solid-js/store";
export function createScrollPersistence(opts) {
  const wait = opts.debounceMs ?? 200;
  const [cache, setCache] = createStore({});
  const dirty = new Set();
  const timers = new Map();
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
  function scroll(sessionKey, tab) {
    seed(sessionKey);
    return cache[sessionKey]?.[tab] ?? opts.getSnapshot(sessionKey)?.[tab];
  }
  function schedule(sessionKey) {
    const prev = timers.get(sessionKey);
    if (prev) clearTimeout(prev);
    timers.set(sessionKey, setTimeout(() => flush(sessionKey), wait));
  }
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
  function flush(sessionKey) {
    const timer = timers.get(sessionKey);
    if (timer) clearTimeout(timer);
    timers.delete(sessionKey);
    if (!dirty.has(sessionKey)) return;
    dirty.delete(sessionKey);
    opts.onFlush(sessionKey, clone(cache[sessionKey]));
  }
  function flushAll() {
    const keys = Array.from(dirty);
    if (keys.length === 0) return;
    for (const key of keys) {
      flush(key);
    }
  }
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