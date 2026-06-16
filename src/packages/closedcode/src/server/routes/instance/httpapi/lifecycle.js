/** @file Instance lifecycle middleware: defers disposing or reloading an instance until after the HTTP response has been produced. */
import { EffectBridge } from "#effect/bridge.js";
import { InstanceStore } from "#project/instance-store.js";
import { Effect } from "effect";
import { HttpEffect, HttpServerRequest } from "effect/unstable/http";
// Disposal is requested by an endpoint handler, but must run from the outer
// server middleware after the response has been produced. The original Request
// object is the stable handoff key between those two phases.
const disposeAfterResponse = new WeakMap();
/**
 * Capture the services needed to dispose or reload an instance later.
 * @param {*} ctx - The instance context to act on after the response.
 * @returns {Effect} An effect resolving to `{ ctx, store, bridge }`.
 */
const mark = ctx => Effect.gen(function* () {
  return {
    ctx,
    store: yield* InstanceStore.Service,
    bridge: yield* EffectBridge.make()
  };
});
/**
 * Mark the current request's instance to be disposed after the response is sent.
 * Registers a pre-response handler that stashes the captured services keyed by the source Request,
 * which `disposeMiddleware` later reads to perform the teardown.
 * @param {*} ctx - The instance context to dispose once the response has been produced.
 * @returns {Effect} An effect that appends the pre-response handler.
 */
export const markInstanceForDisposal = ctx => Effect.gen(function* () {
  const marked = yield* mark(ctx);
  return yield* HttpEffect.appendPreResponseHandler((request, response) => Effect.sync(() => {
    // The response is sent before disposeMiddleware performs the teardown.
    disposeAfterResponse.set(request.source, marked);
    return response;
  }));
});
/**
 * Mark the current request's instance to be reloaded after the response is sent.
 * Registers a pre-response handler that, once the response is ready, uninterruptibly runs the
 * store reload using the captured bridge and returns the original response unchanged.
 * @param {*} ctx - The instance context to reload once the response has been produced.
 * @param {*} next - The reload target/payload passed through to `store.reload`.
 * @returns {Effect} An effect that appends the pre-response handler.
 */
export const markInstanceForReload = (ctx, next) => Effect.gen(function* () {
  const marked = yield* mark(ctx);
  return yield* HttpEffect.appendPreResponseHandler((_request, response) => Effect.as(Effect.uninterruptible(marked.bridge.run(marked.store.reload(next))), response));
});
/**
 * Outer server middleware that performs deferred instance disposal after a handler has produced its response.
 * Looks up any instance previously marked via `markInstanceForDisposal` (keyed by the request source),
 * removes the mark, and uninterruptibly runs the store disposal before returning the response.
 * @param {Effect} effect - The inner handler effect that produces the HTTP response.
 * @returns {Effect} An effect resolving to the (unchanged) response after any pending disposal runs.
 */
export const disposeMiddleware = effect => Effect.gen(function* () {
  const response = yield* effect;
  const request = yield* HttpServerRequest.HttpServerRequest;
  const marked = disposeAfterResponse.get(request.source);
  if (!marked) return response;
  disposeAfterResponse.delete(request.source);
  yield* Effect.uninterruptible(marked.bridge.run(marked.store.dispose(marked.ctx)));
  return response;
});