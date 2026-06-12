import sessionProjectors from "../session/projectors.js";
import { SyncEvent } from "#sync/index.js";
import { Session } from "#session/session.js";
import { Database } from "#storage/db.js";
const plain = row => (row == null ? undefined : row.get({ plain: true }));
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
