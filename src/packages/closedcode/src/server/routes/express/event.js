// Express route group for the instance /event SSE endpoint.
import express from "express";
import z from "zod";
import * as Log from "core/util/log";
import { BusEvent } from "#bus/bus-event.js";
import { Bus } from "#bus/index.js";
import { AsyncQueue } from "#util/queue.js";
import { registerOperation } from "../../express/openapi.js";

const log = Log.create({ service: "server" });

export function EventRoutes(registry) {
  const router = express.Router();

  // Register a route's openapi metadata against the GROUP-RELATIVE mount.
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
