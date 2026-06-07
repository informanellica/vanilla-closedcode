import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { ProjectTable } from "../project/project.sql.js";
export const WorkspaceTable = sqliteTable("workspace", {
  id: text().$type().primaryKey(),
  type: text().notNull(),
  name: text().notNull().default(""),
  branch: text(),
  directory: text(),
  extra: text({
    mode: "json"
  }),
  project_id: text().$type().notNull().references(() => ProjectTable.id, {
    onDelete: "cascade"
  })
});