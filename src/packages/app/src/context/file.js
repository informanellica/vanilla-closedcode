/** @file File context: loads, caches, and watches file contents and the file tree for the active directory, with LRU content eviction and per-file editor view state. */
import { batch, createEffect, createMemo, onCleanup } from "../lib/reactivity.js";
import { createStore, produce, reconcile } from "../lib/store.js";
import { createSimpleContext } from "@/lib/context.js";
import { showToast } from "@/lib/toast.js";
import { useParams } from "../lib/router/index.js";
import { getFilename } from "core/util/path";
import { useSDK } from "./sdk.js";
import { useSync } from "./sync.js";
import { useLanguage } from "@/context/language.js";
import { useLayout } from "@/context/layout.js";
import { createPathHelpers } from "./file/path.js";
import { approxBytes, evictContentLru, getFileContentBytesTotal, getFileContentEntryCount, hasFileContent, removeFileContentBytes, resetFileContentLru, setFileContentBytes, touchFileContent } from "./file/content-cache.js";
import { createFileViewCache } from "./file/view-cache.js";
import { createFileTreeStore } from "./file/tree-store.js";
import { invalidateFromWatcher } from "./file/watcher.js";
import { selectionFromLines } from "./file/types.js";
export { selectionFromLines };
export { evictContentLru, getFileContentBytesTotal, getFileContentEntryCount, removeFileContentBytes, resetFileContentLru, setFileContentBytes, touchFileContent };
/**
 * Extract a human-readable message from a thrown error, falling back when none is available.
 * @param {*} error - The caught error (Error, string, or other).
 * @param {string} fallback - The message to return when no message can be extracted.
 * @returns {string} The error message or the fallback.
 */
function errorMessage(error, fallback) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return fallback;
}
/**
 * File context. Provides `useFile` (consumer) and `FileProvider`. The context exposes file content
 * loading/caching with LRU eviction, a watcher-driven invalidation pipeline, a lazily-loaded file
 * tree, path normalization helpers, per-file editor view state (scroll/selection), and file/directory
 * search. Re-exports content-cache utilities and selectionFromLines.
 */
