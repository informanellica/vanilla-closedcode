import { WorkerPoolManager } from "@pierre/diffs/worker";
import ShikiWorkerUrl from "@pierre/diffs/worker/worker.js?worker&url";
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