/** @file Per-session file-view cache: persists scroll position and line selection per file, with LRU session and per-file pruning. */
import { createEffect, createRoot } from "../../lib/reactivity.js";
import { createStore, produce } from "../../lib/store.js";
import { Persist, persisted } from "@/utils/persist.js";
import { createScopedCache } from "@/utils/scoped-cache.js";
const WORKSPACE_KEY = "__workspace__";
const MAX_FILE_VIEW_SESSIONS = 20;
const MAX_VIEW_FILES = 500;
/**
 * Normalize a selected-line range so `start <= end`, swapping the side markers when the range is reversed.
 * @param {Object} range - Selection range `{start, end, side, endSide}`.
 * @returns {Object} A new range with ascending start/end and adjusted side/endSide.
 */
function normalizeSelectedLines(range) {
  if (range.start <= range.end) return {
    ...range
  };
  const startSide = range.side;
  const endSide = range.endSide ?? startSide;
  return {
    ...range,
    start: range.end,
    end: range.start,
    side: endSide,
    endSide: startSide !== endSide ? startSide : undefined
  };
}
/**
 * Compare two selected-line ranges for equality after normalization.
 * @param {Object} a - First range (may be null/undefined).
 * @param {Object} b - Second range (may be null/undefined).
 * @returns {boolean} True if both are absent or normalize to the same start/end/side/endSide.
 */
function equalSelectedLines(a, b) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  const left = normalizeSelectedLines(a);
  const right = normalizeSelectedLines(b);
  return left.start === right.start && left.end === right.end && left.side === right.side && left.endSide === right.endSide;
}
/**
 * Create a single persisted file-view session storing per-file scroll/selection state.
 * @param {string} dir - Workspace directory the session belongs to.
 * @param {string} id - Optional session id; omitted for the workspace-level session.
 * @returns {Object} Session API `{ready, scrollTop, scrollLeft, selectedLines, setScrollTop, setScrollLeft, setSelectedLines}`.
 */
function createViewSession(dir, id) {
  const legacyViewKey = `${dir}/file${id ? "/" + id : ""}.v1`;
  const [view, setView, _, ready] = persisted(Persist.scoped(dir, id, "file-view", [legacyViewKey]), createStore({
    file: {}
  }));
  const meta = {
    pruned: false
  };
  /**
   * Drop the oldest per-file entries when the session exceeds the max file budget, preserving `keep`.
   * @param {string} keep - Path to retain regardless of pruning order.
   * @returns {void}
   */
  const pruneView = keep => {
    const keys = Object.keys(view.file);
    if (keys.length <= MAX_VIEW_FILES) return;
    const drop = keys.filter(key => key !== keep).slice(0, keys.length - MAX_VIEW_FILES);
    if (drop.length === 0) return;
    setView(produce(draft => {
      for (const key of drop) {
        delete draft.file[key];
      }
    }));
  };
  createEffect(() => {
    if (!ready()) return;
    if (meta.pruned) return;
    meta.pruned = true;
    pruneView();
  });
  /**
   * Get the persisted vertical scroll offset for a file.
   * @param {string} path - File path.
   * @returns {number} Stored scrollTop, or undefined.
   */
  const scrollTop = path => view.file[path]?.scrollTop;
  /**
   * Get the persisted horizontal scroll offset for a file.
   * @param {string} path - File path.
   * @returns {number} Stored scrollLeft, or undefined.
   */
  const scrollLeft = path => view.file[path]?.scrollLeft;
  /**
   * Get the persisted line selection for a file.
   * @param {string} path - File path.
   * @returns {Object} Stored selectedLines range, or undefined.
   */
  const selectedLines = path => view.file[path]?.selectedLines;
  /**
   * Persist the vertical scroll offset for a file (no-op if unchanged) and prune if needed.
   * @param {string} path - File path.
   * @param {number} top - Vertical scroll offset.
   * @returns {void}
   */
  const setScrollTop = (path, top) => {
    setView(produce(draft => {
      const file = draft.file[path] ?? (draft.file[path] = {});
      if (file.scrollTop === top) return;
      file.scrollTop = top;
    }));
    pruneView(path);
  };
  /**
   * Persist the horizontal scroll offset for a file (no-op if unchanged) and prune if needed.
   * @param {string} path - File path.
   * @param {number} left - Horizontal scroll offset.
   * @returns {void}
   */
  const setScrollLeft = (path, left) => {
    setView(produce(draft => {
      const file = draft.file[path] ?? (draft.file[path] = {});
      if (file.scrollLeft === left) return;
      file.scrollLeft = left;
    }));
    pruneView(path);
  };
  /**
   * Persist a (normalized) line selection for a file, or clear it when range is falsy; no-op if unchanged.
   * @param {string} path - File path.
   * @param {Object} range - Selection range, or null/undefined to clear.
   * @returns {void}
   */
  const setSelectedLines = (path, range) => {
    const next = range ? normalizeSelectedLines(range) : null;
    setView(produce(draft => {
      const file = draft.file[path] ?? (draft.file[path] = {});
      if (equalSelectedLines(file.selectedLines, next)) return;
      file.selectedLines = next;
    }));
    pruneView(path);
  };
  return {
    ready,
    scrollTop,
    scrollLeft,
    selectedLines,
    setScrollTop,
    setScrollLeft,
    setSelectedLines
  };
}
/**
 * Create the file-view cache: an LRU of per-(dir,id) view sessions, each disposing its reactive root on eviction.
 * @returns {Object} Cache API `{load, clear}` where `load(dir, id)` returns the view session for a directory/session.
 */
export function createFileViewCache() {
  const cache = createScopedCache(key => {
    const split = key.lastIndexOf("\n");
    const dir = split >= 0 ? key.slice(0, split) : key;
    const id = split >= 0 ? key.slice(split + 1) : WORKSPACE_KEY;
    return createRoot(dispose => ({
      value: createViewSession(dir, id === WORKSPACE_KEY ? undefined : id),
      dispose
    }));
  }, {
    maxEntries: MAX_FILE_VIEW_SESSIONS,
    dispose: entry => entry.dispose()
  });
  return {
    load: (dir, id) => {
      const key = `${dir}\n${id ?? WORKSPACE_KEY}`;
      return cache.get(key).value;
    },
    clear: () => cache.clear()
  };
}