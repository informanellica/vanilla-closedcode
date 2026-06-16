/** @file Wires up sync-event projectors at startup, including a converter that hydrates "session.updated" events with the latest session row. */
import sessionProjectors from "../session/projectors.js";
import { SyncEvent } from "#sync/index.js";
import { Session } from "#session/session.js";
import { Database } from "#storage/db.js";
/**
 * Convert a Sequelize model row to a plain object, or undefined when the row is null/undefined.
 * @param {Object} row - A Sequelize model instance, or null/undefined.
 * @returns {Object} The plain object representation, or undefined.
 */
const plain = row => (row == null ? undefined : row.get({ plain: true }));
/**
 * Register session projectors with the SyncEvent system, supplying a convertEvent hook
 * that, for "session.updated" events, asynchronously loads the session row and emits its
 * hydrated info. Other event types pass their data through unchanged.
 * @returns {void}
 */
export function initProjectors() {
  SyncEvent.init({
    projectors: sessionProjectors,
    convertEvent: (type, data) => {
      if (type === "session.updated") {
        const id = data.sessionID;
        // The session lookup is async under the Sequelize layer; the SyncEvent
        // consumer handles a returned Promise (publishes once it resolves).
        // Other event types keep the synchronous return path.
        return Database.useAsync(async h => {
          const row = plain(await h.models.Session.findOne({ where: { id }, transaction: h.tx }));
          if (!row) return data;
          return {
            sessionID: id,
            info: Session.fromRow(row)
          };
        });
      }
      return data;
    }
  });
}
initProjectors();
