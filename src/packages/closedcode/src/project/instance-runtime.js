import { AppRuntime } from "#effect/app-runtime.js";
import { InstanceStore } from "./instance-store.js";

// Bridge for Promise/ALS callers that cannot yet yield InstanceStore.Service.
// Delete this module once those callers are migrated to Effect boundaries that
// provide InstanceStore directly.

export const load = input => AppRuntime.runPromise(InstanceStore.Service.use(store => store.load(input)));
export const disposeInstance = ctx => AppRuntime.runPromise(InstanceStore.Service.use(store => store.dispose(ctx)));
export const disposeAllInstances = () => AppRuntime.runPromise(InstanceStore.Service.use(store => store.disposeAll()));
export const reloadInstance = input => AppRuntime.runPromise(InstanceStore.Service.use(store => store.reload(input)));
export * as InstanceRuntime from "./instance-runtime.js";