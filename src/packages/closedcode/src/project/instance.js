/** @file Synchronous accessor facade over the instance ALS context (current directory/worktree/project) plus helpers to bind/restore that context. */
import { context } from "./instance-context.js";

/**
 * Accessors over the current instance's AsyncLocalStorage context, with helpers
 * to capture and restore that context for code running outside the async flow.
 */
export const Instance = {
  /** @returns {Object} The current instance context (directory, worktree, project). */
  get current() {
    return context.use();
  },
  /** @returns {string} The current instance's working directory. */
  get directory() {
    return context.use().directory;
  },
  /** @returns {string} The current instance's worktree path. */
  get worktree() {
    return context.use().worktree;
  },
  /** @returns {Object} The current instance's project. */
  get project() {
    return context.use().project;
  },
  /**
   * Captures the current instance ALS context and returns a wrapper that
   * restores it when called. Use this for callbacks that fire outside the
   * instance async context (native addons, event emitters, timers, etc.).
   *
   * @param {Function} fn - The function to wrap.
   * @returns {Function} A wrapper that invokes fn within the captured context.
   */
  bind(fn) {
    const ctx = context.use();
    return (...args) => context.provide(ctx, () => fn(...args));
  },
  /**
   * Run a synchronous function within the given instance context ALS.
   * Use this to bridge from Effect (where InstanceRef carries context)
   * back to sync code that reads Instance.directory from ALS.
   *
   * @param {Object} ctx - The instance context to install.
   * @param {Function} fn - The function to run within that context.
   * @returns {*} The return value of fn.
   */
  restore(ctx, fn) {
    return context.provide(ctx, fn);
  }
};