/** @file Manages @pierre/diffs Shiki syntax-highlighting worker pools (unified and split diff styles). */
import { WorkerPoolManager } from "@pierre/diffs/worker";
// Build-less: the module worker is served directly from node_modules via the
// vcc:// protocol, which rewrites the worker's own bare imports (shiki/core etc.)
// to vcc:// /node_modules URLs that the worker fetches over the same protocol.
const ShikiWorkerUrl = "/node_modules/@pierre/diffs/dist/worker/worker.js";
/**
 * Create a new module Worker for the @pierre/diffs Shiki highlighter.
 * @returns {Worker} A module-type Worker loading the Shiki worker script.
 */
export function workerFactory() {
  return new Worker(ShikiWorkerUrl, {
    type: "module"
  });
}
/**
 * Create and initialize a worker pool configured for a given line-diff type.
 * @param {string} lineDiffType - Line diff granularity passed to the pool (e.g. "none" or "word-alt").
 * @returns {Object} The initialized WorkerPoolManager instance.
 */
function createPool(lineDiffType) {
  const pool = new WorkerPoolManager({
    workerFactory,
    // poolSize defaults to 8. More workers = more parallelism but
    // also more memory. Too many can actually slow things down.
    // NOTE: 2 is probably better for ClosedCode, as I think 8 might be
    // a bit overkill, especially because Safari has a significantly slower
    // boot up time for workers
    poolSize: 2
  }, {
    theme: "ClosedCode",
    lineDiffType,
    preferredHighlighter: "shiki-wasm"
  });
  void pool.initialize();
  return pool;
}
let unified;
let split;
/**
 * Get the lazily-created worker pool for a diff display style, memoized per style.
 * Returns undefined outside a browser (no `window`).
 * @param {string} style - Diff style; "split" uses the split pool, anything else uses the unified pool.
 * @returns {Object} The worker pool for the requested style, or undefined when not in a browser.
 */
export function getWorkerPool(style) {
  if (typeof window === "undefined") return;
  if (style === "split") {
    if (!split) split = createPool("word-alt");
    return split;
  }
  if (!unified) unified = createPool("none");
  return unified;
}
/**
 * Get both the unified and split worker pools.
 * @returns {Object} Object with `unified` and `split` worker pool references.
 */
export function getWorkerPools() {
  return {
    unified: getWorkerPool("unified"),
    split: getWorkerPool("split")
  };
}