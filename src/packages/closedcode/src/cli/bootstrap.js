/** @file CLI bootstrap helper: provisions an instance for a directory, runs a callback, then disposes the instance. */
import { Instance } from "../project/instance.js";
import { InstanceRuntime } from "../project/instance-runtime.js";
import { WithInstance } from "../project/with-instance.js";
/**
 * Run a callback within a provisioned instance scoped to `directory`, disposing the instance afterward.
 * @param {string} directory - Working directory the instance is bound to.
 * @param {Function} cb - Async callback executed once the instance is available; its result is returned.
 * @returns {Promise<*>} The value resolved by `cb`.
 */
export async function bootstrap(directory, cb) {
  return WithInstance.provide({
    directory,
    fn: async () => {
      try {
        const result = await cb();
        return result;
      } finally {
        await InstanceRuntime.disposeInstance(Instance.current);
      }
    }
  });
}