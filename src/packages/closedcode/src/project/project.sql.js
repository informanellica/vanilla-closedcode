import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { Timestamps } from "../storage/schema.sql.js";
export const ProjectTable = sqliteTable("project", {
  id: text().$type().primaryKey(),
  worktree: text().notNull(),
  vcs: text(),
  name: text(),
  icon_url: text(),
  icon_url_override: text(),
  icon_color: text(),
  ...Timestamps,
  time_initialized: integer(),
  sandboxes: text({
    mode: "json"
  }).notNull().$type(),
  commands: text({
    mode: "json"
  }).$type()
});