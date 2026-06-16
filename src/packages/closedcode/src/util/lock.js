/** @file In-process per-key reader/writer lock with writer-priority scheduling. */

const locks = new Map();
/**
 * Get the lock state for a key, creating an empty one if it does not yet exist.
 * @param {string} key - The lock key.
 * @returns {{readers: number, writer: boolean, waitingReaders: Array, waitingWriters: Array}} The mutable lock state.
 */
function get(key) {
  if (!locks.has(key)) {
    locks.set(key, {
      readers: 0,
      writer: false,
      waitingReaders: [],
      waitingWriters: []
    });
  }
  return locks.get(key);
}
/**
 * Advance the lock's wait queue: grant the lock to the next waiter (writers prioritized
 * to prevent starvation) or delete the lock entry once it is fully idle.
 * @param {string} key - The lock key to process.
 * @returns {void}
 */
function process(key) {
  const lock = locks.get(key);
  if (!lock || lock.writer || lock.readers > 0) return;

  // Prioritize writers to prevent starvation
  if (lock.waitingWriters.length > 0) {
    const nextWriter = lock.waitingWriters.shift();
    nextWriter();
    return;
  }

  // Wake up all waiting readers
  while (lock.waitingReaders.length > 0) {
    const nextReader = lock.waitingReaders.shift();
    nextReader();
  }

  // Clean up empty locks
  if (lock.readers === 0 && !lock.writer && lock.waitingReaders.length === 0 && lock.waitingWriters.length === 0) {
    locks.delete(key);
  }
}
/**
 * Acquire a shared (read) lock for a key, waiting if a writer holds or is waiting for it.
 * The returned handle releases the lock when disposed (via `using`/`Symbol.dispose`).
 * @param {string} key - The lock key.
 * @returns {Promise<Object>} A disposable handle whose disposal releases the read lock.
 */
export async function read(key) {
  const lock = get(key);
  return new Promise(resolve => {
    if (!lock.writer && lock.waitingWriters.length === 0) {
      lock.readers++;
      resolve({
        [Symbol.dispose]: () => {
          lock.readers--;
          process(key);
        }
      });
    } else {
      lock.waitingReaders.push(() => {
        lock.readers++;
        resolve({
          [Symbol.dispose]: () => {
            lock.readers--;
            process(key);
          }
        });
      });
    }
  });
}
/**
 * Acquire an exclusive (write) lock for a key, waiting until no readers or writer hold it.
 * The returned handle releases the lock when disposed (via `using`/`Symbol.dispose`).
 * @param {string} key - The lock key.
 * @returns {Promise<Object>} A disposable handle whose disposal releases the write lock.
 */
export async function write(key) {
  const lock = get(key);
  return new Promise(resolve => {
    if (!lock.writer && lock.readers === 0) {
      lock.writer = true;
      resolve({
        [Symbol.dispose]: () => {
          lock.writer = false;
          process(key);
        }
      });
    } else {
      lock.waitingWriters.push(() => {
        lock.writer = true;
        resolve({
          [Symbol.dispose]: () => {
            lock.writer = false;
            process(key);
          }
        });
      });
    }
  });
}
export * as Lock from "./lock.js";