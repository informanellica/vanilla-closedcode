/** @file Promise-based bridge over InstanceStore for legacy callers that cannot yet yield the Effect Service. */
import { AppRuntime } from "#effect/app-runtime.js";
import { InstanceStore } from "./instance-store.js";

// Bridge for Promise/ALS callers that cannot yet yield InstanceStore.Service.
// Delete this module once those callers are migrated to Effect boundaries that
// provide InstanceStore directly.

/**
 * Load (or reuse) the instance for the given input directory.
 *
 * @param {Object} input - Load input; must include a `directory`, optionally `project`/`worktree`.
 * @returns {Promise<Object>} Resolves to the loaded instance context.
 */
export const load = input => AppRuntime.runPromise(InstanceStore.Service.use(store => store.load(input)));

/**
 * Dispose the instance associated with the given context.
 *
 * @param {Object} ctx - The instance context to dispose.
 * @returns {Promise<void>} Resolves once disposal completes.
 */
export const disposeInstance = ctx => AppRuntime.runPromise(InstanceStore.Service.use(store => store.dispose(ctx)));

/**
 * Dispose every currently loaded instance.
 *
 * @returns {Promise<void>} Resolves once all instances are disposed.
 */
export const disposeAllInstances = () => AppRuntime.runPromise(InstanceStore.Service.use(store => store.disposeAll()));

/**
 * Reload the instance for the given input directory, disposing any previous one first.
 *
 * @param {Object} input - Reload input; must include a `directory`.
 * @returns {Promise<Object>} Resolves to the freshly loaded instance context.
 */
export const reloadInstance = input => AppRuntime.runPromise(InstanceStore.Service.use(store => store.reload(input)));
export * as InstanceRuntime from "./instance-runtime.js";