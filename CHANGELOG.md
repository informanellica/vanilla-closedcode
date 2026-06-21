# Changelog

All notable changes to ClosedCode are recorded here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## Versioning / channels

ClosedCode preview builds are not semver-numbered; the build derives its version
string from the **release channel** as `0.0.0-<channel>-<timestamp>`
(`src/packages/script/src/index.js`). The channel is `CLOSEDCODE_CHANNEL` if set,
otherwise the current git branch.

- `0.1.0-preview` — the first public preview line (git tag `v0.1.0-preview`).
- `0.1.0-dev` — the development line that followed the preview.
- `0.1.0` — first stable release (git tag `v0.1.0`), cut from the `0.1.0-dev` line
  (build with `CLOSEDCODE_VERSION=0.1.0`).

## [0.1.0] — 2026-06-20

First stable release, following `0.1.0-preview`. The changes below accumulated on
the `0.1.0-dev` line and ship as `0.1.0`.

### Added — chat-pane workspace & session management
- **Multiple chat sessions as tabs**: the bottom chat pane is now a tabbed
  workspace. `+` opens a new session as a tab; click a tab to switch, the pencil
  renames it inline, and `×` or a **middle-click** closes it.
- **Searchable session-history popup** (the clock icon, dropping down on-screen):
  a search box filters the list, each row reveals **rename** (pencil) and
  **delete** (trash, with a confirm) actions on hover, and a **"もっと読む"
  (load more)** button fetches sessions beyond the synced/trimmed working set.
- **Category tabs (tabs-within-tabs)** across the panels: a `チャット` category
  above the session tabs in the chat pane, `エクスプローラー` on the left sidebar
  and `レビュー` on the right sidebar — a scaffold for future categories such as
  a terminal.
- **Theme-aware pane-resize cursor**: the resize handles use a custom
  double-arrow cursor (a dark arrow on light themes, a light one on dark themes)
  instead of the OS cursor that rendered as a hard-to-see white glyph, plus a
  visible hover divider.

### Fixed — chat-pane workspace
- **Crash when switching session tabs mid-stream**: switching to another tab while
  an assistant turn was still streaming threw `Cannot read properties of undefined
  (reading 'id')` — a `session-turn` render effect read `message().id` during the
  router transition before its `Show` disposed the slot — and tripped the
  session-view error boundary. The read is now guarded.
- **Blank agent selector in the composer**: the agent `<select>` could render
  empty because the vanilla `Select` snapshots its options/current once at build
  time while the built-in agents load asynchronously. It is now re-created
  reactively when the agent list / current agent changes.
- **Splash and main window shown together at startup**: the main window is now
  revealed only after the splash is hidden (hide → show → close), so the two are
  never on screen at once (and there is still no blank gap).

### Added
- **Editor font controls in the toolbar**: Font (default shown as "Consolas (default)",
  plus common monospace choices) and Size (10–22px) selects next to the save button.
  They write to the existing `settings.appearance.font/fontSize` store (fontSize was
  previously unwired); applied via `--font-family-mono` / new `--editor-font-size`
  CSS variables, pinned onto CodeMirror, and persisted across restarts.
- **Toolbar UI-language switcher** (far right, next to theme/settings/help): a compact
  native select showing locale codes (JA/EN/…); switching re-renders all reactive
  i18n text live via `language.setLocale`.
- **Playwright e2e suite for the desktop app**: `boot-smoke` (boots past the crash
  page — caught every boot-killer below), `opened-folder-name`, `model-selector`,
  `settings-smoke` (dialog opens populated, tabs switch) and `prompt-send-button`
  (regression: the send button must enable once the prompt has text); plus a
  `window.__closedcode_openProject` hook because the router runs on memory
  integration over `oc://` (pushState/popstate cannot navigate it). The hook is
  only installed when the app is launched with `CLOSEDCODE_REMOTE_DEBUG` (the e2e
  harness), so it does not exist on a normal run.

