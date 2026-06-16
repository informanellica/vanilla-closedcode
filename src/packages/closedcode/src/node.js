/**
 * @file Public Node entry barrel. Re-exports the core building blocks consumed by
 * embedders: configuration, the HTTP server, the bootstrap routine, logging, the
 * database handle and the JSON-to-SQLite migration.
 * @module closedcode/node
 */

export { Config } from "#config/config.js";
export { Server } from "./server/server.js";
export { bootstrap } from "./cli/bootstrap.js";
export * as Log from "core/util/log";
export { Database } from "#storage/db.js";
export { JsonMigration } from "#storage/json-migration.js";