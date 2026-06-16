/**
 * @file Effect HttpApi group for the instance event stream: a GET /event Server-Sent
 * Events endpoint that streams bus events (plus periodic heartbeats) to the client.
 */
import { Bus } from "#bus/index.js";
import * as Log from "core/util/log";
import { Effect, Schema } from "effect";
import * as Stream from "effect/Stream";
import { HttpServerResponse } from "effect/unstable/http";
import { HttpApi, HttpApiBuilder, HttpApiEndpoint, HttpApiGroup, HttpApiSchema, OpenApi } from "effect/unstable/httpapi";
import * as Sse from "effect/unstable/encoding/Sse";
const log = Log.create({
  service: "server"
});
/** Route paths exposed by the event API group. */
export const EventPaths = {
  event: "/event"
};
/** Effect HttpApi group exposing the GET /event SSE subscribe endpoint. */
export const EventApi = HttpApi.make("event").add(HttpApiGroup.make("event").add(HttpApiEndpoint.get("subscribe", EventPaths.event, {
  success: Schema.String.pipe(HttpApiSchema.asText({
    contentType: "text/event-stream"
  }))
}).annotateMerge(OpenApi.annotations({
  identifier: "event.subscribe",
  summary: "Subscribe to events",
  description: "Get events"
}))).annotateMerge(OpenApi.annotations({
  title: "event",
  description: "Instance event stream route."
})));
/**
 * Wraps a bus event payload into an SSE "message" frame with a JSON-encoded body.
 * @param {Object} data - The event payload to serialise.
 * @returns {Object} SSE frame descriptor consumed by the SSE encoder.
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
 * Builds the streaming SSE HTTP response: emits a server.connected event, then merges
 * the bus event stream with a 10-second heartbeat, encoding each frame as SSE text.
 * The stream halts when the instance is disposed.
 * @param {Object} bus - Bus service used to subscribe to all events.
 * @returns {Object} Effect HttpServerResponse streaming text/event-stream output.
 */
function eventResponse(bus) {
  const events = bus.subscribeAll().pipe(Stream.takeUntil(event => event.type === Bus.InstanceDisposed.type));
  const heartbeat = Stream.tick("10 seconds").pipe(Stream.drop(1), Stream.map(() => ({
    id: Bus.createID(),
    type: "server.heartbeat",
    properties: {}
  })));
  log.info("event connected");
  return HttpServerResponse.stream(Stream.make({
    id: Bus.createID(),
    type: "server.connected",
    properties: {}
  }).pipe(Stream.concat(events.pipe(Stream.merge(heartbeat, {
    haltStrategy: "left"
  }))), Stream.map(eventData), Stream.pipeThroughChannel(Sse.encode()), Stream.encodeText, Stream.ensuring(Effect.sync(() => log.info("event disconnected")))), {
    contentType: "text/event-stream",
    headers: {
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
/** Effect HttpApi handler group wiring the "subscribe" endpoint to the SSE event response. */
export const eventHandlers = HttpApiBuilder.group(EventApi, "event", handlers => Effect.gen(function* () {
  const bus = yield* Bus.Service;
  return handlers.handleRaw("subscribe", Effect.fn("EventHttpApi.subscribe")(function* () {
    return eventResponse(bus);
  }));
}));