// Express route group for the instance /permission endpoints.
import express from "express";
import { Effect } from "effect";
import z from "zod";
import { Permission } from "@/permission/index.js";
import { PermissionID } from "@/permission/schema.js";
import { AppRuntime } from "@/effect/app-runtime.js";
import { registerOperation } from "../../express/openapi.js";
import { validator } from "../../express/validate.js";
import { errors } from "../../express/errors.js";

// Group-relative mount of this router.
const BASE = "/permission";

// OTel attribute key normalisation: `fooID` -> `foo.id`; other params are namespaced under `closedcode.`.
function paramToAttributeKey(key) {
  const m = key.match(/^(.+)ID$/);
  if (m) return `${m[1].toLowerCase()}.id`;
  return `closedcode.${key}`;
}

// OTel span attributes for an Express request; mirrors trace.js requestAttributes.
function requestAttributes(req) {
  const attributes = {
    "http.method": req.method,
    "http.path": req.path,
  };
  for (const [key, value] of Object.entries(req.params ?? {})) {
    attributes[paramToAttributeKey(key)] = value;
  }
  return attributes;
}

// Runs an Effect inside a named span carrying the request attributes.
function runRequest(name, req, effect) {
  return AppRuntime.runPromise(
    effect.pipe(
      Effect.withSpan(name, {
        attributes: requestAttributes(req),
      }),
    ),
  );
}

// Runs an Effect generator and JSON-encodes the resolved value onto the response.
async function jsonRequest(name, req, res, gen) {
  res.json(await runRequest(name, req, Effect.gen(gen)));
}

export function PermissionRoutes(registry) {
  const router = express.Router();

  // Register a route's openapi metadata against the GROUP-RELATIVE mount ("/permission").
  const describe = (method, path, meta) => registry && registerOperation(registry, method, BASE + path, meta);

  describe("post", "/:requestID/reply", {
    summary: "Respond to permission request",
    description: "Approve or deny a permission request from the AI assistant.",
    operationId: "permission.reply",
    responses: {
      200: {
        description: "Permission processed successfully",
        content: {
          "application/json": {
            schema: z.boolean(),
          },
        },
      },
      ...errors(400, 404),
    },
  });
  router.post(
    "/:requestID/reply",
    validator("param", z.object({ requestID: PermissionID.zod })),
    validator("json", z.object({ reply: Permission.Reply.zod, message: z.string().optional() })),
    async (req, res, next) => {
      try {
        await jsonRequest("PermissionRoutes.reply", req, res, function* () {
          const params = req.valid.param;
          const json = req.valid.json;
          const svc = yield* Permission.Service;
          yield* svc.reply({
            requestID: params.requestID,
            reply: json.reply,
            message: json.message,
          });
          return true;
        });
      } catch (err) {
        next(err);
      }
    },
  );

  describe("get", "/", {
    summary: "List pending permissions",
    description: "Get all pending permission requests across all sessions.",
    operationId: "permission.list",
    responses: {
      200: {
        description: "List of pending permissions",
        content: {
          "application/json": {
            schema: Permission.Request.zod.array(),
          },
        },
      },
    },
  });
  router.get("/", async (req, res, next) => {
    try {
      await jsonRequest("PermissionRoutes.list", req, res, function* () {
        const svc = yield* Permission.Service;
        return yield* svc.list();
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
