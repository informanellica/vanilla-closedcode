import { Global } from "core/global";
import * as Log from "core/util/log";
import { Database } from "#storage/db.js";
import path from "path";
import { existsSync } from "fs";
import { Filesystem } from "#util/filesystem.js";
import { Glob } from "core/util/glob";
/**
 * @file One-time migration of the legacy on-disk JSON storage (project,
 * session, message, part, todo, permission, session_share files) into the
 * SQLite database via batched INSERT OR IGNORE statements.
 */
const log = Log.create({
  service: "json-migration"
});
// Raw-SQL batch specs (ORM migration S3). The drizzle table objects are gone;
// INSERT OR IGNORE batches (drizzle's onConflictDoNothing) go through
// h.sequelize.query so explicitly provided time_created/time_updated values
// survive — the model bulkCreate hooks would overwrite time_updated. JSON
// columns are stringified manually, the same physical encoding as drizzle's
// text({ mode: "json" }).
/**
 * Per-table insert specs: target table name, ordered column list, and the set
 * of columns whose values must be JSON-stringified before insertion.
 * @type {Object}
 */
const TABLES = {
  project: {
    name: "project",
    columns: ["id", "worktree", "vcs", "name", "icon_url", "icon_url_override", "icon_color", "time_created", "time_updated", "time_initialized", "sandboxes", "commands"],
    json: new Set(["sandboxes", "commands"])
  },
  session: {
    name: "session",
    columns: ["id", "project_id", "parent_id", "slug", "directory", "path", "title", "version", "share_url", "summary_additions", "summary_deletions", "summary_files", "summary_diffs", "revert", "permission", "time_created", "time_updated", "time_compacting", "time_archived"],
    json: new Set(["summary_diffs", "revert", "permission"])
  },
  message: {
    name: "message",
    columns: ["id", "session_id", "time_created", "time_updated", "data"],
    json: new Set(["data"])
  },
  part: {
    name: "part",
    columns: ["id", "message_id", "session_id", "time_created", "time_updated", "data"],
    json: new Set(["data"])
  },
  todo: {
    name: "todo",
    columns: ["session_id", "content", "status", "priority", "position", "time_created", "time_updated"],
    json: new Set()
  },
  permission: {
    name: "permission",
    columns: ["project_id", "time_created", "time_updated", "data"],
    json: new Set(["data"])
  },
  session_share: {
    name: "session_share",
    columns: ["session_id", "id", "secret", "url", "time_created", "time_updated"],
    json: new Set()
  }
};
/**
 * Migrate the legacy JSON storage directory into SQLite. Scans all entity
 * files, then inserts them in dependency order (projects, sessions, messages,
 * parts, todos, permissions, shares) within a single transaction, skipping
 * orphaned records whose parent is missing.
 * @param {Object} options - Optional settings; `progress` is a callback receiving {current, total, label}.
 * @returns {Promise<Object>} Promise resolving to per-entity counts plus an `errors` array.
 */
