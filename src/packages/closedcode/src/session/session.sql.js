import { sqliteTable, text, integer, index, primaryKey } from "drizzle-orm/sqlite-core";
import { ProjectTable } from "../project/project.sql.js";
import { Timestamps } from "../storage/schema.sql.js";
export const SessionTable = sqliteTable("session", {
  id: text().$type().primaryKey(),
  project_id: text().$type().notNull().references(() => ProjectTable.id, {
    onDelete: "cascade"
  }),
  workspace_id: text().$type(),
  parent_id: text().$type(),
  slug: text().notNull(),
  directory: text().notNull(),
  path: text(),
  title: text().notNull(),
  version: text().notNull(),
  share_url: text(),
  summary_additions: integer(),
  summary_deletions: integer(),
  summary_files: integer(),
  summary_diffs: text({
    mode: "json"
  }).$type(),
  revert: text({
    mode: "json"
  }).$type(),
  permission: text({
    mode: "json"
  }).$type(),
  agent: text(),
  model: text({
    mode: "json"
  }).$type(),
  ...Timestamps,
  time_compacting: integer(),
  time_archived: integer()
}, table => [index("session_project_idx").on(table.project_id), index("session_workspace_idx").on(table.workspace_id), index("session_parent_idx").on(table.parent_id)]);
export const MessageTable = sqliteTable("message", {
  id: text().$type().primaryKey(),
  session_id: text().$type().notNull().references(() => SessionTable.id, {
    onDelete: "cascade"
  }),
  ...Timestamps,
  data: text({
    mode: "json"
  }).notNull().$type()
}, table => [index("message_session_time_created_id_idx").on(table.session_id, table.time_created, table.id)]);
export const PartTable = sqliteTable("part", {
  id: text().$type().primaryKey(),
  message_id: text().$type().notNull().references(() => MessageTable.id, {
    onDelete: "cascade"
  }),
  session_id: text().$type().notNull(),
  ...Timestamps,
  data: text({
    mode: "json"
  }).notNull().$type()
}, table => [index("part_message_id_id_idx").on(table.message_id, table.id), index("part_session_idx").on(table.session_id)]);
export const TodoTable = sqliteTable("todo", {
  session_id: text().$type().notNull().references(() => SessionTable.id, {
    onDelete: "cascade"
  }),
  content: text().notNull(),
  status: text().notNull(),
  priority: text().notNull(),
  position: integer().notNull(),
  ...Timestamps
}, table => [primaryKey({
  columns: [table.session_id, table.position]
}), index("todo_session_idx").on(table.session_id)]);
export const SessionMessageTable = sqliteTable("session_message", {
  id: text().$type().primaryKey(),
  session_id: text().$type().notNull().references(() => SessionTable.id, {
    onDelete: "cascade"
  }),
  type: text().$type().notNull(),
  ...Timestamps,
  data: text({
    mode: "json"
  }).notNull().$type()
}, table => [index("session_message_session_idx").on(table.session_id), index("session_message_session_type_idx").on(table.session_id, table.type), index("session_message_time_created_idx").on(table.time_created)]);
export const PermissionTable = sqliteTable("permission", {
  project_id: text().primaryKey().references(() => ProjectTable.id, {
    onDelete: "cascade"
  }),
  ...Timestamps,
  data: text({
    mode: "json"
  }).notNull().$type()
});