### Changed
- **The entire renderer is now hand-written vanilla JS** — the "Pure Vanilla"
  roadmap goal for our own UI code is complete. Every non-storybook file under
  `packages/app/src` (about 150 files across `bs/`, `vendor/ui`, `components`,
  `pages`, `context`, `lib` — including the giants `message-part.js` (2,762
  lines), `layout.js`, `session.js`, `prompt-input.js`, `app.js` and
  `entry.js`) has had its SolidJS compiler output (`_$template` /
  `_$createComponent` / positional `firstChild` wiring) replaced with template
  literals + `data-slot` lookups, `createEffect`-driven text/attributes and
  plain `addEventListener`. Reactivity still runs on solid-js core
  (`createSignal/Memo/Effect`, contexts — the documented next step is replacing
  that too); the only remaining `solid-js/web` imports are its public API
  (`render`, `insert` for presence-gated Kobalte content, `Dynamic`), each with
  an in-file justification. Conversion was verified per batch against the
  compiled originals (API/contract parity, the project's Solid-interop trap
  list) plus the e2e suite, with several real pre-existing bugs fixed along the
  way (vendor text-field frozen copy button, icon-button object-style
  stringification, i18n fallback dict missing ui.* keys).

### Changed
- **ORM migrated: Drizzle -> Sequelize** (roadmap backlog item). The data layer
  now runs on `sequelize@6` + `sqlite3` (N-API; ABI-stable for both plain Node
  and the Electron-main sidecar import — no rebuild step). The SQL migration
  journal remains the single source of schema truth: the same
  `migration/*/migration.sql` files are applied through the Sequelize
  connection (journal table kept), and the models are pure mappers
  (`tableName` explicit, `timestamps: false`, `sync()` never used). The legacy
  synchronous ambient-transaction layer (`node:sqlite` + LocalContext) became
  an async one: `Database.useAsync` / `transactionAsync` (AsyncLocalStorage
  ambient transactions, commit-deferred `effectAsync`, `BEGIN IMMEDIATE`
  support). All 28 modules converted; async-ness propagated through
  `MessageV2.page/get/parts/stream`, `Session.listGlobal`, `Project.list/get`,
  `SyncEvent.*` and their callers. drizzle-orm / drizzle-kit and the `*.sql.js`
  table definitions are gone. **Data preservation proven** on a copy of a real
  user database (all 15 tables / every row identical across the swap).
  Notable layer findings (documented in
  `docs/milestones/orm-sequelize-migration.md`): the sqlite dialect type-parses
  by DECLARED column type so JSON columns are parsed in model getters;
  attribute descriptors must be per-model factories (Sequelize mutates them);
  `notNull` validation precedes create hooks (timestamps via `beforeValidate`);
  and managed `sequelize.transaction()` deadlocks with a 1-connection pool when
  the Effect runtime drops AsyncLocalStorage context — transactions are
  hand-rolled `BEGIN/COMMIT` on the single shared connection, the same
  execution model as the old synchronous layer. Accepted deltas: bulk
  `Model.update` does not auto-bump `time_updated`; `upsert` rewrites all
  provided columns on conflict.

### Changed
- **Pure Vanilla Standardization stages 1–4 implemented** (roadmap milestone).
  *Engine/CLI:* the `@/` / `@tui/` aliases (1,400 sites) moved to standard
  `package.json#imports` — specifiers are `#util/x.js` style because `#/...` is
  invalid per the Node spec (Node tolerates it; esbuild rejects it) — so
  **`node src/index.js` runs with no loader and no bundle**. All 28
  `import x from "./x.txt"` prompt/description imports now read through
  `src/util/asset.js` (standard `fs.readFileSync(new URL(...))`); the build
  ships `src/**/*.txt` as an `assets/` tree next to the bundle. The TUI loads
  lazily so `@opentui/core`'s `.scm`/`.ts` imports (third-party wall) are off
  the startup path. *Renderer:* first-party modules are served **verbatim** —
  bare and `@/` specifiers resolve via an **import map** generated at startup
  and injected into the served HTML; the `oc://` rewriter now only touches
  files under `node_modules/` (CJS interop, module workers). Asset imports
  became `new URL(...).href` (17 sites). *Verification:* the jest suite shows
  **zero regressions** vs. the pre-change baseline (the suite's long-standing
  red set is unchanged; all 10 differing suites pass individually), desktop
  e2e suite green. esbuild remains for distribution bundles only — see
  `docs/milestones/pure-vanilla-standardization.md` for the Stage 5 inventory.

