import { Config } from "#config/config.js";
import { GlobalBus } from "#bus/global.js";
import { EffectBridge } from "#effect/bridge.js";
import { Bus } from "#bus/index.js";
import { Installation } from "#installation/index.js";
import { disposeAllInstancesAndEmitGlobalDisposed } from "#server/global-lifecycle.js";
import { InstallationVersion } from "core/installation/version";
import * as Log from "core/util/log";
import { Effect, Queue, Schema } from "effect";
import * as Stream from "effect/Stream";
import { HttpServerResponse } from "effect/unstable/http";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import * as Sse from "effect/unstable/encoding/Sse";
import { RootHttpApi } from "../api.js";
import { GlobalUpgradeInput } from "../groups/global.js";
const log = Log.create({
  service: "server"
});
function eventData(data) {
  return {
    _tag: "Event",
    event: "message",
    id: undefined,
    data: JSON.stringify(data)
  };
}
function parseBody(body) {
  try {
    return JSON.parse(body || "{}");
  } catch {
    return undefined;
  }
}
function eventResponse() {
  log.info("global event connected");
  const events = Stream.callback(queue => {
    const handler = event => Queue.offerUnsafe(queue, event);
    return Effect.acquireRelease(Effect.sync(() => GlobalBus.on("event", handler)), () => Effect.sync(() => GlobalBus.off("event", handler)));
  });
  const heartbeat = Stream.tick("10 seconds").pipe(Stream.drop(1), Stream.map(() => ({
    payload: {
      id: Bus.createID(),
      type: "server.heartbeat",
      properties: {}
    }
  })));
  return HttpServerResponse.stream(Stream.make({
    payload: {
      id: Bus.createID(),
      type: "server.connected",
      properties: {}
    }
  }).pipe(Stream.concat(events.pipe(Stream.merge(heartbeat, {
    haltStrategy: "left"
  }))), Stream.map(eventData), Stream.pipeThroughChannel(Sse.encode()), Stream.encodeText, Stream.ensuring(Effect.sync(() => log.info("global event disconnected")))), {
    contentType: "text/event-stream",
    headers: {
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
export const globalHandlers = HttpApiBuilder.group(RootHttpApi, "global", handlers => Effect.gen(function* () {
  const config = yield* Config.Service;
  const installation = yield* Installation.Service;
  const bridge = yield* EffectBridge.make();
  const health = Effect.fn("GlobalHttpApi.health")(function* () {
    return {
      healthy: true,
      version: InstallationVersion
    };
  });
  const event = Effect.fn("GlobalHttpApi.event")(function* () {
    return eventResponse();
  });
  const configGet = Effect.fn("GlobalHttpApi.configGet")(function* () {
    return yield* config.getGlobal();
  });
  const configUpdate = Effect.fn("GlobalHttpApi.configUpdate")(function* (ctx) {
    const result = yield* config.updateGlobal(ctx.payload);
    if (result.changed) bridge.fork(disposeAllInstancesAndEmitGlobalDisposed({
      swallowErrors: true
    }));
    return result.info;
  });
  const dispose = Effect.fn("GlobalHttpApi.dispose")(function* () {
    yield* disposeAllInstancesAndEmitGlobalDisposed();
    return true;
  });
  const upgrade = Effect.fn("GlobalHttpApi.upgrade")(function* (ctx) {
    const method = yield* installation.method();
    if (method === "unknown") {
      return {
        status: 400,
        body: {
          success: false,
          error: "Unknown installation method"
        }
      };
    }
    const target = ctx.payload.target || (yield* installation.latest(method));
    const result = yield* installation.upgrade(method, target).pipe(Effect.as({
      status: 200,
      body: {
        success: true,
        version: target
      }
    }), Effect.catch(err => Effect.succeed({
      status: 500,
      body: {
        success: false,
        error: err instanceof Error ? err.message : String(err)
      }
    })));
    if (!result.body.success) return result;
    GlobalBus.emit("event", {
      directory: "global",
      payload: {
        type: Installation.Event.Updated.type,
        properties: {
          version: target
        }
      }
    });
    return result;
  });
  const upgradeRaw = Effect.fn("GlobalHttpApi.upgradeRaw")(function* (ctx) {
    const body = yield* Effect.orDie(ctx.request.text);
    const json = parseBody(body);
    if (json === undefined) {
      return HttpServerResponse.jsonUnsafe({
        success: false,
        error: "Invalid request body"
      }, {
        status: 400
      });
    }
    const payload = yield* Schema.decodeUnknownEffect(GlobalUpgradeInput)(json).pipe(Effect.map(payload => ({
      valid: true,
      payload
    })), Effect.catch(() => Effect.succeed({
      valid: false
    })));
    if (!payload.valid) {
      return HttpServerResponse.jsonUnsafe({
        success: false,
        error: "Invalid request body"
      }, {
        status: 400
      });
    }
    const result = yield* upgrade({
      payload: payload.payload
    });
    return HttpServerResponse.jsonUnsafe(result.body, {
      status: result.status
    });
  });
  return handlers.handle("health", health).handleRaw("event", event).handle("configGet", configGet).handle("configUpdate", configUpdate).handle("dispose", dispose).handleRaw("upgrade", upgradeRaw);
}));