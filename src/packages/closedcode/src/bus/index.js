/**
 * Effect-based publish/subscribe event bus: per-instance PubSub channels (typed + wildcard) bridged to the process-wide GlobalBus, with Promise/callback helpers for non-Effect callers.
 * @module closedcode/bus
 */
import { Effect, Exit, Layer, PubSub, Scope, Context, Stream, Schema } from "effect";
import { EffectBridge } from "#effect/bridge.js";
import * as Log from "core/util/log";
import { BusEvent } from "./bus-event.js";
import { GlobalBus } from "./global.js";
import { InstanceState } from "#effect/instance-state.js";
import { makeRuntime } from "#effect/run-service.js";
import { Identifier } from "#id/id.js";
const log = Log.create({
  service: "bus"
});
/** Event published right before an instance's bus is shut down, carrying the instance directory. */
export const InstanceDisposed = BusEvent.define("server.instance.disposed", Schema.Struct({
  directory: Schema.String
}));
/** Effect service tag for the bus. */
export class Service extends Context.Service()("@closedcode/Bus") {}
/** Effect layer that builds the Bus service: per-instance state plus publish/subscribe operations. */
export const layer = Layer.effect(Service, Effect.gen(function* () {
  const state = yield* InstanceState.make(Effect.fn("Bus.state")(function* (ctx) {
    const wildcard = yield* PubSub.unbounded();
    const typed = new Map();
    yield* Effect.addFinalizer(() => Effect.gen(function* () {
      // Publish InstanceDisposed before shutting down so subscribers see it
      yield* PubSub.publish(wildcard, {
        type: InstanceDisposed.type,
        id: createID(),
        properties: {
          directory: ctx.directory
        }
      });
      yield* PubSub.shutdown(wildcard);
      for (const ps of typed.values()) {
        yield* PubSub.shutdown(ps);
      }
    }));
    return {
      wildcard,
      typed
    };
  }));
  /**
   * Get the typed PubSub channel for an event definition, creating it on first use.
   * @param {{typed: Map}} state - Instance state holding the typed-channel map.
   * @param {{type: string}} def - Event definition whose `type` keys the channel.
   * @returns {Effect} Effect yielding the PubSub channel for `def.type`.
   */
  function getOrCreate(state, def) {
    return Effect.gen(function* () {
      let ps = state.typed.get(def.type);
      if (!ps) {
        ps = yield* PubSub.unbounded();
        state.typed.set(def.type, ps);
      }
      return ps;
    });
  }
  /**
   * Publish an event to its typed channel, the wildcard channel, and the process-wide GlobalBus.
   * @param {{type: string}} def - Event definition identifying the channel/type.
   * @param {Object} properties - Event payload properties.
   * @param {{id: string}} options - Optional overrides; `id` sets an explicit event id (otherwise generated).
   * @returns {Effect} Effect that completes once the event has been published everywhere.
   */
  function publish(def, properties, options) {
    return Effect.gen(function* () {
      const s = yield* InstanceState.get(state);
      const payload = {
        id: options?.id ?? createID(),
        type: def.type,
        properties
      };
      log.info("publishing", {
        type: def.type
      });
      const ps = s.typed.get(def.type);
      if (ps) yield* PubSub.publish(ps, payload);
      yield* PubSub.publish(s.wildcard, payload);
      const dir = yield* InstanceState.directory;
      const context = yield* InstanceState.context;
      const workspace = yield* InstanceState.workspaceID;
      GlobalBus.emit("event", {
        directory: dir,
        project: context.project.id,
        workspace,
        payload
      });
    });
  }
  /**
   * Subscribe to a single event type as a Stream of payloads.
   * @param {{type: string}} def - Event definition identifying the typed channel.
   * @returns {Object} Effect Stream that emits payloads for `def.type` until the scope ends.
   */
  function subscribe(def) {
    log.info("subscribing", {
      type: def.type
    });
    return Stream.unwrap(Effect.gen(function* () {
      const s = yield* InstanceState.get(state);
      const ps = yield* getOrCreate(s, def);
      return Stream.fromPubSub(ps);
    })).pipe(Stream.ensuring(Effect.sync(() => log.info("unsubscribing", {
      type: def.type
    }))));
  }
  /**
   * Subscribe to every event type via the wildcard channel as a Stream of payloads.
   * @returns {Object} Effect Stream that emits all published payloads until the scope ends.
   */
  function subscribeAll() {
    log.info("subscribing", {
      type: "*"
    });
    return Stream.unwrap(Effect.gen(function* () {
      const s = yield* InstanceState.get(state);
      return Stream.fromPubSub(s.wildcard);
    })).pipe(Stream.ensuring(Effect.sync(() => log.info("unsubscribing", {
      type: "*"
    }))));
  }
  /**
   * Bridge a PubSub channel to a plain callback, forking a scoped subscription and returning an unsubscribe function.
   * Callback errors are caught and logged so one bad subscriber cannot break the stream.
   * @param {Object} pubsub - The PubSub channel to subscribe to.
   * @param {string} type - Event type label used in log messages ("*" for wildcard).
   * @param {Function} callback - Invoked with each received message.
   * @returns {Effect} Effect yielding an unsubscribe Function that closes the subscription scope.
   */
  function on(pubsub, type, callback) {
    return Effect.gen(function* () {
      log.info("subscribing", {
        type
      });
      const bridge = yield* EffectBridge.make();
      const scope = yield* Scope.make();
      const subscription = yield* Scope.provide(scope)(PubSub.subscribe(pubsub));
      yield* Scope.provide(scope)(Stream.fromSubscription(subscription).pipe(Stream.runForEach(msg => Effect.tryPromise({
        try: () => Promise.resolve().then(() => callback(msg)),
        catch: cause => {
          log.error("subscriber failed", {
            type,
            cause
          });
        }
      }).pipe(Effect.ignore)), Effect.forkScoped));
      return () => {
        log.info("unsubscribing", {
          type
        });
        bridge.fork(Scope.close(scope, Exit.void));
      };
    });
  }
  /**
   * Subscribe to a single event type with a plain callback (Effect-aware wrapper around `on`).
   * @param {{type: string}} def - Event definition identifying the typed channel.
   * @param {Function} callback - Invoked with each payload of `def.type`.
   * @returns {Effect} Effect yielding an unsubscribe Function.
   */
  const subscribeCallback = Effect.fn("Bus.subscribeCallback")(function* (def, callback) {
    const s = yield* InstanceState.get(state);
    const ps = yield* getOrCreate(s, def);
    return yield* on(ps, def.type, callback);
  });
  /**
   * Subscribe to every event type with a plain callback via the wildcard channel.
   * @param {Function} callback - Invoked with each published payload.
   * @returns {Effect} Effect yielding an unsubscribe Function.
   */
  const subscribeAllCallback = Effect.fn("Bus.subscribeAllCallback")(function* (callback) {
    const s = yield* InstanceState.get(state);
    return yield* on(s.wildcard, "*", callback);
  });
  return Service.of({
    publish,
    subscribe,
    subscribeAll,
    subscribeCallback,
    subscribeAllCallback
  });
}));
/** Default layer used when no explicit Bus layer is provided. */
export const defaultLayer = layer;
const {
  runPromise,
  runSync
} = makeRuntime(Service, layer);