- **`pages/home.js` rewritten in pure vanilla JS** (first pages-layer file with zero
  `solid-js/web` compiler output): template literal + `querySelector` skeleton,
  imperative DOM driven by `createEffect`/`createMemo` so i18n labels, server
  status and the recent-projects list stay fully reactive.
- **`components/dialog-settings.js` rewritten in pure vanilla JS** — the first file
  produced by the GUI self-improvement loop: gpt-oss:120b was driven through the
  desktop app itself (Playwright over CDP typing the prompt and verifying the edit
  via git), then the output was reviewed and repaired by hand (a `{ get children: fn }`
  syntax error, a missing `createEffect` import, and the lost top/bottom tab-list
  layout). Zero `solid-js/web` compiler output remains in the file.
- New-file "+" tab no longer writes an empty file to disk on open; the file is only
  written when Save is pressed.
- Read-only editor mode icon changed to `bi-file-earmark-lock`.

### Fixed
- **Hardened the hand-written vanilla UI layer (`bs/` + vendor primitives) against a
  family of Solid-interop bugs** (all "compiles fine, dies on the real DOM"):
  three boot-killing crashes (`DropdownMenuTrigger` passing a component function to
  `createElement`; 13 copies of `applyClassList` and 2 more in select/provider-icon
  throwing on space-separated class keys); blank settings dialog (Tabs depended on
  module-scope context evaluation order — redesigned to DOM-walking sync with root
  click delegation, plus live tracking of controlled `value` so externally-driven
  tabs don't go blank); frozen conditional UI (12 copies of `appendChildren`
  evaluating function children once — now delegated to `solid-js/web` `insert()`);
  model picker restored to the searchable popover with all models listed, deduped
  (config + API discovery), correctly anchored (vanilla Button now forwards Solid
  `ref`s for Kobalte) and with working buttons inside tooltips (`cloneNode` dropped
  listeners — clones removed); file-tab bar rendered below the editor and tab labels
  showed `[object HTMLDivElement]` (layout classes removed from the Tabs root to
  match upstream; Node-valued `closeButton` appended instead of stringified);
  file-tree M markers missing on nested paths (normalized-key lookups) and parent
  folders collapsing when expanding a child (Collapsible click bubbling); a `search`
  tool (grep alias) so models that insist on calling `search` stop spinning;
  leftover opencode logos removed; `serve`'s `listen()` path also disables the
  request timeouts (later restricted to explicit loopback binds — see the review
  round 2/3 entry below).

- **Prompt send button stuck disabled forever.** The vanilla `IconButton`/`Button`
  read getter props (`disabled`, `icon`, `aria-label`, …) once at creation, so the
  send button froze in its boot state (empty prompt = disabled) and the send ⇄ stop
  icon never swapped. Attribute props are now re-applied inside a
  `createRenderEffect` (removed when they turn `false`/`null`), the icon is swapped
  reactively, and `IconButton` forwards Solid `ref`s like `Button`.

- **Tool names rendered doubled ("ShellShell", "ExploringExploring") in the chat
  transcript.** The vanilla `TextShimmer` emitted its two text copies as siblings
  with the wrong slot names, so the CSS overlay (`char` > `char-base` +
  `char-shimmer` stacked via `grid-area: 1/1`) never applied and both copies showed
  side by side. The DOM now matches the stylesheet, and `TextShimmer` /
  `ToolStatusTitle` track `active` and i18n texts live instead of reading them once
  (the running ⇄ done crossfade works again).

- **Jagged window/taskbar icon on dev-channel builds.** `icons/dev/icon.ico` only
  contained small sizes (23 KB) and Windows upscaled them; dev now ships the same
  multi-resolution icon as prod (372 KB). The DEV badge in the titlebar remains the
  channel indicator.

