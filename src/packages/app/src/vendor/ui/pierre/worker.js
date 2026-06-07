import { WorkerPoolManager } from "@pierre/diffs/worker";
// Build-less: the module worker is served directly from node_modules via the
// oc:// protocol, which rewrites the worker's own bare imports (shiki/core etc.)
// to oc:// /node_modules URLs that the worker fetches over the same protocol.
const ShikiWorkerUrl = "/node_modules/@pierre/diffs/dist/worker/worker.js";
export function workerFactory() {
  return new Worker(ShikiWorkerUrl, {
    type: "module"
  });
}
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
export function getWorkerPool(style) {
  if (typeof window === "undefined") return;
  if (style === "split") {
    if (!split) split = createPool("word-alt");
    return split;
  }
  if (!unified) unified = createPool("none");
  return unified;
}
export function getWorkerPools() {
  return {
    unified: getWorkerPool("unified"),
    split: getWorkerPool("split")
  };
}