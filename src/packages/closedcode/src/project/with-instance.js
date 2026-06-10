import { AppRuntime } from "#effect/app-runtime.js";
import { context } from "./instance-context.js";
import { InstanceStore } from "./instance-store.js";
export async function provide(input) {
  const ctx = await AppRuntime.runPromise(InstanceStore.Service.use(store => store.load({
    directory: input.directory
  })));
  return context.provide(ctx, () => input.fn());
}
export * as WithInstance from "./with-instance.js";