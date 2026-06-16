/** @file Context providing diff-rendering worker pools, split by diff style (split vs unified). */
import { createSimpleContext } from "./helper.js";
const ctx = createSimpleContext({
  name: "WorkerPool",
  init: props => props.pools
});
/**
 * Context provider component that exposes the worker pools (via its `pools` prop) to descendants.
 * @type {Function}
 */
export const WorkerPoolProvider = ctx.provider;
/**
 * Hook returning the worker pool matching the requested diff style.
 * @param {string} diffStyle - Diff layout, "split" selects the split pool; anything else selects the unified pool.
 * @returns {Object} The worker pool for the given diff style.
 */
export function useWorkerPool(diffStyle) {
  const pools = ctx.use();
  if (diffStyle === "split") return pools.split;
  return pools.unified;
}