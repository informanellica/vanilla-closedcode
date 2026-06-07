import { createSimpleContext } from "./helper.js";
const ctx = createSimpleContext({
  name: "WorkerPool",
  init: props => props.pools
});
export const WorkerPoolProvider = ctx.provider;
export function useWorkerPool(diffStyle) {
  const pools = ctx.use();
  if (diffStyle === "split") return pools.split;
  return pools.unified;
}