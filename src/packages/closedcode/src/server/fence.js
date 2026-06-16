/**
 * @file Sync fence: tracks per-aggregate event sequence numbers so a remote
 * proxy can advertise (via the x-closedcode-sync header) which aggregates
 * advanced during a request, and block downstream reads until the local
 * workspace has caught up to that state.
 */
import { Database } from "#storage/db.js";
import { Op } from "#storage/sequelize.js";
import { Workspace } from "#control-plane/workspace.js";
import * as Log from "core/util/log";
import { AppRuntime } from "#effect/app-runtime.js";
import { Effect } from "effect";
const HEADER = "x-closedcode-sync";
const log = Log.create({
  service: "fence"
});
/**
 * Load the current event sequence number for each aggregate.
 * @param {Array<string>} ids - Optional aggregate IDs to restrict the query to; loads all when omitted/empty.
 * @returns {Promise<Object>} A map of aggregate_id to its current sequence number.
 */
export async function load(ids) {
  const rows = await Database.useAsync(async h => {
    const found = await h.models.EventSequence.findAll({
      where: ids?.length ? { aggregate_id: { [Op.in]: ids } } : undefined,
      transaction: h.tx
    });
    return found.map(r => r.get({ plain: true }));
  });
  return Object.fromEntries(rows.map(row => [row.aggregate_id, row.seq]));
}
/**
 * Compute the aggregates whose sequence number changed between two sequence maps.
 * @param {Object} prev - Sequence map (aggregate_id to seq) captured before the change.
 * @param {Object} next - Sequence map (aggregate_id to seq) captured after the change.
 * @returns {Object} A map of aggregate_id to its new seq (-1 if absent in next), including only changed entries.
 */
export function diff(prev, next) {
  const ids = new Set([...Object.keys(prev), ...Object.keys(next)]);
  return Object.fromEntries([...ids].map(id => [id, next[id] ?? -1]).filter(([id, seq]) => {
    return (prev[id] ?? -1) !== seq;
  }));
}
/**
 * Parse the sync fence header into a sequence map.
 * Returns undefined when the header is missing or invalid; otherwise keeps only
 * entries with a string key and an integer sequence value.
 * @param {Object} headers - A Headers-like object exposing get(name).
 * @returns {Object|undefined} A map of aggregate_id to integer seq, or undefined if unparseable.
 */
export function parse(headers) {
  const raw = headers.get(HEADER);
  if (!raw) return;
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return;
  }
  if (!data || typeof data !== "object") return;
  return Object.fromEntries(Object.entries(data).filter(([id, seq]) => {
    return typeof id === "string" && Number.isInteger(seq);
  }));
}
/**
 * Build an Effect that blocks until the given workspace has synced to the target state.
 * @param {string} workspaceID - The workspace to wait on.
 * @param {Object} state - The target sequence map (aggregate_id to seq) to wait for.
 * @param {*} signal - Optional AbortSignal to cancel the wait.
 * @returns {Effect} An Effect that resolves once the workspace is fully synced.
 */
export function waitEffect(workspaceID, state, signal) {
  return Effect.gen(function* () {
    log.info("waiting for state", {
      workspaceID,
      state
    });
    yield* Workspace.Service.use(workspace => workspace.waitForSync(workspaceID, state, signal));
    log.info("state fully synced", {
      workspaceID,
      state
    });
  });
}
/**
 * Run waitEffect on the app runtime, blocking until the workspace reaches the target state.
 * @param {string} workspaceID - The workspace to wait on.
 * @param {Object} state - The target sequence map (aggregate_id to seq) to wait for.
 * @param {*} signal - Optional AbortSignal to cancel the wait.
 * @returns {Promise<void>} Resolves once the workspace is fully synced.
 */
export async function wait(workspaceID, state, signal) {
  await AppRuntime.runPromise(waitEffect(workspaceID, state, signal));
}
/**
 * Hono-style middleware that, for mutating requests, snapshots event sequences
 * before and after the handler runs and, if any aggregate advanced, attaches the
 * diff to the response via the x-closedcode-sync header so a proxy can fence reads.
 * @param {Object} c - The request context exposing c.req (method) and c.res (headers).
 * @param {Function} next - Invokes the downstream handler chain.
 * @returns {Promise<*>} The result of next() for non-mutating methods, otherwise resolves after the diff is recorded.
 */
export const FenceMiddleware = async (c, next) => {
  if (c.req.method === "GET" || c.req.method === "HEAD" || c.req.method === "OPTIONS") return next();
  const prev = await load();
  await next();
  const current = diff(prev, await load());
  if (Object.keys(current).length > 0) {
    log.info("header", {
      diff: current
    });
    c.res.headers.set(HEADER, JSON.stringify(current));
  }
};