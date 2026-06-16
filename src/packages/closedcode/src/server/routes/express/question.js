/** @file Express route group for the instance /question endpoints (list pending questions, reply, reject). */
// Express route group for the instance /question endpoints (list, reply, reject).
import express from "express";
import { Effect } from "effect";
import { AppRuntime } from "#effect/app-runtime.js";
import { QuestionID } from "#question/schema.js";
import { Question } from "#question/index.js";
import z from "zod";
import { registerOperation } from "../../express/openapi.js";
import { validator } from "../../express/validate.js";
import { errors } from "../../express/errors.js";

const Reply = z.object({
  answers: Question.Answer.zod.array().describe("User answers in order of questions (each answer is an array of selected labels)"),
});

// OTel attribute key normalisation: `fooID` -> `foo.id`; any other param namespaced under `closedcode.`.
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

// Runs an Effect generator inside a named span built from the request attributes, then serialises the result as JSON.
/**
 * Runs an Effect generator inside a named span built from the request attributes, then serialises the result as JSON.
 * @param {string} name - The span name.
 * @param {Object} req - The Express request object.
 * @param {Object} res - The Express response object.
 * @param {Function} gen - The generator function passed to Effect.gen.
 * @returns {Promise<void>} Resolves once the response JSON has been written.
 */
async function jsonRequest(name, req, res, gen) {
  const result = await AppRuntime.runPromise(
    Effect.gen(gen).pipe(Effect.withSpan(name, { attributes: requestAttributes(req) })),
  );
  res.json(result);
}

/**
 * Builds the Express router for the /question route group (list pending questions, reply with answers, reject).
 * @param {Object} registry - The OpenAPI registry used to register route metadata (may be falsy to skip).
 * @returns {Object} The configured Express Router for this group.
 */
export function QuestionRoutes(registry) {
  const router = express.Router();

  // Registers a route's openapi metadata against the GROUP-RELATIVE mount ("/question").
  const describe = (method, path, meta) => registry && registerOperation(registry, method, "/question" + path, meta);

  describe("get", "/", {
    summary: "List pending questions",
    description: "Get all pending question requests across all sessions.",
    operationId: "question.list",
    responses: {
      200: {
        description: "List of pending questions",
        content: {
          "application/json": {
            schema: Question.Request.zod.array(),
          },
        },
      },
    },
  });
  router.get("/", async (req, res, next) => {
    try {
      await jsonRequest("QuestionRoutes.list", req, res, function* () {
        const svc = yield* Question.Service;
        return yield* svc.list();
      });
    } catch (err) {
      next(err);
    }
  });

  describe("post", "/:requestID/reply", {
    summary: "Reply to question request",
    description: "Provide answers to a question request from the AI assistant.",
    operationId: "question.reply",
    responses: {
      200: {
        description: "Question answered successfully",
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
    validator("param", z.object({ requestID: QuestionID.zod })),
    validator("json", Reply),
    async (req, res, next) => {
      try {
        await jsonRequest("QuestionRoutes.reply", req, res, function* () {
          const params = req.valid.param;
          const json = req.valid.json;
          const svc = yield* Question.Service;
          yield* svc.reply({
            requestID: params.requestID,
            answers: json.answers,
          });
          return true;
        });
      } catch (err) {
        next(err);
      }
    },
  );

  describe("post", "/:requestID/reject", {
    summary: "Reject question request",
    description: "Reject a question request from the AI assistant.",
    operationId: "question.reject",
    responses: {
      200: {
        description: "Question rejected successfully",
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
    "/:requestID/reject",
    validator("param", z.object({ requestID: QuestionID.zod })),
    async (req, res, next) => {
      try {
        await jsonRequest("QuestionRoutes.reject", req, res, function* () {
          const params = req.valid.param;
          const svc = yield* Question.Service;
          yield* svc.reject(params.requestID);
          return true;
        });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
