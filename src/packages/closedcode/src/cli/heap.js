/** @file Background watchdog that writes a V8 heap snapshot when process RSS exceeds a limit. */
import path from "path";
import { writeHeapSnapshot } from "node:v8";
import { Flag } from "core/flag/flag";
import { Global } from "core/global";
import * as Log from "core/util/log";
const log = Log.create({
  service: "heap"
});
const MINUTE = 60_000;
const LIMIT = 2 * 1024 * 1024 * 1024;
let timer;
let lock = false;
let armed = true;
/**
 * Start the heap-snapshot watchdog timer (a no-op unless the CLOSEDCODE_AUTO_HEAP_SNAPSHOT
 * flag is set). Once started, it polls RSS every minute and, when usage crosses the limit,
 * writes a single .heapsnapshot to the log directory; it re-arms only after RSS drops back
 * below the limit so it does not write repeatedly. Calling more than once is a no-op while
 * a timer is already running.
 * @returns {void}
 */
export function start() {
  if (!Flag.CLOSEDCODE_AUTO_HEAP_SNAPSHOT) return;
  if (timer) return;
  const run = async () => {
    if (lock) return;
    const stat = process.memoryUsage();
    if (stat.rss <= LIMIT) {
      armed = true;
      return;
    }
    if (!armed) return;
    lock = true;
    armed = false;
    const file = path.join(Global.Path.log, `heap-${process.pid}-${new Date().toISOString().replace(/[:.]/g, "")}.heapsnapshot`);
    log.warn("heap usage exceeded limit", {
      rss: stat.rss,
      heap: stat.heapUsed,
      file
    });
    await Promise.resolve().then(() => writeHeapSnapshot(file)).catch(err => {
      log.error("failed to write heap snapshot", {
        error: err instanceof Error ? err.message : String(err),
        file
      });
    });
    lock = false;
  };
  timer = setInterval(() => {
    void run();
  }, MINUTE);
  timer.unref?.();
}
export * as Heap from "./heap.js";