/** @file Sync-event projectors that write session, message, and part changes into the sqlite store; re-exports the v2 (next) projectors. */
import { NotFoundError } from "#storage/storage.js";
import { SyncEvent } from "#sync/index.js";
import * as Session from "./session.js";
import { MessageV2 } from "./message-v2.js";
import { Log } from "core/util/log";
import nextProjectors from "./projectors-next.js";
const log = Log.create({
  service: "session.projector"
});
// Projectors receive the sequelize handle h = { models, sequelize, tx } from
// the SyncEvent dispatcher and are awaited; every model call passes
// { transaction: h.tx }.
/**
 * Determines whether an error is a SQLite foreign-key constraint violation,
 * unwrapping sequelize's wrapped driver error via `original` if needed.
 * @param {*} err - The error to inspect.
 * @returns {boolean} True if the error is (or wraps) a foreign-key constraint failure.
 */
function foreign(err) {
  if (typeof err !== "object" || err === null) return false;
  if ("code" in err && err.code === "SQLITE_CONSTRAINT_FOREIGNKEY") return true;
  if ("message" in err && typeof err.message === "string" && err.message.includes("FOREIGN KEY constraint failed")) return true;
  // sequelize wraps driver errors (SequelizeForeignKeyConstraintError); the
  // underlying sqlite error is preserved on `original`.
  return "original" in err && err.original !== err && foreign(err.original);
}
/**
 * Reads a field from a partial-update object, optionally descending into a
 * nested object via `cb`. Returns undefined when the field is absent, but
 * throws if the field is present yet explicitly `undefined` (callers must pass
 * `null` to clear a value).
 * @param {Object} obj - Source object (may be undefined).
 * @param {string} field1 - Field name to read.
 * @param {Function} cb - Optional callback applied to the value when it is an object.
 * @returns {*} The field value (or callback result), or undefined when absent.
 */
function grab(obj, field1, cb) {
  if (obj == undefined || !(field1 in obj)) return undefined;
  const val = obj[field1];
  if (val && typeof val === "object" && cb) {
    return cb(val);
  }
  if (val === undefined) {
    throw new Error("Session update failure: pass `null` to clear a field instead of `undefined`: " + JSON.stringify(obj));
  }
  return val;
}
/**
 * Maps a partial session-update info object to a partial sqlite row, flattening
 * nested `share`/`summary`/`time` fields to their column names and dropping any
 * keys whose value resolved to undefined (so absent fields aren't overwritten).
 * @param {Object} info - Partial session update info.
 * @returns {Object} A partial row object containing only the columns to update.
 */
export function toPartialRow(info) {
  const obj = {
    id: grab(info, "id"),
    project_id: grab(info, "projectID"),
    workspace_id: grab(info, "workspaceID"),
    parent_id: grab(info, "parentID"),
    slug: grab(info, "slug"),
    directory: grab(info, "directory"),
    path: grab(info, "path"),
    title: grab(info, "title"),
    version: grab(info, "version"),
    share_url: grab(info, "share", v => grab(v, "url")),
    summary_additions: grab(info, "summary", v => grab(v, "additions")),
    summary_deletions: grab(info, "summary", v => grab(v, "deletions")),
    summary_files: grab(info, "summary", v => grab(v, "files")),
    summary_diffs: grab(info, "summary", v => grab(v, "diffs")),
    revert: grab(info, "revert"),
    permission: grab(info, "permission"),
    time_created: grab(info, "time", v => grab(v, "created")),
    time_updated: grab(info, "time", v => grab(v, "updated")),
    time_compacting: grab(info, "time", v => grab(v, "compacting")),
    time_archived: grab(info, "time", v => grab(v, "archived"))
  };
  return Object.fromEntries(Object.entries(obj).filter(([_, val]) => val !== undefined));
}
/**
 * Projector handlers for session/message/part sync events. Each `SyncEvent.project`
 * pairs an event with an async handler that applies the change to the sqlite store
 * using the dispatcher handle `h = { models, sequelize, tx }`. The v2 projectors
 * (`nextProjectors`) are appended at the end.
 * @type {Array}
 */
export default [SyncEvent.project(Session.Event.Created, async (h, data) => {
  await h.models.Session.create(Session.toRow(data.info), { transaction: h.tx });
}), SyncEvent.project(Session.Event.Updated, async (h, data) => {
  const info = data.info;
  const [count] = await h.models.Session.update(toPartialRow(info), {
    where: { id: data.sessionID },
    transaction: h.tx
  });
  if (!count) throw new NotFoundError({
    message: `Session not found: ${data.sessionID}`
  });
}), SyncEvent.project(Session.Event.Deleted, async (h, data) => {
  await h.models.Session.destroy({ where: { id: data.sessionID }, transaction: h.tx });
}), SyncEvent.project(MessageV2.Event.Updated, async (h, data) => {
  const time_created = data.info.time.created;
  const {
    id,
    sessionID,
    ...rest
  } = data.info;
  try {
    await h.models.Message.upsert({
      id,
      session_id: sessionID,
      time_created,
      data: rest
    }, { transaction: h.tx });
  } catch (err) {
    if (!foreign(err)) throw err;
    log.warn("ignored late message update", {
      messageID: id,
      sessionID
    });
  }
}), SyncEvent.project(MessageV2.Event.Removed, async (h, data) => {
  await h.models.Message.destroy({
    where: { id: data.messageID, session_id: data.sessionID },
    transaction: h.tx
  });
}), SyncEvent.project(MessageV2.Event.PartRemoved, async (h, data) => {
  await h.models.Part.destroy({
    where: { id: data.partID, session_id: data.sessionID },
    transaction: h.tx
  });
}), SyncEvent.project(MessageV2.Event.PartUpdated, async (h, data) => {
  const {
    id,
    messageID,
    sessionID,
    ...rest
  } = data.part;
  try {
    await h.models.Part.upsert({
      id,
      message_id: messageID,
      session_id: sessionID,
      time_created: data.time,
      data: rest
    }, { transaction: h.tx });
  } catch (err) {
    if (!foreign(err)) throw err;
    log.warn("ignored late part update", {
      partID: id,
      messageID,
      sessionID
    });
  }
}), ...nextProjectors];