export async function run(options) {
  const storageDir = path.join(Global.Path.data, "storage");
  if (!existsSync(storageDir)) {
    log.info("storage directory does not exist, skipping migration");
    return {
      projects: 0,
      sessions: 0,
      messages: 0,
      parts: 0,
      todos: 0,
      permissions: 0,
      shares: 0,
      errors: []
    };
  }
  log.info("starting json to sqlite migration", {
    storageDir
  });
  const start = performance.now();

  // Optimize SQLite for bulk inserts (outside the transaction below —
  // journal_mode cannot be changed inside an open transaction)
  await Database.useAsync(async h => {
    for (const pragma of ["PRAGMA journal_mode = WAL", "PRAGMA synchronous = OFF", "PRAGMA cache_size = 10000", "PRAGMA temp_store = MEMORY"]) {
      await h.sequelize.query(pragma, {
        transaction: h.tx
      });
    }
  });
  const stats = {
    projects: 0,
    sessions: 0,
    messages: 0,
    parts: 0,
    todos: 0,
    permissions: 0,
    shares: 0,
    errors: []
  };
  const orphans = {
    sessions: 0,
    todos: 0,
    permissions: 0,
    shares: 0
  };
  const errs = stats.errors;
  const batchSize = 1000;
  const now = Date.now();
  /**
   * Glob the storage directory for files matching a pattern.
   * @param {string} pattern - The glob pattern relative to the storage dir.
   * @returns {Promise<Array<string>>} Promise resolving to absolute file paths.
   */
  async function list(pattern) {
    return Glob.scan(pattern, {
      cwd: storageDir,
      absolute: true
    });
  }
  /**
   * Read a contiguous slice of JSON files concurrently, recording read errors
   * and leaving failed slots undefined.
   * @param {Array<string>} files - The full list of file paths.
   * @param {number} start - Inclusive start index.
   * @param {number} end - Exclusive end index.
   * @returns {Promise<Array<*>>} Promise resolving to the parsed JSON for each file in range.
   */
  async function read(files, start, end) {
    const count = end - start;
    // oxlint-disable-next-line unicorn/no-new-array -- pre-allocated for index-based batch fill
    const tasks = new Array(count);
    for (let i = 0; i < count; i++) {
      tasks[i] = Filesystem.readJson(files[start + i]);
    }
    const results = await Promise.allSettled(tasks);
    // oxlint-disable-next-line unicorn/no-new-array -- pre-allocated for index-based batch fill
    const items = new Array(count);
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === "fulfilled") {
        items[i] = result.value;
        continue;
      }
      errs.push(`failed to read ${files[start + i]}: ${result.reason}`);
    }
    return items;
  }

  // Pre-scan all files upfront to avoid repeated glob operations
  log.info("scanning files...");
  const [projectFiles, sessionFiles, messageFiles, partFiles, todoFiles, permFiles, shareFiles] = await Promise.all([list("project/*.json"), list("session/*/*.json"), list("message/*/*.json"), list("part/*/*.json"), list("todo/*.json"), list("permission/*.json"), list("session_share/*.json")]);
  log.info("file scan complete", {
    projects: projectFiles.length,
    sessions: sessionFiles.length,
    messages: messageFiles.length,
    parts: partFiles.length,
    todos: todoFiles.length,
    permissions: permFiles.length,
    shares: shareFiles.length
  });
  const total = Math.max(1, projectFiles.length + sessionFiles.length + messageFiles.length + partFiles.length + todoFiles.length + permFiles.length + shareFiles.length);
  const progress = options?.progress;
  let current = 0;
  /**
   * Advance the migration progress counter and notify the progress callback.
   * @param {string} label - The current phase label.
   * @param {number} count - Number of items just processed.
   * @returns {void}
   */
  const step = (label, count) => {
    current = Math.min(total, current + count);
    progress?.({
      current,
      total,
      label
    });
  };
  progress?.({
    current,
    total,
    label: "starting"
  });
  await Database.transactionAsync(async h => {
    /**
     * Insert a batch of row objects via a single parameterized
     * INSERT OR IGNORE, JSON-stringifying the columns named in the spec.
     * Records errors and returns 0 on failure.
     * @param {Array<Object>} values - Row objects keyed by spec column names.
     * @param {Object} spec - The table spec {name, columns, json}.
     * @param {string} label - Label used in error messages.
     * @returns {Promise<number>} Promise resolving to the number of rows attempted (0 on error).
     */
    async function insert(values, spec, label) {
      if (values.length === 0) return 0;
      try {
        const tuple = `(${spec.columns.map(() => "?").join(", ")})`;
        const replacements = [];
        for (const value of values) {
          for (const column of spec.columns) {
            const raw = value[column];
            replacements.push(raw == null ? null : spec.json.has(column) ? JSON.stringify(raw) : raw);
          }
        }
        await h.sequelize.query(`INSERT OR IGNORE INTO ${spec.name} (${spec.columns.join(", ")}) VALUES ${values.map(() => tuple).join(", ")}`, {
          replacements,
          transaction: h.tx
        });
        return values.length;
      } catch (e) {
        errs.push(`failed to migrate ${label} batch: ${e}`);
        return 0;
      }
    }

    // Migrate projects first (no FK deps)
    // Derive all IDs from file paths, not JSON content
    const projectIds = new Set();
    const projectValues = [];
    for (let i = 0; i < projectFiles.length; i += batchSize) {
      const end = Math.min(i + batchSize, projectFiles.length);
      const batch = await read(projectFiles, i, end);
      projectValues.length = 0;
      for (let j = 0; j < batch.length; j++) {
        const data = batch[j];
        if (!data) continue;
        const id = path.basename(projectFiles[i + j], ".json");
        projectIds.add(id);
        projectValues.push({
          id,
          worktree: data.worktree ?? "/",
          vcs: data.vcs,
          name: data.name ?? undefined,
          icon_url: data.icon?.url,
          icon_url_override: data.icon?.override,
          icon_color: data.icon?.color,
          time_created: data.time?.created ?? now,
          time_updated: data.time?.updated ?? now,
          time_initialized: data.time?.initialized,
          sandboxes: data.sandboxes ?? [],
          commands: data.commands
        });
      }
      stats.projects += await insert(projectValues, TABLES.project, "project");
      step("projects", end - i);
    }
    log.info("migrated projects", {
      count: stats.projects,
      duration: Math.round(performance.now() - start)
    });

    // Migrate sessions (depends on projects)
    // Derive all IDs from directory/file paths, not JSON content, since earlier
    // migrations may have moved sessions to new directories without updating the JSON
    const sessionProjects = sessionFiles.map(file => path.basename(path.dirname(file)));
    const sessionIds = new Set();
    const sessionValues = [];
    for (let i = 0; i < sessionFiles.length; i += batchSize) {
      const end = Math.min(i + batchSize, sessionFiles.length);
      const batch = await read(sessionFiles, i, end);
      sessionValues.length = 0;
      for (let j = 0; j < batch.length; j++) {
        const data = batch[j];
        if (!data) continue;
        const id = path.basename(sessionFiles[i + j], ".json");
        const projectID = sessionProjects[i + j];
        if (!projectIds.has(projectID)) {
          orphans.sessions++;
          continue;
        }
        sessionIds.add(id);
        sessionValues.push({
          id,
          project_id: projectID,
          parent_id: data.parentID ?? null,
          slug: data.slug ?? "",
          directory: data.directory ?? "",
          path: data.path ?? null,
          title: data.title ?? "",
          version: data.version ?? "",
          share_url: data.share?.url ?? null,
          summary_additions: data.summary?.additions ?? null,
          summary_deletions: data.summary?.deletions ?? null,
          summary_files: data.summary?.files ?? null,
          summary_diffs: data.summary?.diffs ?? null,
          revert: data.revert ?? null,
          permission: data.permission ?? null,
          time_created: data.time?.created ?? now,
          time_updated: data.time?.updated ?? now,
          time_compacting: data.time?.compacting ?? null,
          time_archived: data.time?.archived ?? null
        });
      }
      stats.sessions += await insert(sessionValues, TABLES.session, "session");
      step("sessions", end - i);
    }
    log.info("migrated sessions", {
      count: stats.sessions
    });
    if (orphans.sessions > 0) {
      log.warn("skipped orphaned sessions", {
        count: orphans.sessions
      });
    }

    // Migrate messages using pre-scanned file map
    const allMessageFiles = [];
    const allMessageSessions = [];
    const messageSessions = new Map();
    for (const file of messageFiles) {
      const sessionID = path.basename(path.dirname(file));
      if (!sessionIds.has(sessionID)) continue;
      allMessageFiles.push(file);
      allMessageSessions.push(sessionID);
    }
    for (let i = 0; i < allMessageFiles.length; i += batchSize) {
      const end = Math.min(i + batchSize, allMessageFiles.length);
      const batch = await read(allMessageFiles, i, end);
      // oxlint-disable-next-line unicorn/no-new-array -- pre-allocated for index-based batch fill
      const values = new Array(batch.length);
      let count = 0;
      for (let j = 0; j < batch.length; j++) {
        const data = batch[j];
        if (!data) continue;
        const file = allMessageFiles[i + j];
        const id = path.basename(file, ".json");
        const sessionID = allMessageSessions[i + j];
        messageSessions.set(id, sessionID);
        const rest = data;
        delete rest.id;
        delete rest.sessionID;
        values[count++] = {
          id,
          session_id: sessionID,
          time_created: data.time?.created ?? now,
          time_updated: data.time?.updated ?? now,
          data: rest
        };
      }
      values.length = count;
      stats.messages += await insert(values, TABLES.message, "message");
      step("messages", end - i);
    }
    log.info("migrated messages", {
      count: stats.messages
    });

    // Migrate parts using pre-scanned file map
    for (let i = 0; i < partFiles.length; i += batchSize) {
      const end = Math.min(i + batchSize, partFiles.length);
      const batch = await read(partFiles, i, end);
      // oxlint-disable-next-line unicorn/no-new-array -- pre-allocated for index-based batch fill
      const values = new Array(batch.length);
      let count = 0;
      for (let j = 0; j < batch.length; j++) {
        const data = batch[j];
        if (!data) continue;
        const file = partFiles[i + j];
        const id = path.basename(file, ".json");
        const messageID = path.basename(path.dirname(file));
        const sessionID = messageSessions.get(messageID);
        if (!sessionID) {
          errs.push(`part missing message session: ${file}`);
          continue;
        }
        if (!sessionIds.has(sessionID)) continue;
        const rest = data;
        delete rest.id;
        delete rest.messageID;
        delete rest.sessionID;
        values[count++] = {
          id,
          message_id: messageID,
          session_id: sessionID,
          time_created: data.time?.created ?? now,
          time_updated: data.time?.updated ?? now,
          data: rest
        };
      }
      values.length = count;
      stats.parts += await insert(values, TABLES.part, "part");
      step("parts", end - i);
    }
    log.info("migrated parts", {
      count: stats.parts
    });

    // Migrate todos
    const todoSessions = todoFiles.map(file => path.basename(file, ".json"));
    for (let i = 0; i < todoFiles.length; i += batchSize) {
      const end = Math.min(i + batchSize, todoFiles.length);
      const batch = await read(todoFiles, i, end);
      const values = [];
      for (let j = 0; j < batch.length; j++) {
        const data = batch[j];
        if (!data) continue;
        const sessionID = todoSessions[i + j];
        if (!sessionIds.has(sessionID)) {
          orphans.todos++;
          continue;
        }
        if (!Array.isArray(data)) {
          errs.push(`todo not an array: ${todoFiles[i + j]}`);
          continue;
        }
        for (let position = 0; position < data.length; position++) {
          const todo = data[position];
          if (!todo?.content || !todo?.status || !todo?.priority) continue;
          values.push({
            session_id: sessionID,
            content: todo.content,
            status: todo.status,
            priority: todo.priority,
            position,
            time_created: now,
            time_updated: now
          });
        }
      }
      stats.todos += await insert(values, TABLES.todo, "todo");
      step("todos", end - i);
    }
    log.info("migrated todos", {
      count: stats.todos
    });
    if (orphans.todos > 0) {
      log.warn("skipped orphaned todos", {
        count: orphans.todos
      });
    }

    // Migrate permissions
    // (timestamps were drizzle column defaults; raw SQL needs them explicit)
    const permProjects = permFiles.map(file => path.basename(file, ".json"));
    const permValues = [];
    for (let i = 0; i < permFiles.length; i += batchSize) {
      const end = Math.min(i + batchSize, permFiles.length);
      const batch = await read(permFiles, i, end);
      permValues.length = 0;
      for (let j = 0; j < batch.length; j++) {
        const data = batch[j];
        if (!data) continue;
        const projectID = permProjects[i + j];
        if (!projectIds.has(projectID)) {
          orphans.permissions++;
          continue;
        }
        permValues.push({
          project_id: projectID,
          time_created: Date.now(),
          time_updated: Date.now(),
          data
        });
      }
      stats.permissions += await insert(permValues, TABLES.permission, "permission");
      step("permissions", end - i);
    }
    log.info("migrated permissions", {
      count: stats.permissions
    });
    if (orphans.permissions > 0) {
      log.warn("skipped orphaned permissions", {
        count: orphans.permissions
      });
    }

    // Migrate session shares
    // (timestamps were drizzle column defaults; raw SQL needs them explicit)
    const shareSessions = shareFiles.map(file => path.basename(file, ".json"));
    const shareValues = [];
    for (let i = 0; i < shareFiles.length; i += batchSize) {
      const end = Math.min(i + batchSize, shareFiles.length);
      const batch = await read(shareFiles, i, end);
      shareValues.length = 0;
      for (let j = 0; j < batch.length; j++) {
        const data = batch[j];
        if (!data) continue;
        const sessionID = shareSessions[i + j];
        if (!sessionIds.has(sessionID)) {
          orphans.shares++;
          continue;
        }
        if (!data?.id || !data?.secret || !data?.url) {
          errs.push(`session_share missing id/secret/url: ${shareFiles[i + j]}`);
          continue;
        }
        shareValues.push({
          session_id: sessionID,
          id: data.id,
          secret: data.secret,
          url: data.url,
          time_created: Date.now(),
          time_updated: Date.now()
        });
      }
      stats.shares += await insert(shareValues, TABLES.session_share, "session_share");
      step("shares", end - i);
    }
    log.info("migrated session shares", {
      count: stats.shares
    });
    if (orphans.shares > 0) {
      log.warn("skipped orphaned session shares", {
        count: orphans.shares
      });
    }
  });
  log.info("json migration complete", {
    projects: stats.projects,
    sessions: stats.sessions,
    messages: stats.messages,
    parts: stats.parts,
    todos: stats.todos,
    permissions: stats.permissions,
    shares: stats.shares,
    errorCount: stats.errors.length,
    duration: Math.round(performance.now() - start)
  });
  if (stats.errors.length > 0) {
    log.warn("migration errors", {
      errors: stats.errors.slice(0, 20)
    });
  }
  progress?.({
    current: total,
    total,
    label: "complete"
  });
  return stats;
}
export * as JsonMigration from "./json-migration.js";
