export function createRefreshQueue(input) {
  const queued = new Map();
  let root = false;
  let running = false;
  let timer;
  const key = input.key ?? (directory => directory);
  const tick = () => new Promise(resolve => setTimeout(resolve, 0));
  const take = count => {
    if (queued.size === 0) return [];
    const items = [];
    for (const [id, directory] of queued) {
      queued.delete(id);
      items.push(directory);
      if (items.length >= count) break;
    }
    return items;
  };
  const schedule = () => {
    if (timer) return;
    timer = setTimeout(() => {
      timer = undefined;
      void drain();
    }, 0);
  };
  const push = directory => {
    if (!directory) return;
    queued.set(key(directory), directory);
    if (input.paused()) return;
    schedule();
  };
  const refresh = () => {
    root = true;
    if (input.paused()) return;
    schedule();
  };
  async function drain() {
    if (running) return;
    running = true;
    try {
      while (true) {
        if (input.paused()) return;
        if (root) {
          root = false;
          await input.bootstrap();
          await tick();
          continue;
        }
        const dirs = take(2);
        if (dirs.length === 0) return;
        await Promise.all(dirs.map(dir => input.bootstrapInstance(dir)));
        await tick();
      }
    } finally {
      running = false;
      // oxlint-disable-next-line no-unsafe-finally -- intentional: early return skips schedule() when paused
      if (input.paused()) return;
      if (root || queued.size) schedule();
    }
  }
  return {
    push,
    refresh,
    clear(directory) {
      queued.delete(key(directory));
    },
    dispose() {
      if (!timer) return;
      clearTimeout(timer);
      timer = undefined;
    }
  };
}