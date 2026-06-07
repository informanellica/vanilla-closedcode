import { context } from "./instance-context.js";
export const Instance = {
  get current() {
    return context.use();
  },
  get directory() {
    return context.use().directory;
  },
  get worktree() {
    return context.use().worktree;
  },
  get project() {
    return context.use().project;
  },
  /**
   * Captures the current instance ALS context and returns a wrapper that
   * restores it when called. Use this for callbacks that fire outside the
   * instance async context (native addons, event emitters, timers, etc.).
   */
  bind(fn) {
    const ctx = context.use();
    return (...args) => context.provide(ctx, () => fn(...args));
  },
  /**
   * Run a synchronous function within the given instance context ALS.
   * Use this to bridge from Effect (where InstanceRef carries context)
   * back to sync code that reads Instance.directory from ALS.
   */
  restore(ctx, fn) {
    return context.provide(ctx, fn);
  }
};