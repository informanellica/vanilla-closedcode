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