export class AsyncQueue {
  queue = [];
  resolvers = [];
  push(item) {
    const resolve = this.resolvers.shift();
    if (resolve) resolve(item);else this.queue.push(item);
  }
  async next() {
    if (this.queue.length > 0) return this.queue.shift();
    return new Promise(resolve => this.resolvers.push(resolve));
  }
  async *[Symbol.asyncIterator]() {
    while (true) yield await this.next();
  }
}
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