/** @file CLI `import` command: ingests a session from a local JSON file or a share URL into the local database. */
import { Session } from "#session/session.js";
import { MessageV2 } from "../../session/message-v2.js";
import { CliError, effectCmd } from "../effect-cmd.js";
import { Database } from "#storage/db.js";
import { InstanceRef } from "#effect/instance-ref.js";
import { ShareNext } from "#share/share-next.js";
import { EOL } from "os";
import { Filesystem } from "#util/filesystem.js";
import { Effect, Schema } from "effect";
const decodeMessageInfo = Schema.decodeUnknownSync(MessageV2.Info);
const decodePart = Schema.decodeUnknownSync(MessageV2.Part);

/** Discriminated union returned by the ShareNext API (GET /api/shares/:id/data) */

/**
 * Extract share ID from a share URL like https://share.example.com/share/abc123
 * @param {string} url - The full share URL.
 * @returns {string} The extracted share slug, or null when the URL does not match the expected shape.
 */
export function parseShareUrl(url) {
  const match = url.match(/^https?:\/\/[^/]+\/share\/([a-zA-Z0-9_-]+)$/);
  return match ? match[1] : null;
}
/**
 * Decide whether the account's auth headers should be sent to the share URL (only when same-origin).
 * @param {string} shareUrl - The share URL being fetched.
 * @param {string} accountBaseUrl - The configured account/share service base URL.
 * @returns {boolean} True when both URLs share the same origin, false on mismatch or parse error.
 */
export function shouldAttachShareAuthHeaders(shareUrl, accountBaseUrl) {
  try {
    return new URL(shareUrl).origin === new URL(accountBaseUrl).origin;
  } catch {
    return false;
  }
}

/**
 * Transform ShareNext API response (flat array) into the nested structure for local file storage.
 *
 * The API returns a flat array: [session, message, message, part, part, ...]
 * Local storage expects: { info: session, messages: [{ info: message, parts: [part, ...] }, ...] }
 *
 * This groups parts by their messageID to reconstruct the hierarchy before writing to disk.
 *
 * @param {Array} shareData - Flat list of share items, each `{type, data}` where type is "session", "message", or "part".
 * @returns {Object} The nested `{info, messages}` structure, or null when no session/messages are present.
 */
export function transformShareData(shareData) {
  const sessionItem = shareData.find(d => d.type === "session");
  if (!sessionItem) return null;
  const messageMap = new Map();
  const partMap = new Map();
  for (const item of shareData) {
    if (item.type === "message") {
      messageMap.set(item.data.id, item.data);
    } else if (item.type === "part") {
      if (!partMap.has(item.data.messageID)) {
        partMap.set(item.data.messageID, []);
      }
      partMap.get(item.data.messageID).push(item.data);
    }
  }
  if (messageMap.size === 0) return null;
  return {
    info: sessionItem.data,
    messages: Array.from(messageMap.values()).map(msg => ({
      info: msg,
      parts: partMap.get(msg.id) ?? []
    }))
  };
}
/** `import <file>` command definition: imports session data from a local JSON file path or a share URL. */
export const ImportCommand = effectCmd({
  command: "import <file>",
  describe: "import session data from JSON file or URL",
  builder: yargs => yargs.positional("file", {
    describe: "path to JSON file or share URL",
    type: "string",
    demandOption: true
  }),
  handler: Effect.fn("Cli.import")(function* (args) {
    const ctx = yield* InstanceRef;
    if (!ctx) return yield* Effect.die("InstanceRef not provided");
    return yield* runImport(args.file, ctx.project.id);
  })
});
/**
 * Load session data from a file path or share URL and upsert the session, its messages, and parts into the database.
 * @param {string} file - Local JSON file path or a share URL (http/https).
 * @param {string} projectID - Project id to associate the imported session with.
 * @returns {Effect} An Effect that performs the import and writes a status line to stdout.
 */
