/** @file Reactive file-tree store: lazily lists/expands/collapses directories and tracks node and directory state. */
import { createStore, produce, reconcile } from "../../lib/store.js";
/**
 * Create a reactive file-tree store backed by a Solid store.
 * @param {Object} options - Dependencies: `normalizeDir`, `scope` (current root getter), `list` (async dir lister returning nodes), and `onError` callback.
 * @returns {Object} Tree API `{listDir, expandDir, collapseDir, dirState, children, node, isLoaded, reset}`.
 */
export function createFileTreeStore(options) {
  const [tree, setTree] = createStore({
    node: {},
    dir: {
      "": {
        expanded: true
      }
    }
  });
  const inflight = new Map();
  /**
   * Reset the tree to its initial state: clear nodes, directories and in-flight loads, and re-expand the root.
   * @returns {void}
   */
  const reset = () => {
    inflight.clear();
    setTree("node", reconcile({}));
    setTree("dir", reconcile({}));
    setTree("dir", "", {
      expanded: true
    });
  };
  /**
   * Ensure a directory entry exists in the tree state, creating a collapsed placeholder if missing.
   * @param {string} path - Normalized directory path.
   * @returns {void}
   */
  const ensureDir = path => {
    if (tree.dir[path]) return;
    setTree("dir", path, {
      expanded: false
    });
  };
  /**
   * Load (list) a directory's children via `options.list`, reconciling node/dir state and deduplicating concurrent loads.
   * Skips the load if already loaded unless `opts.force` is set; ignores results from a stale scope.
   * @param {string} input - Directory path or file URL.
   * @param {Object} opts - Options; `force` re-lists even when already loaded.
   * @returns {Promise} Resolves when the listing completes (or immediately if cached).
   */
  const listDir = (input, opts) => {
    const dir = options.normalizeDir(input);
    ensureDir(dir);
    const current = tree.dir[dir];
    if (!opts?.force && current?.loaded) return Promise.resolve();
    const pending = inflight.get(dir);
    if (pending) return pending;
    setTree("dir", dir, produce(draft => {
      draft.loading = true;
      draft.error = undefined;
    }));
    const directory = options.scope();
    const promise = options.list(dir).then(nodes => {
      if (options.scope() !== directory) return;
      const prevChildren = tree.dir[dir]?.children ?? [];
      const nextChildren = nodes.map(node => node.path);
      const nextSet = new Set(nextChildren);
      setTree("node", produce(draft => {
        const removedDirs = [];
        for (const child of prevChildren) {
          if (nextSet.has(child)) continue;
          const existing = draft[child];
          if (existing?.type === "directory") removedDirs.push(child);
          delete draft[child];
        }
        if (removedDirs.length > 0) {
          const keys = Object.keys(draft);
          for (const key of keys) {
            for (const removed of removedDirs) {
              if (!key.startsWith(removed + "/")) continue;
              delete draft[key];
              break;
            }
          }
        }
        for (const node of nodes) {
          draft[node.path] = node;
        }
      }));
      setTree("dir", dir, produce(draft => {
        draft.loaded = true;
        draft.loading = false;
        draft.children = nextChildren;
      }));
    }).catch(e => {
      if (options.scope() !== directory) return;
      setTree("dir", dir, produce(draft => {
        draft.loading = false;
        draft.error = e.message;
      }));
      options.onError(e.message);
    }).finally(() => {
      inflight.delete(dir);
    });
    inflight.set(dir, promise);
    return promise;
  };
  /**
   * Mark a directory expanded and trigger a lazy listing of its children.
   * @param {string} input - Directory path or file URL.
   * @returns {void}
   */
  const expandDir = input => {
    const dir = options.normalizeDir(input);
    ensureDir(dir);
    setTree("dir", dir, "expanded", true);
    void listDir(dir);
  };
  /**
   * Mark a directory collapsed.
   * @param {string} input - Directory path or file URL.
   * @returns {void}
   */
  const collapseDir = input => {
    const dir = options.normalizeDir(input);
    ensureDir(dir);
    setTree("dir", dir, "expanded", false);
  };
  /**
   * Get the reactive state record for a directory (expanded/loaded/loading/error/children).
   * @param {string} input - Directory path or file URL.
   * @returns {Object} The directory state, or undefined if unknown.
   */
  const dirState = input => {
    const dir = options.normalizeDir(input);
    return tree.dir[dir];
  };
  /**
   * Get the resolved child node records of a directory in listing order.
   * @param {string} input - Directory path or file URL.
   * @returns {Array} Array of node objects (empty if the directory is unloaded).
   */
  const children = input => {
    const dir = options.normalizeDir(input);
    const ids = tree.dir[dir]?.children;
    if (!ids) return [];
    const out = [];
    for (const id of ids) {
      const node = tree.node[id];
      if (node) out.push(node);
    }
    return out;
  };
  return {
    listDir,
    expandDir,
    collapseDir,
    dirState,
    children,
    node: path => tree.node[path],
    isLoaded: path => Boolean(tree.dir[path]?.loaded),
    reset
  };
}