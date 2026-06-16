/** @file Async producer/consumer queue and a bounded-concurrency work runner. */

/**
 * An unbounded async queue: producers `push` items and consumers `await next()`
 * (or iterate it) to receive them, blocking when empty. Also async-iterable.
 */
export class AsyncQueue {
  queue = [];
  resolvers = [];
  /**
   * Enqueue an item, immediately handing it to a waiting consumer if one exists.
   * @param {*} item - The item to enqueue.
   * @returns {void}
   */
  push(item) {
    const resolve = this.resolvers.shift();
    if (resolve) resolve(item);else this.queue.push(item);
  }
  /**
   * Dequeue the next item, or wait for one if the queue is currently empty.
   * @returns {Promise<*>} The next item.
   */
  async next() {
    if (this.queue.length > 0) return this.queue.shift();
    return new Promise(resolve => this.resolvers.push(resolve));
  }
  /**
   * Async iterator yielding items as they become available (never completes).
   * @returns {AsyncGenerator<*>} An async generator over queued items.
   */
  async *[Symbol.asyncIterator]() {
    while (true) yield await this.next();
  }
}
/**
 * Process items with a bounded number of concurrent workers, resolving once all are done.
 * @param {number} concurrency - The maximum number of items processed in parallel.
 * @param {Array<*>} items - The work items to process.
 * @param {Function} fn - Async handler invoked with each item.
 * @returns {Promise<void>} Resolves when every item has been processed.
 */
export async function work(concurrency, items, fn) {
  const pending = [...items];
  await Promise.all(Array.from({
    length: concurrency
  }, async () => {
    while (true) {
      const item = pending.pop();
      if (item === undefined) return;
      await fn(item);
    }
  }));
}