const runImport = Effect.fn("Cli.import.body")(function* (file, projectID) {
  const share = yield* ShareNext.Service;
  let exportData;
  const isUrl = file.startsWith("http://") || file.startsWith("https://");
  if (isUrl) {
    const slug = parseShareUrl(file);
    if (!slug) {
      const baseUrl = yield* Effect.orDie(share.url());
      process.stdout.write(`Invalid URL format. Expected: ${baseUrl}/share/<slug>`);
      process.stdout.write(EOL);
      return;
    }
    const baseUrl = new URL(file).origin;
    const req = yield* Effect.orDie(share.request());
    const headers = shouldAttachShareAuthHeaders(file, req.baseUrl) ? req.headers : {};
    const tryFetch = url => Effect.tryPromise({
      try: () => fetch(url, {
        headers
      }),
      catch: e => new CliError({
        message: `Failed to fetch share data: ${e instanceof Error ? e.message : String(e)}`
      })
    });
    const dataPath = req.api.data(slug);
    let response = yield* tryFetch(`${baseUrl}${dataPath}`);
    if (!response.ok && dataPath !== `/api/share/${slug}/data`) {
      response = yield* tryFetch(`${baseUrl}/api/share/${slug}/data`);
    }
    if (!response.ok) {
      process.stdout.write(`Failed to fetch share data: ${response.statusText}`);
      process.stdout.write(EOL);
      return;
    }
    const shareData = yield* Effect.tryPromise({
      try: () => response.json(),
      catch: () => new CliError({
        message: "Share data was not valid JSON"
      })
    });
    const transformed = transformShareData(shareData);
    if (!transformed) {
      process.stdout.write(`Share not found or empty: ${slug}`);
      process.stdout.write(EOL);
      return;
    }
    exportData = transformed;
  } else {
    exportData = yield* Effect.promise(() => Filesystem.readJson(file).catch(() => undefined));
    if (!exportData) {
      process.stdout.write(`File not found: ${file}`);
      process.stdout.write(EOL);
      return;
    }
  }
  if (!exportData) {
    process.stdout.write(`Failed to read session data`);
    process.stdout.write(EOL);
    return;
  }
  const info = Schema.decodeUnknownSync(Session.Info)({
    ...exportData.info,
    projectID
  });
  const row = Session.toRow(info);
  // Raw upsert (Sequelize layer): drizzle's onConflictDoUpdate only touched
  // project_id (plus the $onUpdate time_updated column) — model.upsert would
  // overwrite every column of an existing session, so keep the partial
  // ON CONFLICT DO UPDATE as raw SQL. JSON columns are stringified manually.
  const json = value => (value == null ? null : JSON.stringify(value));
  yield* Effect.promise(() => Database.useAsync(h => h.sequelize.query("INSERT INTO session (id, project_id, workspace_id, parent_id, slug, directory, path, title, agent, model, version, share_url, summary_additions, summary_deletions, summary_files, summary_diffs, revert, permission, time_created, time_updated, time_compacting, time_archived) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET project_id = excluded.project_id, time_updated = ?", {
    replacements: [row.id, row.project_id, row.workspace_id ?? null, row.parent_id ?? null, row.slug, row.directory, row.path ?? null, row.title, row.agent ?? null, json(row.model), row.version, row.share_url ?? null, row.summary_additions ?? null, row.summary_deletions ?? null, row.summary_files ?? null, json(row.summary_diffs), json(row.revert), json(row.permission), row.time_created ?? Date.now(), row.time_updated ?? Date.now(), row.time_compacting ?? null, row.time_archived ?? null, Date.now()],
    transaction: h.tx
  })));
  for (const msg of exportData.messages) {
    const msgInfo = decodeMessageInfo(msg.info);
    const {
      id,
      sessionID: _,
      ...msgData
    } = msgInfo;
    // bulkCreate + ignoreDuplicates emits INSERT OR IGNORE (onConflictDoNothing);
    // the model hooks fill time_updated like drizzle's $onUpdate did on insert.
    yield* Effect.promise(() => Database.useAsync(h => h.models.Message.bulkCreate([{
      id,
      session_id: row.id,
      time_created: msgInfo.time?.created ?? Date.now(),
      data: msgData
    }], {
      ignoreDuplicates: true,
      transaction: h.tx
    })));
    for (const part of msg.parts) {
      const partInfo = decodePart(part);
      const {
        id: partId,
        sessionID: _s,
        messageID,
        ...partData
      } = partInfo;
      yield* Effect.promise(() => Database.useAsync(h => h.models.Part.bulkCreate([{
        id: partId,
        message_id: messageID,
        session_id: row.id,
        data: partData
      }], {
        ignoreDuplicates: true,
        transaction: h.tx
      })));
    }
  }
  process.stdout.write(`Imported session: ${exportData.info.id}`);
  process.stdout.write(EOL);
});