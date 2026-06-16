/**
 * @file Child-process lifecycle helpers for the SDK: terminate a spawned process
 * (with a Windows process-tree fallback) and wire an AbortSignal to a process.
 * @module sdk/process
 */

import { spawnSync } from "node:child_process";

// Duplicated from `packages/closedcode/src/util/process.js` because the SDK cannot
// import `closedcode` without creating a cycle (`closedcode` depends on `sdk`).

/**
 * Terminate a child process if it is still running. On Windows the whole process
 * tree is killed via `taskkill /T /F`, falling back to `proc.kill()` elsewhere or
 * when taskkill fails.
 * @param {ChildProcess} proc - The process to stop.
 * @returns {void}
 */
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
/**
 * Bind an AbortSignal to a child process so that aborting stops the process, and
 * so that the listeners are cleaned up automatically once the process exits or errors.
 * @param {ChildProcess} proc - The process to bind.
 * @param {AbortSignal} [signal] - Signal whose abort should terminate the process; when omitted a no-op cleanup is returned.
 * @param {Function} [onAbort] - Optional callback invoked after the process is stopped due to abort.
 * @returns {Function} A cleanup function that detaches all listeners.
 */
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