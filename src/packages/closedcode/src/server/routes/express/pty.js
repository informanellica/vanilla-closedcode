// Express route group for the instance /pty endpoints (PTY sessions and WebSocket connection).
import express from "express";
import { Effect, Schema } from "effect";
import z from "zod";
import { AppRuntime } from "@/effect/app-runtime.js";
import { Pty } from "@/pty/index.js";
import { PtyID } from "@/pty/schema.js";
import { Shell } from "@/shell/shell.js";
import { NotFoundError } from "@/storage/storage.js";
import { paramToAttributeKey } from "../instance/trace.js";
import { registerOperation } from "../../express/openapi.js";
import { validator } from "../../express/validate.js";
import { errors } from "../../express/errors.js";

const ShellItem = z.object({
  path: z.string(),
  name: z.string(),
  acceptable: z.boolean(),
});

const decodePtyID = Schema.decodeUnknownSync(PtyID);

// OTel span attributes for an Express request: method, path, and every matched route param.
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

// Runs an Effect generator inside an OTel span built from the request.
function runRequest(name, req, effect) {
  return AppRuntime.runPromise(effect.pipe(Effect.withSpan(name, { attributes: requestAttributes(req) })));
}

// Runs an Effect generator inside an OTel span, then res.json() the result.
async function jsonRequest(name, req, res, effect) {
  const result = await runRequest(name, req, Effect.gen(() => effect()));
  res.json(result);
}

