# Milestone: ORM migration — Drizzle → Sequelize

> Status: **in progress** (dedicated branch `feat/orm-sequelize`)
> Constraint: the existing `closedcode.db` schema and user data are preserved
> byte-for-byte; the SQL migration journal stays the single source of schema.

## Inventory (2026-06-11)

- 28 files import `drizzle-orm`; 7 schema files (`*.sql.js`, drizzle
  `sqliteTable` definitions): account (3 tables), project, session
  (session/message/part), share, sync/event (2), control-plane/workspace,
  storage/schema (Timestamps helper).
- Driver: built-in `node:sqlite` `DatabaseSync` via `drizzle-orm/node-sqlite`
  (`#db` conditional import).
- Migrations: raw SQL under `migration/<timestamp>_<name>/migration.sql`,
  embedded at build as `CLOSEDCODE_MIGRATIONS`, applied by a custom journal
  runner in `storage/db.js` (`__drizzle_migrations` table).
- Access layer: `Database.use(cb)` / `Database.transaction(cb)` are
  **synchronous** with a LocalContext-based ambient transaction; `effect(fn)`
  defers side effects until the ambient tx commits. Call sites: ~70 `.select(`,
  ~23 `.update(`, ~16 `.insert(`, 6 `.transaction(`, plus Effect-wrapped
  helpers (`yield* db(d => ...)`).

## Decisions

1. **Sequelize v6 + `sqlite3`** (N-API; ABI-stable for both plain Node and the
   Electron-main sidecar import — no electron-rebuild step, unlike node-pty).
2. **Schema stays SQL-first.** The journal runner keeps applying the same
   `migration.sql` files (journal table renamed conceptually but kept
   physically as `__drizzle_migrations` for continuity). Sequelize models are
   *mappers* over existing tables: `tableName` explicit, `timestamps: false`,
   attributes mirror `*.sql.js` (time_created/time_updated handled by hooks to
   keep `$default/$onUpdate` semantics). `sequelize.sync()` is **never** used.
3. **Ambient transactions move from LocalContext to CLS.**
   `Sequelize.useCLS(new AsyncLocalStorage())`-style continuation-local
   transactions reproduce the `Database.use`-inside-`transaction` nesting; the
   commit-deferred `effect(fn)` hooks map to `transaction.afterCommit`.
4. **Sync → async is the real migration.** Every `Database.use` caller becomes
   async; Effect-generator call sites switch `Effect.sync`-style wrappers to
   `Effect.promise`. This is converted module-by-module, bottom-up, each step
   verified by the module's (green) jest suites + boot/e2e smoke.

## Stages

```
S0  this document + deps (sequelize, sqlite3) on feat/orm-sequelize
S1  storage/sequelize.js: connection (same PRAGMAs), model definitions for all
    tables, CLS wiring; storage/db.js keeps drizzle exports while adding the
    async Database.useAsync/transactionAsync/effect equivalents
S2  migration runner re-pointed at the sqlite3 connection (raw SQL, unchanged
    files; journal table preserved)
S3  module-by-module call-site conversion (leaf-first):
    account → sync/event → share → control-plane/workspace → project →
    server projectors/fence → session (largest) → cli/import/stats
S4  remove drizzle/drizzle-kit deps + #db conditional + node:sqlite usage;
    delete *.sql.js after their model twins are authoritative
S5  data-preservation proof: schema dump (sqlite_master) + row counts byte-
    compared before/after on a copied real DB; full e2e; CHANGELOG
```

## Risks

- `node:sqlite` sync semantics hid write races that async exposes — the CLS
  transaction scope must wrap every multi-statement sequence that was
  previously a sync `transaction()`.
- `sqlite3` adds the first non-pty native dependency to the sidecar; packaged
  app must include its prebuild (electron-builder copies node_modules — verify
  asarUnpack covers .node files).
- JSON columns: drizzle `{ mode: "json" }` auto-(de)serializes; Sequelize
  needs `DataTypes.JSON` (sqlite stores TEXT — same physical format, verify
  byte-identical writes for existing readers).
