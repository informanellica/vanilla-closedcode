import { spawnSync } from "node:child_process";

// Duplicated from `packages/closedcode/src/util/process.js` because the SDK cannot
// import `closedcode` without creating a cycle (`closedcode` depends on `sdk`).
export function stop(proc) {
  if (proc.exitCode !== null || proc.signalCode !== null) return;
  if (process.platform === "win32" && proc.pid) {
    const out = spawnSync("taskkill", ["/pid", String(proc.pid), "/T", "/F"], {
      windowsHide: true
    });
    if (!out.error && out.status === 0) return;
  }
  proc.kill();
}
export function bindAbort(proc, signal, onAbort) {
  if (!signal) return () => {};
  const abort = () => {
    clear();
    stop(proc);
    onAbort?.();
  };
  const clear = () => {
    signal.removeEventListener("abort", abort);
    proc.off("exit", clear);
    proc.off("error", clear);
  };
  signal.addEventListener("abort", abort, {
    once: true
  });
  proc.on("exit", clear);
  proc.on("error", clear);
  if (signal.aborted) abort();
  return clear;
}