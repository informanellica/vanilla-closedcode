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
export const InstanceDisposed = BusEvent.define("server.instance.disposed", Schema.Struct({
  directory: Schema.String
}));
export class Service extends Context.Service()("@closedcode/Bus") {}
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
  const subscribeCallback = Effect.fn("Bus.subscribeCallback")(function* (def, callback) {
    const s = yield* InstanceState.get(state);
    const ps = yield* getOrCreate(s, def);
    return yield* on(ps, def.type, callback);
  });
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
export const defaultLayer = layer;
const {
  runPromise,
  runSync
} = makeRuntime(Service, layer);

// runSync is safe here because the subscribe chain (InstanceState.get, PubSub.subscribe,
// Scope.make, Effect.forkScoped) is entirely synchronous. If any step becomes async, this will throw.
export function createID() {
  return Identifier.create("evt", "ascending");
}
export async function publish(def, properties, options) {
  return runPromise(svc => svc.publish(def, properties, options));
}
export function subscribe(def, callback) {
  return runSync(svc => svc.subscribeCallback(def, callback));
}
export function subscribeAll(callback) {
  return runSync(svc => svc.subscribeAllCallback(callback));
}
export * as Bus from "./index.js";