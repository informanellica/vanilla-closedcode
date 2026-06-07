const normalize = directory => directory.replace(/[\\/]+$/, "");
const state = new Map();
const waiters = new Map();
function deferred() {
  const box = {
    resolve: _ => {}
  };
  const promise = new Promise(resolve => {
    box.resolve = resolve;
  });
  return {
    promise,
    resolve: box.resolve
  };
}
export const Worktree = {
  get(directory) {
    return state.get(normalize(directory));
  },
  pending(directory) {
    const key = normalize(directory);
    const current = state.get(key);
    if (current && current.status !== "pending") return;
    state.set(key, {
      status: "pending"
    });
  },
  ready(directory) {
    const key = normalize(directory);
    const next = {
      status: "ready"
    };
    state.set(key, next);
    const waiter = waiters.get(key);
    if (!waiter) return;
    waiters.delete(key);
    waiter.resolve(next);
  },
  failed(directory, message) {
    const key = normalize(directory);
    const next = {
      status: "failed",
      message
    };
    state.set(key, next);
    const waiter = waiters.get(key);
    if (!waiter) return;
    waiters.delete(key);
    waiter.resolve(next);
  },
  wait(directory) {
    const key = normalize(directory);
    const current = state.get(key);
    if (current && current.status !== "pending") return Promise.resolve(current);
    const existing = waiters.get(key);
    if (existing) return existing.promise;
    const waiter = deferred();
    waiters.set(key, waiter);
    return waiter.promise;
  }
};