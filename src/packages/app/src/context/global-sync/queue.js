/** @file Coalescing, batched refresh queue that bootstraps directory instances (and the root) on a microtask-paced drain loop. */
/**
 * Create a refresh queue that deduplicates queued directories and drains them in small batches.
 * Honours a paused() gate, prioritises a pending root bootstrap, and processes up to two directories per pass.
 * @param {Object} input - Queue collaborators: {paused: Function, bootstrap: Function, bootstrapInstance: Function, key: Function}. `key` is optional and defaults to identity.
 * @returns {Object} Queue API: {push: Function, refresh: Function, clear: Function, dispose: Function}.
 */
export function createRefreshQueue(input) {
  const queued = new Map();
  let root = false;
  let running = false;
  let timer;
  const key = input.key ?? (directory => directory);
  // Yield to the event loop so a long drain never blocks the renderer.
  const tick = () => new Promise(resolve => setTimeout(resolve, 0));
  /**
   * Remove and return up to `count` queued directories, draining the dedupe map in insertion order.
   * @param {number} count - Maximum number of directories to take this pass.
   * @returns {Array} The directories removed from the queue.
   */
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
  // Schedule a drain on the next macrotask, coalescing multiple requests into one timer.
  const schedule = () => {
    if (timer) return;
    timer = setTimeout(() => {
      timer = undefined;
      void drain();
    }, 0);
  };
  /**
   * Enqueue a directory for refresh (deduplicated by key) and schedule a drain unless paused.
   * @param {*} directory - Directory descriptor to bootstrap; falsy values are ignored.
   */
  const push = directory => {
    if (!directory) return;
    queued.set(key(directory), directory);
    if (input.paused()) return;
    schedule();
  };
  // Mark the root bootstrap as pending and schedule a drain unless paused.
  const refresh = () => {
    root = true;
    if (input.paused()) return;
    schedule();
  };
  /**
   * Drain loop: bootstrap the root when pending, otherwise process queued directories in batches of two
   * with an event-loop yield between passes. Reschedules itself if work remains after finishing.
   * @returns {Promise<void>} Resolves when the current drain pass exits.
   */
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
    /**
     * Resume the queue after a pause clears: schedule a drain if work remains.
     * push()/refresh() skip scheduling while paused, so without this a refresh
     * that arrived during a pause (e.g. a config update) would sit in the queue
     * until an unrelated later push happened to reschedule it.
     */
    resume() {
      if (input.paused()) return;
      if (root || queued.size) schedule();
    },
    /**
     * Remove a directory from the pending queue without bootstrapping it.
     * @param {*} directory - Directory descriptor whose queued entry should be dropped.
     */
    clear(directory) {
      queued.delete(key(directory));
    },
    /** Cancel any scheduled drain timer, releasing the queue's pending work. */
    dispose() {
      if (!timer) return;
      clearTimeout(timer);
      timer = undefined;
    }
  };
}