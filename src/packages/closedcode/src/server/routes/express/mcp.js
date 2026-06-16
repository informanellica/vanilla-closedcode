/** @file Express route group for the instance /mcp endpoints (MCP server management and OAuth). */
// Express route group for the instance /mcp endpoints (MCP server management and OAuth).
import express from "express";
import { Effect } from "effect";
import z from "zod";
import { MCP } from "#mcp/index.js";
import { ConfigMCP } from "#config/mcp.js";
import { AppRuntime } from "#effect/app-runtime.js";
import { registerOperation } from "../../express/openapi.js";
import { validator } from "../../express/validate.js";
import { errors } from "../../express/errors.js";
import { paramToAttributeKey } from "../instance/trace.js";

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

// Wraps an Effect in a span carrying the request attributes and runs it through AppRuntime.
/**
 * Wraps an Effect in a span carrying the request attributes and runs it through AppRuntime.
 * @param {string} name - The span name.
 * @param {Object} req - The Express request object.
 * @param {Effect} effect - The Effect to run inside the span.
 * @returns {Promise<*>} A promise resolving to the Effect's result.
 */
function runRequest(name, req, effect) {
  return AppRuntime.runPromise(effect.pipe(Effect.withSpan(name, { attributes: requestAttributes(req) })));
}

// Runs an Effect generator through runRequest and writes the result as JSON.
/**
 * Runs an Effect generator through runRequest and writes the resolved value as JSON.
 * @param {string} name - The span name.
 * @param {Object} req - The Express request object.
 * @param {Object} res - The Express response object.
 * @param {Function} fn - A function returning an Effect generator to run.
 * @returns {Promise<void>} Resolves once the response JSON has been written.
 */
async function jsonRequest(name, req, res, fn) {
  res.json(await runRequest(name, req, Effect.gen(() => fn())));
}

const UnsupportedOAuthError = z.object({
  error: z.string(),
}).meta({
  ref: "McpUnsupportedOAuthError",
});

const unsupportedOAuthErrorResponse = {
  description: "MCP server does not support OAuth",
  content: {
    "application/json": {
      schema: UnsupportedOAuthError,
    },
  },
};

/**
 * Builds the Express router for the /mcp route group (MCP server status/add/connect/disconnect and OAuth flows).
 * @param {Object} registry - The OpenAPI registry used to register route metadata (may be falsy to skip).
 * @returns {Object} The configured Express Router for this group.
 */
