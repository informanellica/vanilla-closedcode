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
export function diff(prev, next) {
  const ids = new Set([...Object.keys(prev), ...Object.keys(next)]);
  return Object.fromEntries([...ids].map(id => [id, next[id] ?? -1]).filter(([id, seq]) => {
    return (prev[id] ?? -1) !== seq;
  }));
}
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
export async function wait(workspaceID, state, signal) {
  await AppRuntime.runPromise(waitEffect(workspaceID, state, signal));
}
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