- **`closedcode run` no longer hangs before starting on a non-TTY stdin that never
  reaches EOF.** When launched in the background or with an inherited pipe/tty
  (CI, `&`, redirected harnesses), the old `for await (… process.stdin)` waited for
  EOF that never came, wedging the run before the in-process server and agent loop
  even started — an intermittent "no output / no edit" hang with an empty log,
  easy to mistake for a model or integration failure. Piped stdin is now read with
  a **first-byte grace window** (`CLOSEDCODE_STDIN_IDLE_MS`, default 250 ms), applied
  **only when an argv message was given** (stdin is auxiliary there and may be an
  inherited pipe that never closes). When stdin is the *sole* input source —
  `(sleep 1; echo "fix this") | closedcode run` — the run waits for real EOF, so a
  slow first byte cannot lose the message. Once any data is seen it is always read
  to EOF, so streaming with gaps is never truncated; with an argv message, input
  whose *first* byte arrives after the window is treated as no input by design.
  `readPipedStdin` lives in `src/cli/stdin.js` (stream-injectable) with the
  trade-off documented by unit tests in `test/cli/stdin.test.js`.
  (`fix/cli-server-startup-hang`, `fix/review-feedback-round2`)

- **Review feedback round 2** (from the `0.1.0-dev` diff review):
  `AnimatedCountLabel` had lost its reactivity in the vanilla rewrite —
  `props.count` was read once, freezing the tool-count summaries mid-turn and
  dropping the digit-roll animation; `AnimatedNumber` is restored and the
  singular/plural label now follows the live count. `TabsRoot` set its context
  *after* `splitProps` had already evaluated the `children` getter, so `Tabs.List`
  built as horizontal (DOM-probed in the settings dialog: root `vertical`, list
  `horizontal` — dialog CSS happened to mask it); the context is now set before
  props are touched, and `settings-smoke` asserts `data-orientation="vertical"` +
  `flex-column` on the list. `serve`'s `listen()` zeroes
  `requestTimeout`/`headersTimeout` **only for explicit loopback binds**
  (`127.0.0.1`/`localhost`/`::1`); an omitted hostname makes Node listen on all
  interfaces, so it keeps Node's defaults too — slow-header connections can no
  longer be held open forever on externally reachable hosts (round 3: the
  `!opts.hostname` case was initially and wrongly treated as loopback). Round 3
  also disposes the Tabs controlled-value effect with its owner (re-opening
  dialogs no longer accumulates effects; standalone roots self-dispose once the
  tabs root leaves the document), makes `Tabs.List` follow a dynamically changed
  orientation, and lets `AnimatedCountLabel` clear its class when it turns null.
  The e2e-hook gate validates `CLOSEDCODE_REMOTE_DEBUG` as a real TCP port
  instead of string truthiness (`"0"`/`"false"` no longer count).

