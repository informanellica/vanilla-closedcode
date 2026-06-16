/** @file Express route group for the instance /permission endpoints (reply to and list pending permission requests). */
// Express route group for the instance /permission endpoints.
import express from "express";
import { Effect } from "effect";
import z from "zod";
import { Permission } from "#permission/index.js";
import { PermissionID } from "#permission/schema.js";
import { AppRuntime } from "#effect/app-runtime.js";
import { registerOperation } from "../../express/openapi.js";
import { validator } from "../../express/validate.js";
import { errors } from "../../express/errors.js";

// Group-relative mount of this router.
const BASE = "/permission";

// OTel attribute key normalisation: `fooID` -> `foo.id`; other params are namespaced under `closedcode.`.
/**
 * Normalises an Express route param name into an OTel attribute key: `fooID` becomes `foo.id`; any other
 * param is namespaced under `closedcode.`.
 * @param {string} key - The route param name.
 * @returns {string} The normalised attribute key.
 */
function paramToAttributeKey(key) {
  const m = key.match(/^(.+)ID$/);
  if (m) return `${m[1].toLowerCase()}.id`;
  return `closedcode.${key}`;
}

// OTel span attributes for an Express request; mirrors trace.js requestAttributes.
/**
 * Builds OTel span attributes from an Express request: HTTP method, path, and every matched route param.
 * @param {Object} req - The Express request object.
 * @returns {Object} A flat record of span attribute keys to values.
 */
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
/**
 * Runs an Effect inside a named span carrying the request attributes.
 * @param {string} name - The span name.
 * @param {Object} req - The Express request object.
 * @param {Effect} effect - The Effect to run inside the span.
 * @returns {Promise<*>} A promise resolving to the Effect's result.
 */
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
/**
 * Runs an Effect generator inside a request span and JSON-encodes the resolved value onto the response.
 * @param {string} name - The span name.
 * @param {Object} req - The Express request object.
 * @param {Object} res - The Express response object.
 * @param {Function} gen - The generator function passed to Effect.gen.
 * @returns {Promise<void>} Resolves once the response JSON has been written.
 */
async function jsonRequest(name, req, res, gen) {
  res.json(await runRequest(name, req, Effect.gen(gen)));
}

/**
 * Builds the Express router for the /permission route group (reply to a permission request, list pending requests).
 * @param {Object} registry - The OpenAPI registry used to register route metadata (may be falsy to skip).
 * @returns {Object} The configured Express Router for this group.
 */
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
