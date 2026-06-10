// Express route group for the control-plane endpoints (auth, /log, OpenAPI /doc).
import express from "express";
import { Auth } from "#auth/index.js";
import { AppRuntime } from "#effect/app-runtime.js";
import * as Log from "core/util/log";
import { Effect } from "effect";
import { ProviderID } from "#provider/schema.js";
import z from "zod";
import { registerOperation, buildSpec } from "../../express/openapi.js";
import { validator } from "../../express/validate.js";
import { errors } from "../../express/errors.js";

export function ControlPlaneRoutes(registry) {
  const router = express.Router();

  // Helper that registers a route's openapi metadata against the GROUP-RELATIVE mount (root, "").
  const describe = (method, path, meta) => registry && registerOperation(registry, method, path, meta);

  describe("put", "/auth/:providerID", {
    summary: "Set auth credentials",
    description: "Set authentication credentials",
    operationId: "auth.set",
    responses: {
      200: {
        description: "Successfully set authentication credentials",
        content: { "application/json": { schema: z.boolean() } },
      },
      ...errors(400),
    },
  });
  router.put(
    "/auth/:providerID",
    validator("param", z.object({ providerID: ProviderID.zod })),
    validator("json", Auth.Info.zod),
    async (req, res, next) => {
      try {
        const providerID = req.valid.param.providerID;
        const info = req.valid.json;
        await AppRuntime.runPromise(Effect.gen(function* () {
          const auth = yield* Auth.Service;
          yield* auth.set(providerID, info);
        }));
        res.json(true);
      } catch (err) {
        next(err);
      }
    },
  );

  describe("delete", "/auth/:providerID", {
    summary: "Remove auth credentials",
    description: "Remove authentication credentials",
    operationId: "auth.remove",
    responses: {
      200: {
        description: "Successfully removed authentication credentials",
        content: { "application/json": { schema: z.boolean() } },
      },
      ...errors(400),
    },
  });
  router.delete(
    "/auth/:providerID",
    validator("param", z.object({ providerID: ProviderID.zod })),
    async (req, res, next) => {
      try {
        const providerID = req.valid.param.providerID;
        await AppRuntime.runPromise(Effect.gen(function* () {
          const auth = yield* Auth.Service;
          yield* auth.remove(providerID);
        }));
        res.json(true);
      } catch (err) {
        next(err);
      }
    },
  );

  // The OpenAPI spec endpoint. Built lazily from the registry so every
  // operation registered across all mounted groups is included.
  router.get("/doc", (_req, res) => {
    res.json(buildSpec(registry, {
      info: { title: "closedcode", version: "0.0.3", description: "closedcode api" },
      openapi: "3.1.1",
    }));
  });

  describe("post", "/log", {
    summary: "Write log",
    description: "Write a log entry to the server logs with specified level and metadata.",
    operationId: "app.log",
    responses: {
      200: {
        description: "Log entry written successfully",
        content: { "application/json": { schema: z.boolean() } },
      },
      ...errors(400),
    },
  });
  router.post(
    "/log",
    // Query validator applied as per-route middleware on /log only.
    validator("query", z.object({ directory: z.string().optional(), workspace: z.string().optional() })),
    validator("json", z.object({
      service: z.string().meta({ description: "Service name for the log entry" }),
      level: z.enum(["debug", "info", "error", "warn"]).meta({ description: "Log level" }),
      message: z.string().meta({ description: "Log message" }),
      extra: z.record(z.string(), z.any()).optional().meta({ description: "Additional metadata for the log entry" }),
    })),
    async (req, res, next) => {
      try {
        const { service, level, message, extra } = req.valid.json;
        const logger = Log.create({ service });
        switch (level) {
          case "debug":
            logger.debug(message, extra);
            break;
          case "info":
            logger.info(message, extra);
            break;
          case "error":
            logger.error(message, extra);
            break;
          case "warn":
            logger.warn(message, extra);
            break;
        }
        res.json(true);
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
