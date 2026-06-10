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
function applyMigrations(db, entries) {
  const client = db.$client;
  client.exec(
    "CREATE TABLE IF NOT EXISTS __drizzle_migrations (" +
      "id INTEGER PRIMARY KEY AUTOINCREMENT, hash text NOT NULL, created_at numeric)",
  );
  const last = client
    .prepare("SELECT MAX(created_at) AS created_at FROM __drizzle_migrations")
    .get()
  const lastAt = last?.created_at ?? 0
  for (const entry of entries) {
    if (entry.timestamp <= lastAt) continue
    client.exec("BEGIN")
    try {
      for (const stmt of entry.sql.split("--> statement-breakpoint")) {
        const trimmed = stmt.trim()
        if (trimmed) client.exec(trimmed)
      }
      client
        .prepare("INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)")
        .run(entry.name, entry.timestamp)
      client.exec("COMMIT")
    } catch (e) {
      client.exec("ROLLBACK")
      throw e
    }
  }
}
function time(tag) {
  const match = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/.exec(tag);
  if (!match) return 0;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]), Number(match[6]));
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
  const entries = typeof CLOSEDCODE_MIGRATIONS !== "undefined" ? CLOSEDCODE_MIGRATIONS : migrations(path.join(__dirname, "../../migration"));
  if (entries.length > 0) {
    log.info("applying migrations", {
      count: entries.length,
      mode: typeof CLOSEDCODE_MIGRATIONS !== "undefined" ? "bundled" : "dev"
    });
    if (Flag.CLOSEDCODE_SKIP_MIGRATIONS) {
      for (const item of entries) {
        item.sql = "select 1;";
      }
    }
    applyMigrations(db, entries);
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
export * as Database from "./db.js";
