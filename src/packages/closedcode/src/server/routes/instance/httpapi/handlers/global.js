/** @file HTTP API handlers for the "global" group: health check, the global SSE event stream, global config get/update, server dispose, and installation upgrade. */
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
/**
 * Wraps a payload into an SSE "message" event envelope with a JSON-serialized data field.
 * @param {*} data - The payload to serialize into the event's data field.
 * @returns {Object} An SSE event object `{_tag, event, id, data}`.
 */
function eventData(data) {
  return {
    _tag: "Event",
    event: "message",
    id: undefined,
    data: JSON.stringify(data)
  };
}
/**
 * Parses a JSON request body, defaulting an empty body to `{}`.
 * @param {string} body - The raw request body text.
 * @returns {*} The parsed value, or `undefined` if parsing fails.
 */
function parseBody(body) {
  try {
    return JSON.parse(body || "{}");
  } catch {
    return undefined;
  }
}
/**
 * Builds a Server-Sent Events HTTP response that streams global bus events plus a periodic heartbeat,
 * starting with a `server.connected` event and tearing down the bus listener when the client disconnects.
 * @returns {Object} An HttpServerResponse streaming the SSE-encoded event feed.
 */
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
/**
 * Registers the handlers for the "global" HTTP API group on the root API.
 * @type {Object}
 */
export const globalHandlers = HttpApiBuilder.group(RootHttpApi, "global", handlers => Effect.gen(function* () {
  const config = yield* Config.Service;
  const installation = yield* Installation.Service;
  const bridge = yield* EffectBridge.make();
  /**
   * Health-check endpoint reporting liveness and the installed version.
   * @returns {Effect} Effect yielding `{healthy: true, version}`.
   */
  const health = Effect.fn("GlobalHttpApi.health")(function* () {
    return {
      healthy: true,
      version: InstallationVersion
    };
  });
  /**
   * Returns the global SSE event-stream response.
   * @returns {Effect} Effect yielding the streaming SSE HttpServerResponse.
   */
  const event = Effect.fn("GlobalHttpApi.event")(function* () {
    return eventResponse();
  });
  /**
   * Returns the global configuration.
   * @returns {Effect} Effect yielding the global config object.
   */
  const configGet = Effect.fn("GlobalHttpApi.configGet")(function* () {
    return yield* config.getGlobal();
  });
  /**
   * Updates the global configuration and, if it changed, disposes all instances (forked in the background).
   * @param {Object} ctx - Handler context; `payload` is the partial global config to apply.
   * @returns {Effect} Effect yielding the updated config info.
   */
  const configUpdate = Effect.fn("GlobalHttpApi.configUpdate")(function* (ctx) {
    const result = yield* config.updateGlobal(ctx.payload);
    if (result.changed) bridge.fork(disposeAllInstancesAndEmitGlobalDisposed({
      swallowErrors: true
    }));
    return result.info;
  });
  /**
   * Disposes all running instances and emits the global-disposed event.
   * @returns {Effect} Effect yielding `true` on success.
   */
  const dispose = Effect.fn("GlobalHttpApi.dispose")(function* () {
    yield* disposeAllInstancesAndEmitGlobalDisposed();
    return true;
  });
  /**
   * Upgrades the installation to the requested (or latest) version using the detected install method,
   * emitting an `Updated` event on success; returns a status/body envelope describing the outcome.
   * @param {Object} ctx - Handler context; `payload.target` optionally pins the target version.
   * @returns {Effect} Effect yielding `{status, body}` where `body` reports success/version or an error.
   */
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
  /**
   * Raw upgrade handler that reads/validates the JSON request body itself, then delegates to `upgrade`,
   * returning a JSON response with the appropriate status (400 on invalid body).
   * @param {Object} ctx - Handler context; `request` exposes the raw request for body text access.
   * @returns {Effect} Effect yielding an HTTP JSON response with the upgrade result.
   */
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