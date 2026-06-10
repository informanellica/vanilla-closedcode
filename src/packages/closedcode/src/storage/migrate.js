// Journal-style SQL migration runner (ORM migration S2). Driver-agnostic:
// the same migration.sql entries + __drizzle_migrations journal (table name
// kept for continuity with existing user databases) applied either through
// the legacy node:sqlite DatabaseSync client or the Sequelize connection.
export function splitStatements(sqlText) {
  return sqlText
    .split("--> statement-breakpoint")
    .map(s => s.trim())
    .filter(Boolean);
}

const JOURNAL_DDL =
  "CREATE TABLE IF NOT EXISTS __drizzle_migrations (" +
  "id INTEGER PRIMARY KEY AUTOINCREMENT, hash text NOT NULL, created_at numeric)";

export function applyMigrationsSync(client, entries) {
  client.exec(JOURNAL_DDL);
  const last = client.prepare("SELECT MAX(created_at) AS created_at FROM __drizzle_migrations").get();
  const lastAt = last?.created_at ?? 0;
  for (const entry of entries) {
    if (entry.timestamp <= lastAt) continue;
    client.exec("BEGIN");
    try {
      for (const stmt of splitStatements(entry.sql)) client.exec(stmt);
      client.prepare("INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)").run(entry.name, entry.timestamp);
      client.exec("COMMIT");
    } catch (e) {
      client.exec("ROLLBACK");
      throw e;
    }
  }
}

export async function applyMigrationsAsync(sequelize, entries) {
  await sequelize.query(JOURNAL_DDL);
  const [rows] = await sequelize.query("SELECT MAX(created_at) AS created_at FROM __drizzle_migrations");
  const lastAt = rows?.[0]?.created_at ?? 0;
  for (const entry of entries) {
    if (entry.timestamp <= lastAt) continue;
    await sequelize.transaction(async transaction => {
      for (const stmt of splitStatements(entry.sql)) {
        await sequelize.query(stmt, { transaction });
      }
      await sequelize.query("INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)", {
        replacements: [entry.name, entry.timestamp],
        transaction,
      });
    });
  }
}
