/** @file Express route group for the instance /sync endpoints (start, replay, history). */
import express from "express";
import z from "zod";
import { SyncEvent } from "#sync/index.js";
import { Database } from "#storage/db.js";
import { Op } from "#storage/sequelize.js";
import * as Log from "core/util/log";
import { Workspace } from "#control-plane/workspace.js";
import { AppRuntime } from "#effect/app-runtime.js";
import { Instance } from "#project/instance.js";
import { registerOperation } from "../../express/openapi.js";
import { validator } from "../../express/validate.js";
import { errors } from "../../express/errors.js";

// Zod schema for a single sync event accepted by the /replay endpoint.
const ReplayEvent = z.object({
  id: z.string(),
  aggregateID: z.string(),
  seq: z.number().int().min(0),
  type: z.string(),
  data: z.record(z.string(), z.unknown())
});

const log = Log.create({
  service: "server.sync"
});

/**
 * Builds the Express router for the instance /sync endpoints: start workspace syncing,
 * replay a full sync event history, and list sync events since known sequence IDs.
 * @param {Object} registry - OpenAPI operation registry; route metadata is registered against it when present.
 * @returns {Object} Configured Express Router.
 */
export function SyncRoutes(registry) {
  const router = express.Router();

  // Register a route's openapi metadata against the GROUP-RELATIVE mount ("/sync").
  const describe = (method, path, meta) => registry && registerOperation(registry, method, "/sync" + path, meta);

  describe("post", "/start", {
    summary: "Start workspace sync",
    description: "Start sync loops for workspaces in the current project that have active sessions.",
    operationId: "sync.start",
    responses: {
      200: {
        description: "Workspace sync started",
        content: {
          "application/json": {
            schema: z.boolean()
          }
        }
      }
    }
  });
  router.post("/start", async (_req, res, next) => {
    try {
      void AppRuntime.runPromise(Workspace.Service.use(workspace => workspace.startWorkspaceSyncing(Instance.project.id)));
      res.json(true);
    } catch (err) {
      next(err);
    }
  });

  describe("post", "/replay", {
    summary: "Replay sync events",
    description: "Validate and replay a complete sync event history.",
    operationId: "sync.replay",
    responses: {
      200: {
        description: "Replayed sync events",
        content: {
          "application/json": {
            schema: z.object({
              sessionID: z.string()
            })
          }
        }
      },
      ...errors(400)
    }
  });
  router.post("/replay", validator("json", z.object({
    directory: z.string(),
    events: z.array(ReplayEvent).min(1)
  })), async (req, res, next) => {
    try {
      const body = req.valid.json;
      const events = body.events;
      const source = events[0].aggregateID;
      log.info("sync replay requested", {
        sessionID: source,
        events: events.length,
        first: events[0]?.seq,
        last: events.at(-1)?.seq,
        directory: body.directory
      });
      await AppRuntime.runPromise(SyncEvent.use.replayAll(events));
      log.info("sync replay complete", {
        sessionID: source,
        events: events.length,
        first: events[0]?.seq,
        last: events.at(-1)?.seq
      });
      res.json({
        sessionID: source
      });
    } catch (err) {
      next(err);
    }
  });

  describe("post", "/history", {
    summary: "List sync events",
    description: "List sync events for all aggregates. Keys are aggregate IDs the client already knows about, values are the last known sequence ID. Events with seq > value are returned for those aggregates. Aggregates not listed in the input get their full history.",
    operationId: "sync.history.list",
    responses: {
      200: {
        description: "Sync events",
        content: {
          "application/json": {
            schema: z.array(z.object({
              id: z.string(),
              aggregate_id: z.string(),
              seq: z.number(),
              type: z.string(),
              data: z.record(z.string(), z.unknown())
            }))
          }
        }
      },
      ...errors(400)
    }
  });
  router.post("/history", validator("json", z.record(z.string(), z.number().int().min(0))), async (req, res, next) => {
    try {
      const body = req.valid.json;
      const exclude = Object.entries(body);
      const where = exclude.length > 0 ? {
        [Op.not]: {
          [Op.or]: exclude.map(([id, seq]) => ({ aggregate_id: id, seq: { [Op.lte]: seq } }))
        }
      } : undefined;
      const rows = await Database.useAsync(async h => {
        const found = await h.models.Event.findAll({
          where,
          order: [["seq", "ASC"]],
          transaction: h.tx
        });
        return found.map(r => r.get({ plain: true }));
      });
      res.json(rows);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
