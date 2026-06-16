/** @file HTTP API handlers for the "sync" group: start workspace event syncing, replay incoming events, and return event history. */
import { Workspace } from "#control-plane/workspace.js";
import * as InstanceState from "#effect/instance-state.js";
import { Database } from "#storage/db.js";
import { Op } from "#storage/sequelize.js";
import { SyncEvent } from "#sync/index.js";
import { Effect, Scope } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { InstanceHttpApi } from "../api.js";
import * as Log from "core/util/log";
const log = Log.create({
  service: "server.sync"
});
/**
 * Builds the "sync" HTTP API handler group: start/replay/history endpoints for cross-instance event sync.
 * @type {Object}
 */
export const syncHandlers = HttpApiBuilder.group(InstanceHttpApi, "sync", handlers => Effect.gen(function* () {
  const workspace = yield* Workspace.Service;
  const scope = yield* Scope.Scope;
  const sync = yield* SyncEvent.Service;
  /**
   * Starts background syncing for the current instance's project workspaces (forked into the request scope).
   * @returns {Effect} Effect resolving to true once the sync fiber is started.
   */
  const start = Effect.fn("SyncHttpApi.start")(function* () {
    yield* workspace.startWorkspaceSyncing((yield* InstanceState.context).project.id).pipe(Effect.ignore, Effect.forkIn(scope));
    return true;
  });
  /**
   * Replays a batch of incoming sync events into the local store, logging start/completion.
   * @param {Object} ctx - Request context whose payload has events (array of {id, aggregateID, seq, type, data}) and directory.
   * @returns {Effect} Effect resolving to {sessionID} of the replayed aggregate.
   */
  const replay = Effect.fn("SyncHttpApi.replay")(function* (ctx) {
    const events = ctx.payload.events.map(event => ({
      id: event.id,
      aggregateID: event.aggregateID,
      seq: event.seq,
      type: event.type,
      data: {
        ...event.data
      }
    }));
    const source = events[0].aggregateID;
    log.info("sync replay requested", {
      sessionID: source,
      events: events.length,
      first: events[0]?.seq,
      last: events.at(-1)?.seq,
      directory: ctx.payload.directory
    });
    yield* sync.replayAll(events);
    log.info("sync replay complete", {
      sessionID: source,
      events: events.length,
      first: events[0]?.seq,
      last: events.at(-1)?.seq
    });
    return {
      sessionID: source
    };
  });
  /**
   * Returns stored events ordered by sequence, excluding events the caller already has. The payload maps each
   * aggregate id to its highest known seq; those (aggregate_id, seq <= known) rows are filtered out.
   * @param {Object} ctx - Request context whose payload is an object of aggregateID -> last known seq.
   * @returns {Effect} Effect resolving to the array of plain event records not yet seen by the caller.
   */
  const history = Effect.fn("SyncHttpApi.history")(function* (ctx) {
    const exclude = Object.entries(ctx.payload);
    const where = exclude.length > 0 ? {
      [Op.not]: {
        [Op.or]: exclude.map(([id, seq]) => ({ aggregate_id: id, seq: { [Op.lte]: seq } }))
      }
    } : undefined;
    return yield* Effect.promise(() => Database.useAsync(async h => {
      const found = await h.models.Event.findAll({
        where,
        order: [["seq", "ASC"]],
        transaction: h.tx
      });
      return found.map(r => r.get({ plain: true }));
    }));
  });
  return handlers.handle("start", start).handle("replay", replay).handle("history", history);
}));