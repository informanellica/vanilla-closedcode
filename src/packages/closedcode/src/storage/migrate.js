// Journal-style SQL migration runner (ORM migration S2). Driver-agnostic:
// the same migration.sql entries + __drizzle_migrations journal (table name
// kept for continuity with existing user databases) applied through the
// Sequelize connection.
/**
 * @file Journal-style SQL migration runner. Applies migration.sql entries
 * through a Sequelize connection, tracking applied entries in the
 * __drizzle_migrations journal table.
 */

/**
 * Split a migration's SQL text into individual statements on the
 * statement-breakpoint marker, trimming and dropping empties.
 * @param {string} sqlText - The full migration SQL text.
 * @returns {Array<string>} The individual SQL statements.
 */
export function splitStatements(sqlText) {
  return sqlText
    .split("--> statement-breakpoint")
    .map(s => s.trim())
    .filter(Boolean);
}

const JOURNAL_DDL =
  "CREATE TABLE IF NOT EXISTS __drizzle_migrations (" +
  "id INTEGER PRIMARY KEY AUTOINCREMENT, hash text NOT NULL, created_at numeric)";

/**
 * Apply pending migrations: ensure the journal table exists, then run each
 * entry newer than the last recorded timestamp in its own transaction and
 * record it in the journal.
 * @param {Sequelize} sequelize - The Sequelize connection to run against.
 * @param {Array<Object>} entries - Ordered migration entries, each {sql, timestamp, name}.
 * @returns {Promise<void>} Promise that resolves once all pending migrations are applied.
 */
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
