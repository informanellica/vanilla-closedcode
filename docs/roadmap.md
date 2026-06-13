# Roadmap

Future work beyond the `v0.1.0-preview` milestone. Active development now happens on
the `0.1.0-dev` line (see `CHANGELOG.md`). Each item should become a milestone with
its own issues; this file is the high-level index.

## Milestones

- **[Pure Vanilla Standardization](milestones/pure-vanilla-standardization.md)** —
  move our own code to native ESM / `package.json#imports` / import maps / standard
  Node APIs, removing esbuild, the custom loader, and the `oc://` scheme where
  possible (third-party deps remain a documented interop wall).
  **Stages 1–4 implemented** (2026-06-11): engine aliases → `#imports`, text
  assets → fs API, renderer → startup-generated import map with first-party
  modules served verbatim (`oc://` rewriting now third-party-only), main/preload
  verified standard. esbuild remains for distribution bundles only — see the
  milestone's Stage 5 inventory.

## Backlog (future considerations)

- **Local DB at-rest encryption.** The local SQLite store (`closedcode.db`,
  under the data dir) holds session/conversation history, messages, projects, and
  events in **plaintext**. Encrypt it at rest. Technical note: the built-in
  `node:sqlite` driver does **not** support SQLCipher-style encryption, so the
  options are: (a) an OS keystore (Windows DPAPI / macOS Keychain) to hold a key
  plus a SQLCipher-capable driver, (b) app-level encryption of sensitive columns,
  or (c) relying on full-disk encryption. Decide the threat model first.

- **VS Code extension (standalone, NOT via Copilot).** Ship a first-party VS Code
  extension as a **new front-end onto the same engine (Model)** — a sibling of the
  desktop GUI and the CLI, not a wrapper around either. It must be a fully
  independent app: it does **not** route through GitHub Copilot, the Copilot Chat
  API, or `vscode.lm` / Language Model API, and requires no Copilot subscription.
  The extension spawns / connects to the `closedcode` sidecar (the same HTTP SDK
  the GUI uses) and talks to the user's own configured providers (including local
  LLMs), preserving the no-egress design. Surface it through native VS Code UI
  (a chat/agent view, editor actions, the command palette) so it is usable inside
  the editor while remaining provider- and Copilot-independent.

## Recently completed (formerly backlog)

Verified against the codebase 2026-06-13 (the two items below were previously listed
as backlog but are now effectively done):

- **ORM migration: Drizzle → Sequelize — done at runtime.** The data layer is fully
  on **Sequelize v6** (`src/storage/sequelize.js` defines the models; `db.js` exposes
  the async `useAsync`/`transactionAsync`/`ormInit` layer; `migrate.js` runs the raw
  SQL journal through the Sequelize connection). There are **zero** `drizzle-orm` /
  `drizzle-kit` imports in runtime source. Residual cleanup only (non-runtime):
  - Remove the now-unused `drizzle-orm` dependency from
    `packages/closedcode/package.json` (and uninstall it).
  - Delete the orphaned `packages/closedcode/drizzle.config.js` (imports `drizzle-kit`,
    points at `*.sql.ts` files that no longer exist).
  - Update/remove 3 stale tests that still import `eq` from `drizzle-orm` + the deleted
    `#session/session.sql.js` and call the removed synchronous `Database.use`:
    `test/server/{session-list,httpapi-session,httpapi-workspace-routing}.test.js`.
  - Fix the stale comment in `src/storage/schema.js` claiming the `*.sql.js` table
    defs still exist (they are all deleted).

- **SolidJS-compiler-output UI refactor — done.** The renderer under
  `packages/app/src` (including `pages/home.js`) is rewritten to the prescribed style:
  static skeleton in a template literal with `data-slot` placeholders,
  `querySelector("[data-slot=…]")` binding, `textContent` for dynamic text,
  `replaceChildren(…)` for lists, `addEventListener` for events. No renderer page or
  component contains real compiler output. The only `_$template` / `_$createComponent`
  holdouts are `*.stories.js` Storybook demos under `vendor/ui/components/`, which are
  not the renderer UI and are out of scope.

## Known preview-time issues

Tracked in the milestones (see
[pure-vanilla-standardization](milestones/pure-vanilla-standardization.md) →
"Known preview-time issues"): Windows e2e cold-start flakiness (renderer launch +
per-test DB migration). (The previously-listed "compiled-looking SolidJS UI source"
is resolved — see "Recently completed" above.)
