/** @file Express route group for the instance "/event" Server-Sent Events endpoint that streams bus events (with periodic heartbeats) to clients. */
// Express route group for the instance /event SSE endpoint.
import express from "express";
import z from "zod";
import * as Log from "core/util/log";
import { BusEvent } from "#bus/bus-event.js";
import { Bus } from "#bus/index.js";
import { AsyncQueue } from "#util/queue.js";
import { registerOperation } from "../../express/openapi.js";

const log = Log.create({ service: "server" });

/**
 * Build the Express router exposing GET "/event", a Server-Sent Events stream of bus events.
 * Each connection emits an initial "server.connected" event, periodic "server.heartbeat" events,
 * and forwards all subscribed bus events until the client disconnects or the instance is disposed.
 * @param {Object} registry - Optional OpenAPI registry to record operation metadata against; falsy disables registration.
 * @returns {express.Router} The configured Express router.
 */
export function EventRoutes(registry) {
  const router = express.Router();

  // Register a route's openapi metadata against the GROUP-RELATIVE mount.
  /**
   * Register a route's OpenAPI operation metadata against the group-relative mount.
   * @param {string} method - HTTP method (e.g. "get").
   * @param {string} path - Group-relative path (e.g. "/event").
   * @param {Object} meta - OpenAPI operation metadata.
   * @returns {*} The registration result, or undefined when no registry is provided.
   */
  const describe = (method, path, meta) => registry && registerOperation(registry, method, path, meta);

  describe("get", "/event", {
    summary: "Subscribe to events",
    description: "Get events",
    operationId: "event.subscribe",
    responses: {
      200: {
        description: "Event stream",
        content: {
          "text/event-stream": {
            schema: z.union(BusEvent.payloads()).meta({ ref: "Event" }),
          },
        },
      },
    },
  });
  router.get("/event", (req, res) => {
    log.info("event connected");
    // SSE headers.
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("X-Accel-Buffering", "no");
    res.setHeader("X-Content-Type-Options", "nosniff");

    res.status(200);
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    const q = new AsyncQueue();
    let done = false;
    q.push(JSON.stringify({ id: Bus.createID(), type: "server.connected", properties: {} }));

    // Send heartbeat every 10s to prevent stalled proxy streams.
    const heartbeat = setInterval(() => {
      q.push(JSON.stringify({ id: Bus.createID(), type: "server.heartbeat", properties: {} }));
    }, 10_000);
    /**
     * Idempotently shut down this SSE connection: clear the heartbeat, unsubscribe from the bus,
     * and signal the queue to terminate.
     * @returns {void}
     */
    const stop = () => {
      if (done) return;
      done = true;
      clearInterval(heartbeat);
      unsub();
      q.push(null);
      log.info("event disconnected");
    };
    const unsub = Bus.subscribeAll((event) => {
      q.push(JSON.stringify(event));
      if (event.type === Bus.InstanceDisposed.type) {
        stop();
      }
    });
    req.on("close", stop);
    (async () => {
      try {
        for await (const data of q) {
          if (data === null) return;
          res.write(`data: ${data}\n\n`);
        }
      } finally {
        stop();
        res.end();
      }
    })();
  });

  return router;
}
