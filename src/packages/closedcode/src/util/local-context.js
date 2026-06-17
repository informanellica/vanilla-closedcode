/**
 * Async-local-storage-backed scoped context provider.
 * @module closedcode/util/local-context
 */

import { AsyncLocalStorage } from "async_hooks";

/**
 * Error thrown when a context value is requested via `use()` outside of any
 * active `provide()` scope.
 */
export class NotFound extends Error {
  /**
   * @param {string} name - The name of the missing context, used in the message.
   */
  constructor(name) {
    super(`No context found for ${name}`);
    this.name = name;
  }
}

/**
 * Create a named context backed by an `AsyncLocalStorage` instance.
 *
 * @param {string} name - A descriptive name used in `NotFound` errors.
 * @returns {Object} A context object with two methods: `use()` returns the
 *   current value or throws `NotFound` when called outside a scope, and
 *   `provide(value, fn)` runs `fn` with `value` bound as the current context.
 */
export function create(name) {
  const storage = new AsyncLocalStorage();
  return {
    use() {
      const result = storage.getStore();
      if (!result) {
        throw new NotFound(name);
      }
      return result;
    },
    provide(value, fn) {
      return storage.run(value, fn);
    }
  };
}
export * as LocalContext from "./local-context.js";