// runSync is safe here because the subscribe chain (InstanceState.get, PubSub.subscribe,
// Scope.make, Effect.forkScoped) is entirely synchronous. If any step becomes async, this will throw.
/**
 * Generate a new ascending event id.
 * @returns {string} A fresh "evt" identifier.
 */
export function createID() {
  return Identifier.create("evt", "ascending");
}
/**
 * Publish an event from non-Effect code (resolves once published).
 * @param {{type: string}} def - Event definition identifying the channel/type.
 * @param {Object} properties - Event payload properties.
 * @param {{id: string}} options - Optional overrides; `id` sets an explicit event id.
 * @returns {Promise<void>} Resolves when the event has been published.
 */
export async function publish(def, properties, options) {
  return runPromise(svc => svc.publish(def, properties, options));
}
/**
 * Subscribe to a single event type with a callback from non-Effect code.
 * @param {{type: string}} def - Event definition identifying the typed channel.
 * @param {Function} callback - Invoked with each payload of `def.type`.
 * @returns {Function} Unsubscribe function.
 */
export function subscribe(def, callback) {
  return runSync(svc => svc.subscribeCallback(def, callback));
}
/**
 * Subscribe to all event types with a callback from non-Effect code.
 * @param {Function} callback - Invoked with each published payload.
 * @returns {Function} Unsubscribe function.
 */
export function subscribeAll(callback) {
  return runSync(svc => svc.subscribeAllCallback(callback));
}
export * as Bus from "./index.js";