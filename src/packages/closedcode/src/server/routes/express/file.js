// Express route group for the instance file/find endpoints.
import express from "express";
import { Effect } from "effect";
import { File } from "@/file/index.js";
import { Ripgrep } from "@/file/ripgrep.js";
import { LSP } from "@/lsp/lsp.js";
import { Instance } from "@/project/instance.js";
import z from "zod";
import { AppRuntime } from "@/effect/app-runtime.js";
import { paramToAttributeKey } from "../instance/trace.js";
import { registerOperation } from "../../express/openapi.js";
import { validator } from "../../express/validate.js";

// Span attributes for an Express request: method, path, and every matched route
// param. Mirrors requestAttributes(c) from routes/instance/trace.js.
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

// Run an Effect generator inside an OTel span built from the request, then res.json() the result.
async function jsonRequest(name, req, res, effect) {
  const result = await AppRuntime.runPromise(
    Effect.gen(() => effect()).pipe(Effect.withSpan(name, { attributes: requestAttributes(req) })),
  );
  res.json(result);
}

export function FileRoutes(registry) {
  const router = express.Router();

  // Registers a route's openapi metadata against the GROUP-RELATIVE mount (no path prefix for this group).
  const describe = (method, path, meta) => registry && registerOperation(registry, method, path, meta);

  describe("get", "/find", {
    summary: "Find text",
    description: "Search for text patterns across files in the project using ripgrep.",
    operationId: "find.text",
    responses: {
      200: {
        description: "Matches",
        content: {
          "application/json": {
            schema: Ripgrep.SearchMatch.zod.array(),
          },
        },
      },
    },
  });
  router.get("/find", validator("query", z.object({
    pattern: z.string(),
  })), async (req, res, next) => {
    try {
      await jsonRequest("FileRoutes.findText", req, res, function* () {
        const pattern = req.valid.query.pattern;
        const svc = yield* Ripgrep.Service;
        const result = yield* svc.search({
          cwd: Instance.directory,
          pattern,
          limit: 10,
        });
        return result.items;
      });
    } catch (err) {
      next(err);
    }
  });

  describe("get", "/find/file", {
    summary: "Find files",
    description: "Search for files or directories by name or pattern in the project directory.",
    operationId: "find.files",
    responses: {
      200: {
        description: "File paths",
        content: {
          "application/json": {
            schema: z.string().array(),
          },
        },
      },
    },
  });
  router.get("/find/file", validator("query", z.object({
    query: z.string(),
    dirs: z.enum(["true", "false"]).optional(),
    type: z.enum(["file", "directory"]).optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
  })), async (req, res, next) => {
    try {
      await jsonRequest("FileRoutes.findFile", req, res, function* () {
        const query = req.valid.query;
        const svc = yield* File.Service;
        return yield* svc.search({
          query: query.query,
          limit: query.limit ?? 10,
          dirs: query.dirs !== "false",
          type: query.type,
        });
      });
    } catch (err) {
      next(err);
    }
  });

  describe("get", "/find/symbol", {
    summary: "Find symbols",
    description: "Search for workspace symbols like functions, classes, and variables using LSP.",
    operationId: "find.symbols",
    responses: {
      200: {
        description: "Symbols",
        content: {
          "application/json": {
            schema: LSP.Symbol.zod.array(),
          },
        },
      },
    },
  });
  router.get("/find/symbol", validator("query", z.object({
    query: z.string(),
  })), async (_req, res, next) => {
    try {
      res.json([]);
    } catch (err) {
      next(err);
    }
  });

  describe("get", "/file", {
    summary: "List files",
    description: "List files and directories in a specified path.",
    operationId: "file.list",
    responses: {
      200: {
        description: "Files and directories",
        content: {
          "application/json": {
            schema: File.Node.zod.array(),
          },
        },
      },
    },
  });
  router.get("/file", validator("query", z.object({
    path: z.string(),
  })), async (req, res, next) => {
    try {
      await jsonRequest("FileRoutes.list", req, res, function* () {
        const svc = yield* File.Service;
        return yield* svc.list(req.valid.query.path);
      });
    } catch (err) {
      next(err);
    }
  });

  describe("get", "/file/content", {
    summary: "Read file",
    description: "Read the content of a specified file.",
    operationId: "file.read",
    responses: {
      200: {
        description: "File content",
        content: {
          "application/json": {
            schema: File.Content.zod,
          },
        },
      },
    },
  });
  router.get("/file/content", validator("query", z.object({
    path: z.string(),
  })), async (req, res, next) => {
    try {
      await jsonRequest("FileRoutes.read", req, res, function* () {
        const svc = yield* File.Service;
        return yield* svc.read(req.valid.query.path);
      });
    } catch (err) {
      next(err);
    }
  });

  describe("get", "/file/status", {
    summary: "Get file status",
    description: "Get the git status of all files in the project.",
    operationId: "file.status",
    responses: {
      200: {
        description: "File status",
        content: {
          "application/json": {
            schema: File.Info.zod.array(),
          },
        },
      },
    },
  });
  router.get("/file/status", async (req, res, next) => {
    try {
      await jsonRequest("FileRoutes.status", req, res, function* () {
        const svc = yield* File.Service;
        return yield* svc.status();
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
