import { createEffect, createRoot } from "../../lib/reactivity.js";
import { createStore, produce } from "../../lib/store.js";
import { Persist, persisted } from "@/utils/persist.js";
import { createScopedCache } from "@/utils/scoped-cache.js";
const WORKSPACE_KEY = "__workspace__";
const MAX_FILE_VIEW_SESSIONS = 20;
const MAX_VIEW_FILES = 500;
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
function equalSelectedLines(a, b) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  const left = normalizeSelectedLines(a);
  const right = normalizeSelectedLines(b);
  return left.start === right.start && left.end === right.end && left.side === right.side && left.endSide === right.endSide;
}
function createViewSession(dir, id) {
  const legacyViewKey = `${dir}/file${id ? "/" + id : ""}.v1`;
  const [view, setView, _, ready] = persisted(Persist.scoped(dir, id, "file-view", [legacyViewKey]), createStore({
    file: {}
  }));
  const meta = {
    pruned: false
  };
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
  const scrollTop = path => view.file[path]?.scrollTop;
  const scrollLeft = path => view.file[path]?.scrollLeft;
  const selectedLines = path => view.file[path]?.selectedLines;
  const setScrollTop = (path, top) => {
    setView(produce(draft => {
      const file = draft.file[path] ?? (draft.file[path] = {});
      if (file.scrollTop === top) return;
      file.scrollTop = top;
    }));
    pruneView(path);
  };
  const setScrollLeft = (path, left) => {
    setView(produce(draft => {
      const file = draft.file[path] ?? (draft.file[path] = {});
      if (file.scrollLeft === left) return;
      file.scrollLeft = left;
    }));
    pruneView(path);
  };
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