export function McpRoutes(registry) {
  const router = express.Router();

  // Registers a route's openapi metadata against the GROUP-RELATIVE mount ("/mcp").
  const describe = (method, path, meta) => registry && registerOperation(registry, method, "/mcp" + path, meta);

  describe("get", "/", {
    summary: "Get MCP status",
    description: "Get the status of all Model Context Protocol (MCP) servers.",
    operationId: "mcp.status",
    responses: {
      200: {
        description: "MCP server status",
        content: {
          "application/json": {
            schema: z.record(z.string(), MCP.Status.zod),
          },
        },
      },
    },
  });
  router.get("/", async (req, res, next) => {
    try {
      await jsonRequest("McpRoutes.status", req, res, function* () {
        const mcp = yield* MCP.Service;
        return yield* mcp.status();
      });
    } catch (err) {
      next(err);
    }
  });

  describe("post", "/", {
    summary: "Add MCP server",
    description: "Dynamically add a new Model Context Protocol (MCP) server to the system.",
    operationId: "mcp.add",
    responses: {
      200: {
        description: "MCP server added successfully",
        content: {
          "application/json": {
            schema: z.record(z.string(), MCP.Status.zod),
          },
        },
      },
      ...errors(400),
    },
  });
  router.post("/", validator("json", z.object({
    name: z.string(),
    config: ConfigMCP.Info.zod,
  })), async (req, res, next) => {
    try {
      await jsonRequest("McpRoutes.add", req, res, function* () {
        const { name, config } = req.valid.json;
        const mcp = yield* MCP.Service;
        const result = yield* mcp.add(name, config);
        return result.status;
      });
    } catch (err) {
      next(err);
    }
  });

  describe("post", "/:name/auth", {
    summary: "Start MCP OAuth",
    description: "Start OAuth authentication flow for a Model Context Protocol (MCP) server.",
    operationId: "mcp.auth.start",
    responses: {
      200: {
        description: "OAuth flow started",
        content: {
          "application/json": {
            schema: z.object({
              authorizationUrl: z.string().describe("URL to open in browser for authorization"),
            }),
          },
        },
      },
      400: unsupportedOAuthErrorResponse,
      ...errors(404),
    },
  });
  router.post("/:name/auth", async (req, res, next) => {
    try {
      const name = req.params.name;
      const result = await runRequest("McpRoutes.auth.start", req, Effect.gen(function* () {
        const mcp = yield* MCP.Service;
        const supports = yield* mcp.supportsOAuth(name);
        if (!supports) return { supports };
        return {
          supports,
          auth: yield* mcp.startAuth(name),
        };
      }));
      if (!result.supports) {
        return res.status(400).json({
          error: `MCP server ${name} does not support OAuth`,
        });
      }
      res.json(result.auth);
    } catch (err) {
      next(err);
    }
  });

  describe("post", "/:name/auth/callback", {
    summary: "Complete MCP OAuth",
    description: "Complete OAuth authentication for a Model Context Protocol (MCP) server using the authorization code.",
    operationId: "mcp.auth.callback",
    responses: {
      200: {
        description: "OAuth authentication completed",
        content: {
          "application/json": {
            schema: MCP.Status.zod,
          },
        },
      },
      ...errors(400, 404),
    },
  });
  router.post("/:name/auth/callback", validator("json", z.object({
    code: z.string().describe("Authorization code from OAuth callback"),
  })), async (req, res, next) => {
    try {
      await jsonRequest("McpRoutes.auth.callback", req, res, function* () {
        const name = req.params.name;
        const { code } = req.valid.json;
        const mcp = yield* MCP.Service;
        return yield* mcp.finishAuth(name, code);
      });
    } catch (err) {
      next(err);
    }
  });

  describe("post", "/:name/auth/authenticate", {
    summary: "Authenticate MCP OAuth",
    description: "Start OAuth flow and wait for callback (opens browser)",
    operationId: "mcp.auth.authenticate",
    responses: {
      200: {
        description: "OAuth authentication completed",
        content: {
          "application/json": {
            schema: MCP.Status.zod,
          },
        },
      },
      400: unsupportedOAuthErrorResponse,
      ...errors(404),
    },
  });
  router.post("/:name/auth/authenticate", async (req, res, next) => {
    try {
      const name = req.params.name;
      const result = await runRequest("McpRoutes.auth.authenticate", req, Effect.gen(function* () {
        const mcp = yield* MCP.Service;
        const supports = yield* mcp.supportsOAuth(name);
        if (!supports) return { supports };
        return {
          supports,
          status: yield* mcp.authenticate(name),
        };
      }));
      if (!result.supports) {
        return res.status(400).json({
          error: `MCP server ${name} does not support OAuth`,
        });
      }
      res.json(result.status);
    } catch (err) {
      next(err);
    }
  });

  describe("delete", "/:name/auth", {
    summary: "Remove MCP OAuth",
    description: "Remove OAuth credentials for an MCP server",
    operationId: "mcp.auth.remove",
    responses: {
      200: {
        description: "OAuth credentials removed",
        content: {
          "application/json": {
            schema: z.object({
              success: z.literal(true),
            }),
          },
        },
      },
      ...errors(404),
    },
  });
  router.delete("/:name/auth", async (req, res, next) => {
    try {
      await jsonRequest("McpRoutes.auth.remove", req, res, function* () {
        const name = req.params.name;
        const mcp = yield* MCP.Service;
        yield* mcp.removeAuth(name);
        return { success: true };
      });
    } catch (err) {
      next(err);
    }
  });

  describe("post", "/:name/connect", {
    description: "Connect an MCP server",
    operationId: "mcp.connect",
    responses: {
      200: {
        description: "MCP server connected successfully",
        content: {
          "application/json": {
            schema: z.boolean(),
          },
        },
      },
    },
  });
  router.post("/:name/connect", validator("param", z.object({
    name: z.string(),
  })), async (req, res, next) => {
    try {
      await jsonRequest("McpRoutes.connect", req, res, function* () {
        const { name } = req.valid.param;
        const mcp = yield* MCP.Service;
        yield* mcp.connect(name);
        return true;
      });
    } catch (err) {
      next(err);
    }
  });

  describe("post", "/:name/disconnect", {
    description: "Disconnect an MCP server",
    operationId: "mcp.disconnect",
    responses: {
      200: {
        description: "MCP server disconnected successfully",
        content: {
          "application/json": {
            schema: z.boolean(),
          },
        },
      },
    },
  });
  router.post("/:name/disconnect", validator("param", z.object({
    name: z.string(),
  })), async (req, res, next) => {
    try {
      await jsonRequest("McpRoutes.disconnect", req, res, function* () {
        const { name } = req.valid.param;
        const mcp = yield* MCP.Service;
        yield* mcp.disconnect(name);
        return true;
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
