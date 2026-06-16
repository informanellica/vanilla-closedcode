/** @file HTTP API middleware that provides the per-request instance context (resolved directory and workspace ref) from the workspace route. */
import { WorkspaceRef } from "#effect/instance-ref.js";
import { InstanceStore } from "#project/instance-store.js";
import { Effect, Layer } from "effect";
import { HttpRouter } from "effect/unstable/http";
import { HttpApiMiddleware } from "effect/unstable/httpapi";
import { WorkspaceRouteContext } from "./workspace-routing.js";
/** HttpApi middleware service that supplies the resolved instance context to downstream handlers. */
export class InstanceContextMiddleware extends HttpApiMiddleware.Service()("@closedcode/ExperimentalHttpApiInstanceContext") {}
/**
 * URI-decode a value, returning the original input unchanged if decoding throws.
 * @param {string} input - The possibly URI-encoded string.
 * @returns {string} The decoded string, or `input` when decoding fails.
 */
function decode(input) {
  try {
    return decodeURIComponent(input);
  } catch {
    return input;
  }
}
/**
 * Provide the instance context for `effect` based on the current workspace route.
 * Reads the route's directory (URI-decoded) and workspace ID, then runs `effect` inside the
 * corresponding instance from the store with the workspace ref provided.
 * @param {Effect} effect - The handler effect to run within the instance context.
 * @param {Object} store - The `InstanceStore` service used to provide the instance.
 * @returns {Effect} The effect run within the resolved instance and workspace context.
 */
function provideInstanceContext(effect, store) {
  return Effect.gen(function* () {
    const route = yield* WorkspaceRouteContext;
    return yield* store.provide({
      directory: decode(route.directory)
    }, effect.pipe(Effect.provideService(WorkspaceRef, route.workspaceID)));
  });
}
/** Layer implementing the `InstanceContextMiddleware` HttpApi service, providing instance context via the `InstanceStore`. */
export const instanceContextLayer = Layer.effect(InstanceContextMiddleware, Effect.gen(function* () {
  const store = yield* InstanceStore.Service;
  return InstanceContextMiddleware.of(effect => provideInstanceContext(effect, store));
}));
/** Router-level middleware that provides the instance context for raw (non-HttpApi) routes via the `InstanceStore`. */
export const instanceRouterMiddleware = HttpRouter.middleware()(Effect.gen(function* () {
  const store = yield* InstanceStore.Service;
  return effect => provideInstanceContext(effect, store);
}));