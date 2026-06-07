import sessionProjectors from "../session/projectors.js";
import { SyncEvent } from "@/sync/index.js";
import { Session } from "@/session/session.js";
import { SessionTable } from "@/session/session.sql.js";
import { Database } from "@/storage/db.js";
import { eq } from "drizzle-orm";
export function initProjectors() {
  SyncEvent.init({
    projectors: sessionProjectors,
    convertEvent: (type, data) => {
      if (type === "session.updated") {
        const id = data.sessionID;
        const row = Database.use(db => db.select().from(SessionTable).where(eq(SessionTable.id, id)).get());
        if (!row) return data;
        return {
          sessionID: id,
          info: Session.fromRow(row)
        };
      }
      return data;
    }
  });
}
initProjectors();