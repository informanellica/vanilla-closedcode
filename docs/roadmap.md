# Roadmap

Future work beyond the `v0.1.0-preview` milestone. Active development now happens on
the `0.1.0-dev` line (see `CHANGELOG.md`). Each item should become a milestone with
its own issues; this file is the high-level index.

## Milestones

- **[Pure Vanilla Standardization](milestones/pure-vanilla-standardization.md)** —
  move our own code to native ESM / `package.json#imports` / import maps / standard
  Node APIs, removing esbuild, the custom loader, and the `oc://` scheme where
  possible (third-party deps remain a documented interop wall).

## Backlog (future considerations)

- **Local DB at-rest encryption.** The local SQLite store (`closedcode.db`,
  under the data dir) holds session/conversation history, messages, projects, and
  events in **plaintext**. Encrypt it at rest. Technical note: the built-in
  `node:sqlite` driver does **not** support SQLCipher-style encryption, so the
  options are: (a) an OS keystore (Windows DPAPI / macOS Keychain) to hold a key
  plus a SQLCipher-capable driver, (b) app-level encryption of sensitive columns,
  or (c) relying on full-disk encryption. Decide the threat model first.

- **ORM migration: Drizzle → Sequelize.** The data layer currently uses **Drizzle
  ORM** (`drizzle-orm` / `drizzle-kit`) with `*.sql.js` schema files and SQL
  migrations under `packages/closedcode/migration/`. Migrate the ORM to
  **Sequelize** (models, migrations, queries) — a staged swap on a dedicated
  branch that preserves the existing `closedcode.db` schema and user data.

- **Refactor SolidJS-compiler-output UI → template literals + named slots.** Some
  UI files (e.g. `packages/app/src/pages/home.js`) are still in raw SolidJS
  compiler-output form (`_$template` / `_$createComponent` / `_$insert`) and depend
  on positional `firstChild` / `nextSibling` wiring, which is brittle to edit. Since
  there is no JSX/TS compile step we cannot reintroduce `.jsx`; instead rewrite the
  plain `.js` (starting with the home screen) as **template literals + named slots**:
  static skeleton in a template literal with `data-slot` placeholders; dynamic text
  via `textContent` (**not** string interpolation into the literal — XSS / layout
  breakage); dynamic lists via `replaceChildren(...)`; events via `addEventListener`;
  insertion by `querySelector("[data-slot=…]")`. Full guidance and a worked example
  live in the Pure Vanilla milestone (see below).

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

## Known preview-time issues

Tracked in the milestones (see
[pure-vanilla-standardization](milestones/pure-vanilla-standardization.md) →
"Known preview-time issues"): compiled-looking SolidJS UI source to be refactored;
Windows e2e cold-start flakiness (renderer launch + per-test DB migration).
