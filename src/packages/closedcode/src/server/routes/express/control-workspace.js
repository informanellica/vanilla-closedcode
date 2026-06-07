// Express route group for the /experimental/workspace control-plane endpoints (6 ops).
import express from "express";
import { Effect } from "effect";
import z from "zod";
import { listAdapters } from "@/control-plane/adapters/index.js";
import { Workspace } from "@/control-plane/workspace.js";
import { AppRuntime } from "@/effect/app-runtime.js";
import { WorkspaceAdapterEntry } from "@/control-plane/types.js";
import { zodObject } from "@/util/effect-zod.js";
import { Instance } from "@/project/instance.js";
import { errorData } from "@/util/error.js";
import * as Log from "core/util/log";
import { registerOperation } from "../../express/openapi.js";
import { validator } from "../../express/validate.js";
import { errors } from "../../express/errors.js";

const log = Log.create({ service: "server.workspace" });

// Group base path: this router is mounted at /experimental/workspace (see server.js).
const BASE = "/experimental/workspace";

export function WorkspaceRoutes(registry) {
  const router = express.Router();

  const describe = (method, path, meta) => registry && registerOperation(registry, method, BASE + path, meta);

  describe("get", "/adapter", {
    summary: "List workspace adapters",
    description: "List all available workspace adapters for the current project.",
    operationId: "experimental.workspace.adapter.list",
    responses: {
      200: {
        description: "Workspace adapters",
        content: {
          "application/json": {
            schema: z.array(zodObject(WorkspaceAdapterEntry)),
          },
        },
      },
    },
  });
  router.get("/adapter", async (_req, res, next) => {
    try {
      res.json(await listAdapters(Instance.project.id));
    } catch (err) {
      next(err);
    }
  });

  describe("post", "/", {
    summary: "Create workspace",
    description: "Create a workspace for the current project.",
    operationId: "experimental.workspace.create",
    responses: {
      200: {
        description: "Workspace created",
        content: {
          "application/json": {
            schema: Workspace.Info.zod,
          },
        },
      },
      ...errors(400),
    },
  });
  router.post(
    "/",
    validator("json", Workspace.CreateInput.zodObject.omit({ projectID: true })),
    async (req, res, next) => {
      try {
        const body = req.valid.json;
        const workspace = await AppRuntime.runPromise(
          Workspace.Service.use((svc) =>
            svc.create({
              projectID: Instance.project.id,
              ...body,
            }),
          ),
        );
        res.json(workspace);
      } catch (err) {
        next(err);
      }
    },
  );

  describe("get", "/", {
    summary: "List workspaces",
    description: "List all workspaces.",
    operationId: "experimental.workspace.list",
    responses: {
      200: {
        description: "Workspaces",
        content: {
          "application/json": {
            schema: z.array(Workspace.Info.zod),
          },
        },
      },
    },
  });
  router.get("/", async (_req, res, next) => {
    try {
      res.json(await AppRuntime.runPromise(Workspace.Service.use((svc) => svc.list(Instance.project))));
    } catch (err) {
      next(err);
    }
  });

  describe("get", "/status", {
    summary: "Workspace status",
    description: "Get connection status for workspaces in the current project.",
    operationId: "experimental.workspace.status",
    responses: {
      200: {
        description: "Workspace status",
        content: {
          "application/json": {
            schema: z.array(zodObject(Workspace.ConnectionStatus)),
          },
        },
      },
    },
  });
  router.get("/status", async (_req, res, next) => {
    try {
      const result = await AppRuntime.runPromise(
        Workspace.Service.use((svc) => Effect.all([svc.list(Instance.project), svc.status()])),
      );
      const ids = new Set(result[0].map((item) => item.id));
      res.json(result[1].filter((item) => ids.has(item.workspaceID)));
    } catch (err) {
      next(err);
    }
  });

  describe("delete", "/:id", {
    summary: "Remove workspace",
    description: "Remove an existing workspace.",
    operationId: "experimental.workspace.remove",
    responses: {
      200: {
        description: "Workspace removed",
        content: {
          "application/json": {
            schema: Workspace.Info.zod.optional(),
          },
        },
      },
      ...errors(400),
    },
  });
  router.delete(
    "/:id",
    validator("param", z.object({ id: zodObject(Workspace.Info).shape.id })),
    async (req, res, next) => {
      try {
        const { id } = req.valid.param;
        res.json(await AppRuntime.runPromise(Workspace.Service.use((svc) => svc.remove(id))));
      } catch (err) {
        next(err);
      }
    },
  );

  describe("post", "/:id/session-restore", {
    summary: "Restore session into workspace",
    description: "Replay a session's sync events into the target workspace in batches.",
    operationId: "experimental.workspace.sessionRestore",
    responses: {
      200: {
        description: "Session replay started",
        content: {
          "application/json": {
            schema: z.object({ total: z.number().int().min(0) }),
          },
        },
      },
      ...errors(400),
    },
  });
  router.post(
    "/:id/session-restore",
    validator("param", z.object({ id: zodObject(Workspace.Info).shape.id })),
    validator("json", Workspace.SessionRestoreInput.zodObject.omit({ workspaceID: true })),
    async (req, res, next) => {
      const { id } = req.valid.param;
      const body = req.valid.json;
      log.info("session restore route requested", {
        workspaceID: id,
        sessionID: body.sessionID,
        directory: Instance.directory,
      });
      try {
        const result = await AppRuntime.runPromise(
          Workspace.Service.use((svc) =>
            svc.sessionRestore({
              workspaceID: id,
              ...body,
            }),
          ),
        );
        log.info("session restore route complete", {
          workspaceID: id,
          sessionID: body.sessionID,
          total: result.total,
        });
        res.json(result);
      } catch (err) {
        log.error("session restore route failed", {
          workspaceID: id,
          sessionID: body.sessionID,
          error: errorData(err),
        });
        next(err);
      }
    },
  );

  return router;
}
