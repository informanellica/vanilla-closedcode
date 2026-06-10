import { sql as drizzleSql } from "drizzle-orm";
export * from "drizzle-orm";
import { LocalContext } from "#util/local-context.js";
import { lazy } from "../util/lazy.js";
import { Global } from "core/global";
import * as Log from "core/util/log";
import { NamedError } from "core/util/error";
import z from "zod";
import path from "path";
import { readFileSync, readdirSync, existsSync, renameSync } from "fs";
import { fileURLToPath } from "node:url";
import { Flag } from "core/flag/flag";
import { InstallationChannel } from "core/installation/version";
import { InstanceState } from "#effect/instance-state.js";
import { iife } from "#util/iife.js";
import { init } from "#db";
import { applyMigrationsSync, applyMigrationsAsync } from "./migrate.js";
export const NotFoundError = NamedError.create("NotFoundError", z.object({
  message: z.string()
}));
const log = Log.create({
  service: "db"
});
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Legacy opencode.db path for migration purposes.
function legacyChannelPath() {
  if (["latest", "beta", "prod"].includes(InstallationChannel) || Flag.CLOSEDCODE_DISABLE_CHANNEL_DB) return path.join(Global.Path.data, "opencode.db");
  const safe = InstallationChannel.replace(/[^a-zA-Z0-9._-]/g, "-");
  return path.join(Global.Path.data, `opencode-${safe}.db`);
}
export function getChannelPath() {
  if (["latest", "beta", "prod"].includes(InstallationChannel) || Flag.CLOSEDCODE_DISABLE_CHANNEL_DB) return path.join(Global.Path.data, "closedcode.db");
  const safe = InstallationChannel.replace(/[^a-zA-Z0-9._-]/g, "-");
  return path.join(Global.Path.data, `closedcode-${safe}.db`);
}
// Rename legacy opencode.db -> closedcode.db (and WAL/SHM companions) on first
// run so existing user data is preserved under the canonical filename.
function migrateDbFile(canonical) {
  if (existsSync(canonical)) return;
  const legacy = legacyChannelPath();
  if (!existsSync(legacy)) return;
  for (const suffix of ["", "-wal", "-shm"]) {
    const src = legacy + suffix;
    const dst = canonical + suffix;
    if (existsSync(src)) {
      try { renameSync(src, dst); } catch {}
    }
  }
  log.info("migrated legacy database file", { from: legacy, to: canonical });
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
export const Client = lazy(() => {
  // Migrate legacy opencode.db -> closedcode.db before opening.
  if (!Flag.CLOSEDCODE_DB) migrateDbFile(Path);
  log.info("opening database", {
    path: Path
  });
  const db = init(Path);
  db.run("PRAGMA journal_mode = WAL");
  db.run("PRAGMA synchronous = NORMAL");
  db.run("PRAGMA busy_timeout = 5000");
  db.run("PRAGMA cache_size = -64000");
  db.run("PRAGMA foreign_keys = ON");
  db.run("PRAGMA wal_checkpoint(PASSIVE)");

  // Apply schema migrations
  const entries = migrationEntries();
  if (entries.length > 0) {
    log.info("applying migrations", {
      count: entries.length,
      mode: typeof CLOSEDCODE_MIGRATIONS !== "undefined" ? "bundled" : "dev"
    });
    applyMigrationsSync(db.$client, entries);
  }
  return db;
});
export function close() {
  if (!Client.loaded()) return;
  Client().$client.close();
  Client.reset();
}
const ctx = LocalContext.create("database");
export function use(callback) {
  try {
    return callback(ctx.use().tx);
  } catch (err) {
    if (err instanceof LocalContext.NotFound) {
      const effects = [];
      const result = ctx.provide({
        effects,
        tx: Client()
      }, () => callback(Client()));
      for (const effect of effects) effect();
      return result;
    }
    throw err;
  }
}
export function effect(fn) {
  const bound = InstanceState.bind(fn);
  try {
    ctx.use().effects.push(bound);
  } catch {
    bound();
  }
}
export function transaction(callback, options) {
  try {
    return callback(ctx.use().tx);
  } catch (err) {
    if (err instanceof LocalContext.NotFound) {
      const effects = [];
      const txCallback = InstanceState.bind(tx => ctx.provide({
        tx,
        effects
      }, () => callback(tx)));
      const result = Client().transaction(txCallback, {
        behavior: options?.behavior
      });
      for (const effect of effects) effect();
      return result;
    }
    throw err;
  }
}
// ---- Sequelize layer (ORM migration S1, feat/orm-sequelize) ----------------
// Async successors of use/transaction/effect. Both layers run against the
// SAME database file during the staged conversion; modules switch one by one.
// The ambient transaction travels via AsyncLocalStorage; callbacks receive a
// handle { models, sequelize, tx } and pass { transaction: handle.tx } to
// model calls.
import { createSequelize, transactionStorage } from "./sequelize.js";
export const Orm = lazy(() => {
  if (!Flag.CLOSEDCODE_DB) migrateDbFile(Path);
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
export async function transactionAsync(callback) {
  const ambient = transactionStorage.getStore();
  if (ambient) return callback({ ...ambient.handle });
  const { sequelize, models } = await ormInit();
  const effects = [];
  const result = await sequelize.transaction(async tx => {
    const handle = { models, sequelize, tx };
    return transactionStorage.run({ tx, effects, handle }, () => callback(handle));
  });
  for (const fn of effects) fn();
  return result;
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
