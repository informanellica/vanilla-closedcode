/** @file Factory for lazily-initialized Effect ManagedRuntimes that bind a service's layer (merged with observability) and expose runSync/runPromise-style helpers. */
import { Layer, ManagedRuntime } from "effect";
import { memoMap } from "./memo-map.js";
import { Observability } from "./observability.js";
/**
 * Create a set of runner helpers backed by a lazily-built ManagedRuntime that
 * provides the given layer merged with the observability layer (sharing the
 * global MemoMap). Each helper resolves the runtime on first use and runs the
 * supplied function within the service's context.
 * @param {Object} service - A service tag exposing a `use(fn)` accessor.
 * @param {Object} layer - The Effect Layer providing the service's dependencies.
 * @returns {Object} An object with `runSync`, `runPromiseExit`, `runPromise`, `runFork`, and `runCallback` methods.
 */
export function makeRuntime(service, layer) {
  let rt;
  const getRuntime = () => rt ??= ManagedRuntime.make(Layer.provideMerge(layer, Observability.layer), {
    memoMap
  });
  return {
    runSync: fn => getRuntime().runSync(service.use(fn)),
    runPromiseExit: (fn, options) => getRuntime().runPromiseExit(service.use(fn), options),
    runPromise: (fn, options) => getRuntime().runPromise(service.use(fn), options),
    runFork: fn => getRuntime().runFork(service.use(fn)),
    runCallback: fn => getRuntime().runCallback(service.use(fn))
  };
}