export function PtyRoutes(registry, upgradeWebSocket) {
  const router = express.Router();

  // Registers a route's openapi metadata against the GROUP-RELATIVE mount ("/pty").
  const describe = (method, path, meta) => registry && registerOperation(registry, method, "/pty" + path, meta);

  describe("get", "/shells", {
    summary: "List available shells",
    description: "Get a list of available shells on the system.",
    operationId: "pty.shells",
    responses: {
      200: {
        description: "List of shells",
        content: {
          "application/json": {
            schema: z.array(ShellItem),
          },
        },
      },
    },
  });
  router.get("/shells", async (_req, res, next) => {
    try {
      res.json(await Shell.list());
    } catch (err) {
      next(err);
    }
  });

  describe("get", "/", {
    summary: "List PTY sessions",
    description: "Get a list of all active pseudo-terminal (PTY) sessions managed by ClosedCode.",
    operationId: "pty.list",
    responses: {
      200: {
        description: "List of sessions",
        content: {
          "application/json": {
            schema: Pty.Info.zod.array(),
          },
        },
      },
    },
  });
  router.get("/", async (req, res, next) => {
    try {
      await jsonRequest("PtyRoutes.list", req, res, function* () {
        const pty = yield* Pty.Service;
        return yield* pty.list();
      });
    } catch (err) {
      next(err);
    }
  });

  describe("post", "/", {
    summary: "Create PTY session",
    description: "Create a new pseudo-terminal (PTY) session for running shell commands and processes.",
    operationId: "pty.create",
    responses: {
      200: {
        description: "Created session",
        content: {
          "application/json": {
            schema: Pty.Info.zod,
          },
        },
      },
      ...errors(400),
    },
  });
  router.post("/", validator("json", Pty.CreateInput.zod), async (req, res, next) => {
    try {
      await jsonRequest("PtyRoutes.create", req, res, function* () {
        const pty = yield* Pty.Service;
        return yield* pty.create(req.valid.json);
      });
    } catch (err) {
      next(err);
    }
  });

  describe("get", "/:ptyID", {
    summary: "Get PTY session",
    description: "Retrieve detailed information about a specific pseudo-terminal (PTY) session.",
    operationId: "pty.get",
    responses: {
      200: {
        description: "Session info",
        content: {
          "application/json": {
            schema: Pty.Info.zod,
          },
        },
      },
      ...errors(404),
    },
  });
  router.get("/:ptyID", validator("param", z.object({
    ptyID: PtyID.zod,
  })), async (req, res, next) => {
    try {
      const info = await runRequest("PtyRoutes.get", req, Effect.gen(function* () {
        const pty = yield* Pty.Service;
        return yield* pty.get(req.valid.param.ptyID);
      }));
      if (!info) {
        throw new NotFoundError({
          message: "Session not found",
        });
      }
      res.json(info);
    } catch (err) {
      next(err);
    }
  });

  describe("put", "/:ptyID", {
    summary: "Update PTY session",
    description: "Update properties of an existing pseudo-terminal (PTY) session.",
    operationId: "pty.update",
    responses: {
      200: {
        description: "Updated session",
        content: {
          "application/json": {
            schema: Pty.Info.zod,
          },
        },
      },
      ...errors(400),
    },
  });
  router.put("/:ptyID", validator("param", z.object({
    ptyID: PtyID.zod,
  })), validator("json", Pty.UpdateInput.zod), async (req, res, next) => {
    try {
      await jsonRequest("PtyRoutes.update", req, res, function* () {
        const pty = yield* Pty.Service;
        return yield* pty.update(req.valid.param.ptyID, req.valid.json);
      });
    } catch (err) {
      next(err);
    }
  });

  describe("delete", "/:ptyID", {
    summary: "Remove PTY session",
    description: "Remove and terminate a specific pseudo-terminal (PTY) session.",
    operationId: "pty.remove",
    responses: {
      200: {
        description: "Session removed",
        content: {
          "application/json": {
            schema: z.boolean(),
          },
        },
      },
      ...errors(404),
    },
  });
  router.delete("/:ptyID", validator("param", z.object({
    ptyID: PtyID.zod,
  })), async (req, res, next) => {
    try {
      await jsonRequest("PtyRoutes.remove", req, res, function* () {
        const pty = yield* Pty.Service;
        yield* pty.remove(req.valid.param.ptyID);
        return true;
      });
    } catch (err) {
      next(err);
    }
  });

  describe("get", "/:ptyID/connect", {
    summary: "Connect to PTY session",
    description: "Establish a WebSocket connection to interact with a pseudo-terminal (PTY) session in real-time.",
    operationId: "pty.connect",
    responses: {
      200: {
        description: "Connected session",
        content: {
          "application/json": {
            schema: z.boolean(),
          },
        },
      },
      ...errors(404),
    },
  });
  // WebSocket route. upgradeWebSocket() comes from adapter.express.js and returns
  // Express middleware that registers the handler factory for this path. The actual
  // upgrade is performed by the adapter's injectWebSocket() HTTP "upgrade" listener.
  //
  // Handler factory shape (from adapter.express.js):
  //   - Factory invoked with `{ req }` (a plain Node IncomingMessage); ptyID and
  //     cursor are parsed from `req.url` since route params are not populated for
  //     upgrade requests.
  //   - onOpen(ws): `ws` is the raw `ws` WebSocket (no wrapper).
  //   - onMessage({ data }, ws): `data` is already a string.
  //   - onClose(ws) / onError(err, ws).
  router.get("/:ptyID/connect", validator("param", z.object({
    ptyID: PtyID.zod,
  })), upgradeWebSocket(async ({ req }) => {
    // Parse ptyID and cursor from the upgrade request URL. The adapter matches
    // on pathname only and does not populate Express route params, so we cannot
    // rely on req.valid.param here.
    const url = new URL(req.url, "http://localhost");
    const segments = url.pathname.split("/").filter(Boolean);
    const connectIndex = segments.lastIndexOf("connect");
    const rawPtyID = connectIndex > 0 ? segments[connectIndex - 1] : segments[segments.length - 1];
    const id = decodePtyID(decodeURIComponent(rawPtyID));
    const cursor = (() => {
      const value = url.searchParams.get("cursor");
      if (!value) return;
      const parsed = Number(value);
      if (!Number.isSafeInteger(parsed) || parsed < -1) return;
      return parsed;
    })();
    let handler;
    if (!(await AppRuntime.runPromise(Effect.gen(function* () {
      const pty = yield* Pty.Service;
      return yield* pty.get(id);
    }).pipe(Effect.withSpan("PtyRoutes.connect", {
      attributes: { "http.method": "GET", "http.path": url.pathname, "pty.id": rawPtyID },
    }))))) {
      throw new Error("Session not found");
    }
    const isSocket = (value) => {
      if (!value || typeof value !== "object") return false;
      if (!("readyState" in value)) return false;
      if (!("send" in value) || typeof value.send !== "function") return false;
      if (!("close" in value) || typeof value.close !== "function") return false;
      return typeof value.readyState === "number";
    };
    const pending = [];
    let ready = false;
    return {
      // Adapter calls onOpen(ws); the `ws` package WebSocket IS the raw socket
      // (no ws.raw wrapper), and it satisfies the isSocket() shape check.
      async onOpen(ws) {
        const socket = ws;
        if (!isSocket(socket)) {
          ws.close();
          return;
        }
        handler = await AppRuntime.runPromise(Effect.gen(function* () {
          const pty = yield* Pty.Service;
          return yield* pty.connect(id, socket, cursor);
        }).pipe(Effect.withSpan("PtyRoutes.connect.open")));
        ready = true;
        for (const msg of pending) handler?.onMessage(msg);
        pending.length = 0;
      },
      // Adapter calls onMessage({ data }, ws) where data is already a string.
      onMessage(event) {
        if (typeof event.data !== "string") return;
        if (!ready) {
          pending.push(event.data);
          return;
        }
        handler?.onMessage(event.data);
      },
      onClose() {
        handler?.onClose();
      },
      onError() {
        handler?.onClose();
      },
    };
  }));

  return router;
}
