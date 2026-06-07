// Express route group for the instance "/config" endpoints.
import express from "express";
import { Effect } from "effect";
import { Config } from "@/config/config.js";
import { InstanceState } from "@/effect/instance-state.js";
import { InstanceStore } from "@/project/instance-store.js";
import { Provider } from "@/provider/provider.js";
import { AppRuntime } from "@/effect/app-runtime.js";
import * as Log from "core/util/log";
import { registerOperation } from "../../express/openapi.js";
import { validator } from "../../express/validate.js";
import { errors } from "../../express/errors.js";
import { paramToAttributeKey } from "../instance/trace.js";

const log = Log.create({ service: "server.config" });

// Express equivalent of trace.js requestAttributes(c): build span attributes
// from the Express request (method/path + matched route params).
function requestAttributes(req) {
  const attributes = {
    "http.method": req.method,
    "http.path": req.baseUrl + req.path,
  };
  for (const [key, value] of Object.entries(req.params ?? {})) {
    attributes[paramToAttributeKey(key)] = value;
  }
  return attributes;
}

// Express equivalent of trace.js runRequest: run an Effect inside a span named
// `name` with the request attributes.
function runEffect(name, req, effect) {
  return AppRuntime.runPromise(effect.pipe(Effect.withSpan(name, { attributes: requestAttributes(req) })));
}

export function ConfigRoutes(registry) {
  const router = express.Router();

  // Register a route's openapi metadata against the GROUP-RELATIVE mount ("/config").
  const describe = (method, path, meta) => registry && registerOperation(registry, method, "/config" + path, meta);

  describe("get", "/", {
    summary: "Get configuration",
    description: "Retrieve the current ClosedCode configuration settings and preferences.",
    operationId: "config.get",
    responses: {
      200: {
        description: "Get config info",
        content: { "application/json": { schema: Config.Info.zod } },
      },
    },
  });
  router.get("/", async (req, res, next) => {
    try {
      const result = await runEffect("ConfigRoutes.get", req, Effect.gen(function* () {
        const cfg = yield* Config.Service;
        return yield* cfg.get();
      }));
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  describe("patch", "/", {
    summary: "Update configuration",
    description: "Update ClosedCode configuration settings and preferences.",
    operationId: "config.update",
    responses: {
      200: {
        description: "Successfully updated config",
        content: { "application/json": { schema: Config.Info.zod } },
      },
      ...errors(400),
    },
  });
  router.patch("/", validator("json", Config.Info.zod), async (req, res, next) => {
    try {
      const result = await runEffect("ConfigRoutes.update", req, Effect.gen(function* () {
        const config = req.valid.json;
        const cfg = yield* Config.Service;
        yield* cfg.update(config);
        return {
          config,
          ctx: yield* InstanceState.context,
        };
      }));
      // Dispose the instance asynchronously after responding (fire-and-forget).
      void runEffect(
        "ConfigRoutes.update.dispose",
        req,
        InstanceStore.Service.use((store) => store.dispose(result.ctx)).pipe(
          Effect.uninterruptible,
          Effect.catchCause((cause) => Effect.sync(() => log.warn("instance disposal failed", { cause }))),
        ),
      );
      res.json(result.config);
    } catch (err) {
      next(err);
    }
  });

  describe("get", "/providers", {
    summary: "List config providers",
    description: "Get a list of all configured AI providers and their default models.",
    operationId: "config.providers",
    responses: {
      200: {
        description: "List of providers",
        content: { "application/json": { schema: Provider.ConfigProvidersResult.zod } },
      },
    },
  });
  router.get("/providers", async (req, res, next) => {
    try {
      const result = await runEffect("ConfigRoutes.providers", req, Effect.gen(function* () {
        const svc = yield* Provider.Service;
        const providers = yield* svc.list();
        return {
          providers: Object.values(providers),
          default: Provider.defaultModelIDs(providers),
        };
      }));
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
