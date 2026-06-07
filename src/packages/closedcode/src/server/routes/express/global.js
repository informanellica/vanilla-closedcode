// Express route group for the /global endpoints (health, SSE events, config, dispose, upgrade).
import express from "express";
import { Effect } from "effect";
import { BusEvent } from "@/bus/bus-event.js";
import { SyncEvent } from "@/sync/index.js";
import { GlobalBus } from "@/bus/global.js";
import { Bus } from "@/bus/index.js";
import { AppRuntime } from "@/effect/app-runtime.js";
import { AsyncQueue } from "@/util/queue.js";
import { Installation } from "@/installation/index.js";
import { InstallationVersion } from "core/installation/version";
import * as Log from "core/util/log";
import { Config } from "@/config/config.js";
import z from "zod";
import { registerOperation } from "../../express/openapi.js";
import { validator } from "../../express/validate.js";
import { errors } from "../../express/errors.js";
import { disposeAllInstancesAndEmitGlobalDisposed } from "../../global-lifecycle.js";

const log = Log.create({ service: "server" });

// SSE helper: sets headers, pumps an AsyncQueue to the client, and tears down on disconnect.
function streamEvents(res, req, subscribe) {
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("X-Accel-Buffering", "no");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const q = new AsyncQueue();
  let done = false;
  q.push(JSON.stringify({ payload: { id: Bus.createID(), type: "server.connected", properties: {} } }));
  const heartbeat = setInterval(() => {
    q.push(JSON.stringify({ payload: { id: Bus.createID(), type: "server.heartbeat", properties: {} } }));
  }, 10_000);
  const stop = () => {
    if (done) return;
    done = true;
    clearInterval(heartbeat);
    unsub();
    q.push(null);
    log.info("global event disconnected");
  };
  const unsub = subscribe(q);
  req.on("close", stop);
  (async () => {
    try {
      for await (const data of q) {
        if (data === null) break;
        res.write(`data: ${data}\n\n`);
      }
    } finally {
      stop();
      res.end();
    }
  })();
}

export function GlobalRoutes(registry) {
  const router = express.Router();

  // Helper that registers a route's openapi metadata against the GROUP-RELATIVE mount ("/global").
  const describe = (method, path, meta) => registry && registerOperation(registry, method, "/global" + path, meta);

  describe("get", "/health", {
    summary: "Get health",
    description: "Get health information about the ClosedCode server.",
    operationId: "global.health",
    responses: {
      200: {
        description: "Health information",
        content: { "application/json": { schema: z.object({ healthy: z.literal(true), version: z.string() }) } },
      },
    },
  });
  router.get("/health", (_req, res) => {
    res.json({ healthy: true, version: InstallationVersion });
  });

  describe("get", "/event", {
    summary: "Get global events",
    description: "Subscribe to global events from the ClosedCode system using server-sent events.",
    operationId: "global.event",
    responses: {
      200: {
        description: "Event stream",
        content: {
          "text/event-stream": {
            schema: z.object({
              directory: z.string(),
              project: z.string().optional(),
              workspace: z.string().optional(),
              payload: z.union([...BusEvent.payloads(), ...SyncEvent.payloads()]),
            }).meta({ ref: "GlobalEvent" }),
          },
        },
      },
    },
  });
  router.get("/event", (req, res) => {
    log.info("global event connected");
    streamEvents(res, req, (q) => {
      async function handler(event) {
        q.push(JSON.stringify(event));
      }
      GlobalBus.on("event", handler);
      return () => GlobalBus.off("event", handler);
    });
  });

  describe("get", "/config", {
    summary: "Get global configuration",
    description: "Retrieve the current global ClosedCode configuration settings and preferences.",
    operationId: "global.config.get",
    responses: {
      200: {
        description: "Get global config info",
        content: { "application/json": { schema: Config.Info.zod } },
      },
    },
  });
  router.get("/config", async (_req, res, next) => {
    try {
      res.json(await AppRuntime.runPromise(Config.Service.use((cfg) => cfg.getGlobal())));
    } catch (err) {
      next(err);
    }
  });

  describe("patch", "/config", {
    summary: "Update global configuration",
    description: "Update global ClosedCode configuration settings and preferences.",
    operationId: "global.config.update",
    responses: {
      200: {
        description: "Successfully updated global config",
        content: { "application/json": { schema: Config.Info.zod } },
      },
      ...errors(400),
    },
  });
  router.patch("/config", validator("json", Config.Info.zod), async (req, res, next) => {
    try {
      const config = req.valid.json;
      const result = await AppRuntime.runPromise(Config.Service.use((cfg) => cfg.updateGlobal(config)));
      if (result.changed) {
        void AppRuntime.runPromise(disposeAllInstancesAndEmitGlobalDisposed({ swallowErrors: true })).catch(() => undefined);
      }
      res.json(result.info);
    } catch (err) {
      next(err);
    }
  });

  describe("post", "/dispose", {
    summary: "Dispose instance",
    description: "Clean up and dispose all ClosedCode instances, releasing all resources.",
    operationId: "global.dispose",
    responses: {
      200: {
        description: "Global disposed",
        content: { "application/json": { schema: z.boolean() } },
      },
    },
  });
  router.post("/dispose", async (_req, res, next) => {
    try {
      await AppRuntime.runPromise(disposeAllInstancesAndEmitGlobalDisposed());
      res.json(true);
    } catch (err) {
      next(err);
    }
  });

  describe("post", "/upgrade", {
    summary: "Upgrade closedcode",
    description: "Upgrade closedcode to the specified version or latest if not specified.",
    operationId: "global.upgrade",
    responses: {
      200: {
        description: "Upgrade result",
        content: {
          "application/json": {
            schema: z.union([
              z.object({ success: z.literal(true), version: z.string() }),
              z.object({ success: z.literal(false), error: z.string() }),
            ]),
          },
        },
      },
      ...errors(400),
    },
  });
  router.post("/upgrade", validator("json", z.object({ target: z.string().optional() })), async (req, res, next) => {
    try {
      const result = await AppRuntime.runPromise(
        Installation.Service.use((svc) =>
          Effect.gen(function* () {
            const method = yield* svc.method();
            if (method === "unknown") {
              return { success: false, status: 400, error: "Unknown installation method" };
            }
            const target = req.valid.json.target || (yield* svc.latest(method));
            const r = yield* Effect.catch(
              svc.upgrade(method, target).pipe(Effect.as({ success: true, version: target })),
              (err) => Effect.succeed({ success: false, status: 500, error: err instanceof Error ? err.message : String(err) }),
            );
            if (!r.success) return r;
            return { ...r, status: 200 };
          }),
        ),
      );
      if (!result.success) {
        return res.status(result.status).json({ success: false, error: result.error });
      }
      const target = result.version;
      GlobalBus.emit("event", {
        directory: "global",
        payload: { type: Installation.Event.Updated.type, properties: { version: target } },
      });
      res.json({ success: true, version: target });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
