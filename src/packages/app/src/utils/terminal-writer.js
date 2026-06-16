/** @file Batched terminal writer: coalesces incoming data into scheduled writes and exposes a flush with completion callbacks. */
/**
 * Create a batched writer that buffers data chunks and flushes them through `write`
 * on a scheduled tick, serializing writes so only one is in flight at a time.
 * @param {Function} write - Sink called as write(joinedChunks, doneCallback); must invoke doneCallback when the write completes.
 * @param {Function} schedule - Scheduler used to defer the flush (defaults to queueMicrotask); called as schedule(run).
 * @returns {Object} An object with `push(data)` to enqueue a chunk and `flush(done)` to force a write and run `done` once drained.
 */
export function terminalWriter(write, schedule = queueMicrotask) {
  let chunks;
  let waits;
  let scheduled = false;
  let writing = false;
  const settle = () => {
    if (scheduled || writing || chunks?.length) return;
    const list = waits;
    if (!list?.length) return;
    waits = undefined;
    for (const fn of list) {
      fn();
    }
  };
  const run = () => {
    if (writing) return;
    scheduled = false;
    const items = chunks;
    if (!items?.length) {
      settle();
      return;
    }
    chunks = undefined;
    writing = true;
    write(items.join(""), () => {
      writing = false;
      if (chunks?.length) {
        if (scheduled) return;
        scheduled = true;
        schedule(run);
        return;
      }
      settle();
    });
  };
  const push = data => {
    if (!data) return;
    if (chunks) chunks.push(data);else chunks = [data];
    if (scheduled || writing) return;
    scheduled = true;
    schedule(run);
  };
  const flush = done => {
    if (!scheduled && !writing && !chunks?.length) {
      done?.();
      return;
    }
    if (done) {
      if (waits) waits.push(done);else waits = [done];
    }
    run();
  };
  return {
    push,
    flush
  };
}