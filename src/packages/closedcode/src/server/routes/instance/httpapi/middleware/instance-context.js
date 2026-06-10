import { WorkspaceRef } from "#effect/instance-ref.js";
import { InstanceStore } from "#project/instance-store.js";
import { Effect, Layer } from "effect";
import { HttpRouter } from "effect/unstable/http";
import { HttpApiMiddleware } from "effect/unstable/httpapi";
import { WorkspaceRouteContext } from "./workspace-routing.js";
export class InstanceContextMiddleware extends HttpApiMiddleware.Service()("@closedcode/ExperimentalHttpApiInstanceContext") {}
function decode(input) {
  try {
    return decodeURIComponent(input);
  } catch {
    return input;
  }
}
function provideInstanceContext(effect, store) {
  return Effect.gen(function* () {
    const route = yield* WorkspaceRouteContext;
    return yield* store.provide({
      directory: decode(route.directory)
    }, effect.pipe(Effect.provideService(WorkspaceRef, route.workspaceID)));
  });
}
export const instanceContextLayer = Layer.effect(InstanceContextMiddleware, Effect.gen(function* () {
  const store = yield* InstanceStore.Service;
  return InstanceContextMiddleware.of(effect => provideInstanceContext(effect, store));
}));
export const instanceRouterMiddleware = HttpRouter.middleware()(Effect.gen(function* () {
  const store = yield* InstanceStore.Service;
  return effect => provideInstanceContext(effect, store);
}));