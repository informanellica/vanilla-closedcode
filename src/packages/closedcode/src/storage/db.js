import { lazy } from "../util/lazy.js";
import { Global } from "core/global";
import * as Log from "core/util/log";
import { NamedError } from "core/util/error";
import z from "zod";
import path from "path";
import { readFileSync, readdirSync, existsSync } from "fs";
import { fileURLToPath } from "node:url";
import { Flag } from "core/flag/flag";
import { InstallationChannel } from "core/installation/version";
import { InstanceState } from "#effect/instance-state.js";
import { iife } from "#util/iife.js";
import { applyMigrationsAsync } from "./migrate.js";
export const NotFoundError = NamedError.create("NotFoundError", z.object({
  message: z.string()
}));
const log = Log.create({
  service: "db"
});
const __dirname = path.dirname(fileURLToPath(import.meta.url));
export function getChannelPath() {
  if (["latest", "beta", "prod"].includes(InstallationChannel) || Flag.CLOSEDCODE_DISABLE_CHANNEL_DB) return path.join(Global.Path.data, "closedcode.db");
  const safe = InstallationChannel.replace(/[^a-zA-Z0-9._-]/g, "-");
  return path.join(Global.Path.data, `closedcode-${safe}.db`);
}
export const Path = iife(() => {
  if (Flag.CLOSEDCODE_DB) {
    if (Flag.CLOSEDCODE_DB === ":memory:" || path.isAbsolute(Flag.CLOSEDCODE_DB)) return Flag.CLOSEDCODE_DB;
    return path.join(Global.Path.data, Flag.CLOSEDCODE_DB);
  }
  return getChannelPath();
});
// Journal-style migrator. Drizzle's built-in migrator only reads from disk
// (migrationsFolder); reimplement the minimal pieces for bundled entries.
// Reimplement the minimal pieces we need: a __drizzle_migrations table that
// tracks creation timestamps and per-entry execution.
function time(tag) {
  const match = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/.exec(tag);
  if (!match) return 0;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]), Number(match[6]));
}
export function migrationEntries() {
  const entries = typeof CLOSEDCODE_MIGRATIONS !== "undefined" ? CLOSEDCODE_MIGRATIONS : migrations(path.join(__dirname, "../../migration"));
  if (Flag.CLOSEDCODE_SKIP_MIGRATIONS) for (const item of entries) item.sql = "select 1;";
  return entries;
}
function migrations(dir) {
  const dirs = readdirSync(dir, {
    withFileTypes: true
  }).filter(entry => entry.isDirectory()).map(entry => entry.name);
  const sql = dirs.map(name => {
    const file = path.join(dir, name, "migration.sql");
    if (!existsSync(file)) return;
    return {
      sql: readFileSync(file, "utf-8"),
      timestamp: time(name),
      name
    };
  }).filter(Boolean);
  return sql.sort((a, b) => a.timestamp - b.timestamp);
}
// ORM migration S4: the legacy node:sqlite/drizzle layer is gone. close()
// remains (test teardowns + shutdown) and now only drops the Sequelize layer.
export function close() {
  if (!Orm.loaded()) return;
  void Orm().sequelize.close().catch(() => {});
  Orm.reset();
  ormReady = null;
}

// ---- Sequelize layer (ORM migration S1, feat/orm-sequelize) ----------------
// Async successors of use/transaction/effect. Both layers run against the
// SAME database file during the staged conversion; modules switch one by one.
// The ambient transaction travels via AsyncLocalStorage; callbacks receive a
// handle { models, sequelize, tx } and pass { transaction: handle.tx } to
// model calls.
import { createSequelize, transactionStorage } from "./sequelize.js";
export const Orm = lazy(() => {
  const { sequelize, models } = createSequelize(Path);
  return { sequelize, models };
});
let ormReady = null;
export function ormInit() {
  if (ormReady) return ormReady;
  ormReady = (async () => {
    const { sequelize } = Orm();
    for (const pragma of [
      "PRAGMA journal_mode = WAL",
      "PRAGMA synchronous = NORMAL",
      "PRAGMA busy_timeout = 5000",
      "PRAGMA cache_size = -64000",
      "PRAGMA foreign_keys = ON",
    ]) await sequelize.query(pragma);
    await applyMigrationsAsync(sequelize, migrationEntries());
    return Orm();
  })();
  return ormReady;
}
export async function useAsync(callback) {
  const ambient = transactionStorage.getStore();
  if (ambient) return callback({ ...ambient.handle });
  const { sequelize, models } = await ormInit();
  return callback({ models, sequelize, tx: undefined });
}
export async function transactionAsync(callback, options) {
  const ambient = transactionStorage.getStore();
  if (ambient) return callback({ ...ambient.handle });
  const { sequelize, models } = await ormInit();
  const effects = [];
  // Hand-rolled BEGIN/COMMIT instead of sequelize.transaction(): the managed
  // transaction pins the single pooled connection (pool max:1) for its whole
  // body, so any nested query that lost the AsyncLocalStorage context (the
  // Effect runtime does not propagate ALS across fiber scheduling) waits for
  // a second connection that can never come — a deterministic boot deadlock.
  // With plain queries every statement serializes onto the one connection,
  // where sqlite transactions are connection-level state — nested calls land
  // inside the open transaction exactly like the legacy synchronous layer.
  const types = { immediate: "IMMEDIATE", exclusive: "EXCLUSIVE", deferred: "DEFERRED" };
  const behavior = types[options?.behavior] ?? "DEFERRED";
  await sequelize.query(`BEGIN ${behavior} TRANSACTION`);
  const handle = { models, sequelize, tx: undefined };
  try {
    const result = await transactionStorage.run({ effects, handle }, () => callback(handle));
    await sequelize.query("COMMIT");
    for (const fn of effects) fn();
    return result;
  } catch (error) {
    await sequelize.query("ROLLBACK").catch(() => {});
    throw error;
  }
}
// Commit-deferred side effects (parity with effect() above): inside an
// ambient transaction they run after commit, otherwise immediately.
export function effectAsync(fn) {
  const bound = InstanceState.bind(fn);
  const ambient = transactionStorage.getStore();
  if (ambient) ambient.effects.push(bound);
  else bound();
}
export async function closeAsync() {
  if (!Orm.loaded()) return;
  await Orm().sequelize.close();
  Orm.reset();
  ormReady = null;
}

export * as Database from "./db.js";