export const {
  use: useFile,
  provider: FileProvider
} = createSimpleContext({
  name: "File",
  gate: false,
  init: () => {
    const sdk = useSDK();
    useSync();
    const params = useParams();
    const language = useLanguage();
    const layout = useLayout();
    const scope = createMemo(() => sdk.directory);
    const path = createPathHelpers(scope);
    const tabs = layout.tabs(() => `${params.dir}${params.id ? "/" + params.id : ""}`);
    const inflight = new Map();
    const [store, setStore] = createStore({
      file: {}
    });
    const tree = createFileTreeStore({
      scope,
      normalizeDir: path.normalizeDir,
      list: dir => sdk.client.file.list({
        path: dir
      }).then(x => x.data ?? []),
      onError: message => {
        showToast({
          variant: "error",
          title: language.t("toast.file.listFailed.title"),
          description: message
        });
      }
    });
    /**
     * Evict least-recently-used file contents from the store, keeping the given files resident.
     * @param {Set} keep - Set of file paths that must not be evicted.
     * @returns {void}
     */
    const evictContent = keep => {
      evictContentLru(keep, target => {
        if (!store.file[target]) return;
        setStore("file", target, produce(draft => {
          draft.content = undefined;
          draft.loaded = false;
        }));
      });
    };
    createEffect(() => {
      scope();
      inflight.clear();
      resetFileContentLru();
      batch(() => {
        setStore("file", reconcile({}));
        tree.reset();
      });
    });
    const viewCache = createFileViewCache();
    const view = createMemo(() => viewCache.load(scope(), params.id));
    /**
     * Ensure a file entry exists in the store, seeding its path and name.
     * @param {string} file - The normalized file path.
     * @returns {void}
     */
    const ensure = file => {
      if (!file) return;
      if (store.file[file]) return;
      setStore("file", file, {
        path: file,
        name: getFilename(file)
      });
    };
    /**
     * Mark a file as loading and clear any prior error.
     * @param {string} file - The normalized file path.
     * @returns {void}
     */
    const setLoading = file => {
      setStore("file", file, produce(draft => {
        draft.loading = true;
        draft.error = undefined;
      }));
    };
    /**
     * Mark a file as loaded and store its content.
     * @param {string} file - The normalized file path.
     * @param {*} content - The loaded file content.
     * @returns {void}
     */
    const setLoaded = (file, content) => {
      setStore("file", file, produce(draft => {
        draft.loaded = true;
        draft.loading = false;
        draft.content = content;
      }));
    };
    /**
     * Mark a file load as failed, store the error message, and show an error toast.
     * @param {string} file - The normalized file path.
     * @param {string} message - The error message to record and display.
     * @returns {void}
     */
    const setLoadError = (file, message) => {
      setStore("file", file, produce(draft => {
        draft.loading = false;
        draft.error = message;
      }));
      showToast({
        variant: "error",
        title: language.t("toast.file.loadFailed.title"),
        description: message
      });
    };
    /**
     * Load a file's content via the SDK (deduplicating in-flight requests and skipping already-loaded files
     * unless forced), updating the store and content LRU; ignores responses from a stale directory scope.
     * @param {string} input - The file path (will be normalized).
     * @param {Object} options - Optional {force} to reload even when already loaded.
     * @returns {Promise} Resolves when the load completes (or immediately when skipped).
     */
    const load = (input, options) => {
      const file = path.normalize(input);
      if (!file) return Promise.resolve();
      const directory = scope();
      const key = `${directory}\n${file}`;
      ensure(file);
      const current = store.file[file];
      if (!options?.force && current?.loaded) return Promise.resolve();
      const pending = inflight.get(key);
      if (pending) return pending;
      setLoading(file);
      const promise = sdk.client.file.read({
        path: file
      }).then(x => {
        if (scope() !== directory) return;
        const content = x.data;
        setLoaded(file, content);
        if (!content) return;
        touchFileContent(file, approxBytes(content));
        evictContent(new Set([file]));
      }).catch(e => {
        if (scope() !== directory) return;
        setLoadError(file, errorMessage(e, language.t("error.chain.unknown")));
      }).finally(() => {
        inflight.delete(key);
      });
      inflight.set(key, promise);
      return promise;
    };
    /**
     * Search for files matching a query via the SDK, returning normalized paths (empty on error).
     * @param {string} query - The search query.
     * @param {string} dirs - Whether to include directories ("true"/"false").
     * @returns {Promise<Array>} The matching normalized file paths.
     */
    const search = (query, dirs) => sdk.client.find.files({
      query,
      dirs
    }).then(x => (x.data ?? []).map(path.normalize), () => []);
    const stop = sdk.event.listen(e => {
      invalidateFromWatcher(e.details, {
        normalize: path.normalize,
        hasFile: file => Boolean(store.file[file]),
        isOpen: file => tabs.all().some(tab => path.pathFromTab(tab) === file),
        loadFile: file => {
          void load(file, {
            force: true
          });
        },
        node: tree.node,
        isDirLoaded: tree.isLoaded,
        refreshDir: dir => {
          void tree.listDir(dir, {
            force: true
          });
        }
      });
    });
    /**
     * Get a file's current store state, touching its LRU entry when it has cached content.
     * @param {string} input - The file path (will be normalized).
     * @returns {Object} The file state record, or undefined when unknown.
     */
    const get = input => {
      const file = path.normalize(input);
      const state = store.file[file];
      const content = state?.content;
      if (!content) return state;
      if (hasFileContent(file)) {
        touchFileContent(file);
        return state;
      }
      touchFileContent(file, approxBytes(content));
      return state;
    };
    /**
     * Normalize a file path and pass it to an action callback.
     * @param {string} input - The file path to normalize.
     * @param {Function} action - Callback invoked with the normalized path.
     * @returns {*} The action's return value.
     */
    function withPath(input, action) {
      return action(path.normalize(input));
    }
    const scrollTop = input => withPath(input, file => view().scrollTop(file));
    const scrollLeft = input => withPath(input, file => view().scrollLeft(file));
    const selectedLines = input => withPath(input, file => view().selectedLines(file));
    const setScrollTop = (input, top) => withPath(input, file => view().setScrollTop(file, top));
    const setScrollLeft = (input, left) => withPath(input, file => view().setScrollLeft(file, left));
    const setSelectedLines = (input, range) => withPath(input, file => view().setSelectedLines(file, range));
    onCleanup(() => {
      stop();
      viewCache.clear();
    });
    return {
      ready: () => view().ready(),
      normalize: path.normalize,
      tab: path.tab,
      pathFromTab: path.pathFromTab,
      tree: {
        list: tree.listDir,
        refresh: input => tree.listDir(input, {
          force: true
        }),
        state: tree.dirState,
        children: tree.children,
        expand: tree.expandDir,
        collapse: tree.collapseDir,
        toggle(input) {
          if (tree.dirState(input)?.expanded) {
            tree.collapseDir(input);
            return;
          }
          tree.expandDir(input);
        }
      },
      get,
      load,
      scrollTop,
      scrollLeft,
      setScrollTop,
      setScrollLeft,
      selectedLines,
      setSelectedLines,
      searchFiles: query => search(query, "false"),
      searchFilesAndDirectories: query => search(query, "true")
    };
  }
});