- **Review feedback round 4 — vanilla DropdownMenu lifecycle and reactivity.**
  The document-level `pointerdown`/`keydown` listeners are removed with the
  owning component (`onCleanup`) and additionally self-heal on the first event
  after the menu has left the document; the body-mounted Portal node is removed
  with its owner and registered with the dropdown state; clicks inside the
  portaled content (search box, checkbox/radio items) are no longer treated as
  outside clicks — the duplicated `rootEl.contains` check now consults
  content/portal. The file-local `splitProps` forwards **getters** instead of
  copying values (matching Solid's semantics), so controlled props
  (`open`/`checked`/`disabled`/radio `value`/`placement`/`gutter`) stay live;
  checkbox/radio items re-apply their checked/disabled state in render effects
  and read `checked` live in the click handler (no more repeating the same
  inverted value). The standalone Tabs fallback root now disposes via a
  MutationObserver (`isConnected` is not reactive, so the previous self-dispose
  only ran if another signal fired); `TextShimmer` clears its class when it
  turns null, like `AnimatedCountLabel`. *Note for diff-only reviewers:*
  `undici` has been a declared direct dependency of `packages/closedcode`
  (`"undici": "5.29.0"`) since `v0.1.0-preview`, so the
  `import { Agent } from "undici"` addition needs no manifest change.

- **Review feedback round 5 — DropdownMenu radio indicators and the remaining
  frozen props.** `RadioItem` now gives its children an item-bound radio context
  — the group's `isSelected(value)` takes the candidate value but
  `ItemIndicator` calls it with no argument, so the radio check mark never
  showed. Plain `Item` tracks `disabled` reactively (CheckboxItem/RadioItem
  already did). A component-typed `as` trigger receives the getter-preserving
  `rest` object as-is — spreading it re-froze signal-backed props
  (disabled/title/aria-*). `sync()` strips every placement class before adding
  the current one (start → end no longer leaves both), and the root re-syncs on
  `placement`/`gutter` changes, not only `open`. Lazily evaluated children
  (Show/For accessors) are re-entered with the menu's module-variable context,
  so conditionally rendered Content/Portal/indicators still wire up to their
  root. `triggerId` was flagged as missing but is already exposed on the
  dropdown state. Ownerless (manual DOM) usage is explicitly unsupported and
  documented in the Portal.

- **Review feedback rounds 6+ — vanilla reactivity shim, TUI data layer, and
  storage hardening.**
  *Reactivity (`packages/app/src/lib/reactivity.js`):* `ErrorBoundary` captures the
  boundary's owner at construction so the fallback/reset run under the boundary, not
  the failed computation; synchronous child throws route through an owner-chain
  `ERROR_KEY` channel (`Suspense`/`Show` included); `Show`'s hide path disposes the
  captured branch for both keyed and non-keyed forms; `mapArray` snapshots `items`
  before diffing; `Switch`/`Match` invoke render-prop children. (reactivity 22/22.)
  *TUI (`cli/cmd/tui/vanilla`):* the data layer unwraps the GlobalBus
  `{directory,payload}` envelope and drops events addressed to other directories, so
  live message/status/permission/question events are no longer dropped as
  `type === undefined` (permission and question prompts appear again); `tui.*`
  control events route to a shell-registered handler
  (toast/prompt/command/session-select); bootstrap lists sessions with no 30-day
  cutoff so `--continue` finds idle sessions; `submit()` is non-blocking
  (shell/command fire-and-forget, prompt via `promptAsync`); `syncSession` marks a
  session synced only after a successful hydrate and guards against concurrent
  double-fetch; `--continue` picks the most recent session by `time.updated`, and
  `--model` / `--fork` are honored. (data 15/15, store 21/21.)
  *Storage:* top-level `transactionAsync` calls serialize through a synchronous
  mutex chain so two concurrent callers can't issue overlapping `BEGIN`s on the
  single pooled connection (pool max 1); the legacy event flag-off path returns a
  resolved promise instead of `undefined`; the desktop sidecar prepares its server
  env (password) before the migration probe; the JSON-import path carries
  `workspace_id`/`agent`/`model` onto session rows.
  (storage/sync/control-plane jest 83/83.)

### Changed
- **Linux ships a glibc (Debian-built) release only.** The Linux CLI/TUI SEA binary
  is built on `node:22` (Debian bookworm, glibc) via `Dockerfile.sea-linux`; the npm
  wrapper's `optionalDependencies` are `windows-x64`, `linux-x64`, `linux-arm64`,
  `darwin-x64`, `darwin-arm64` — **glibc only** (musl/Alpine is not a build target
  this release). `linux-arm64` is declared for forward-compatibility but not yet
  published; npm skips any optional dependency that isn't published, so x64/darwin
  installs are unaffected.
- **Non-SEA (ESM) build emits a `bin/worker.js` sidecar and pins runtime deps.**
  `package.json#runtimeDeps` now include `sequelize`/`sqlite3`/`bindings`/
  `file-uri-to-path` and `@parcel/watcher` (plus its native binding) so a plain
  `node bin/closedcode.js` install resolves them; the worker path stays SEA-only.

### Documentation
- **Full JSDoc coverage of the own-source JavaScript** (engine, renderer, scripts;
  third-party `vendor/` and tests excluded) with `@module` normalization, and the
  HTML **API reference regenerated** with bilingual (en/ja) post-processed output
  (`DOC_LANG` + `docs-i18n/ja.json`). Source comments remain English-only; the
  comments-only nature of the pass was verified by esbuild AST comparison.

## [0.1.0-preview] — 2026-06-07

First public preview release (git tag `v0.1.0-preview`): Windows (64-bit) installer
and macOS (Apple Silicon) build. See `docs/` for the landing page and manual.
