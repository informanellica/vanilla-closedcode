import { Instance } from "../project/instance.js";
import { InstanceRuntime } from "../project/instance-runtime.js";
import { WithInstance } from "../project/with-instance.js";
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