/**
 * @file Retired schema re-export module. The former drizzle table re-exports
 * are gone; Sequelize models now live in ./sequelize.js and must only be
 * reached via the Database handle. Kept as an empty module for import stability.
 */
// ORM migration S3: the drizzle table re-exports (../*/*.sql.js) are retired.
// The Sequelize models live in ./sequelize.js and must only be reached through
// the Database handle (Database.useAsync / Database.transactionAsync) — never
// imported directly. The legacy drizzle table definitions remain in the
// *.sql.js files as the source for the SQL migration journal.
export {};
