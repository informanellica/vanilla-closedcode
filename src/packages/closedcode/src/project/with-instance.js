/**
 * @file Helper for running a callback within a loaded project-instance context:
 * loads the instance for a directory and establishes it as the ambient context.
 * @module closedcode/project/with-instance
 */
import { AppRuntime } from "#effect/app-runtime.js";
import { context } from "./instance-context.js";
import { InstanceStore } from "./instance-store.js";
/**
 * Load the project instance for `input.directory` and run `input.fn` with that
 * instance set as the ambient context.
 * @param {Object} input - `{directory: string, fn: Function}` — the project directory and the callback to run within the instance context.
 * @returns {Promise<*>} Resolves with the return value of `input.fn`.
 */
export async function provide(input) {
  const ctx = await AppRuntime.runPromise(InstanceStore.Service.use(store => store.load({
    directory: input.directory
  })));
  return context.provide(ctx, () => input.fn());
}
export * as WithInstance from "./with-instance.js";