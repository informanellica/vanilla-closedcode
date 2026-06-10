# Changelog

All notable changes to ClosedCode are recorded here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## Versioning / channels

ClosedCode preview builds are not semver-numbered; the build derives its version
string from the **release channel** as `0.0.0-<channel>-<timestamp>`
(`src/packages/script/src/index.js`). The channel is `CLOSEDCODE_CHANNEL` if set,
otherwise the current git branch.

- `0.1.0-preview` — the first public preview line (git tag `v0.1.0-preview`).
- `0.1.0-dev` — the active development line that supersedes the preview. Build it
  with `CLOSEDCODE_CHANNEL=0.1.0-dev` (e.g. `CLOSEDCODE_CHANNEL=0.1.0-dev npm run build`).

## [Unreleased] — 0.1.0-dev

Development line following `0.1.0-preview`.

### Added
- **Toolbar UI-language switcher** (far right, next to theme/settings/help): a compact
  native select showing locale codes (JA/EN/…); switching re-renders all reactive
  i18n text live via `language.setLocale`.
- **Playwright e2e suite for the desktop app**: `boot-smoke` (boots past the crash
  page — caught every boot-killer below), `opened-folder-name`, `model-selector`;
  plus a `window.__closedcode_openProject` hook because the router runs on memory
  integration over `oc://` (pushState/popstate cannot navigate it).

### Changed
- **`pages/home.js` rewritten in pure vanilla JS** (first pages-layer file with zero
  `solid-js/web` compiler output): template literal + `querySelector` skeleton,
  imperative DOM driven by `createEffect`/`createMemo` so i18n labels, server
  status and the recent-projects list stay fully reactive.
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
  leftover opencode logos removed; `serve`'s `listen()` path also gets
  `requestTimeout/headersTimeout = 0`.

- **`closedcode run` no longer hangs before starting on a non-TTY stdin that never
  reaches EOF.** When launched in the background or with an inherited pipe/tty
  (CI, `&`, redirected harnesses), the old `for await (… process.stdin)` waited for
  EOF that never came, wedging the run before the in-process server and agent loop
  even started — an intermittent "no output / no edit" hang with an empty log,
  easy to mistake for a model or integration failure. Piped stdin is now read with
  a **first-byte grace window** (`CLOSEDCODE_STDIN_IDLE_MS`, default 250 ms): if no
  data arrives the run proceeds; once any data is seen it is read to real EOF, so
  slow/streamed input is never truncated. `echo "msg" | closedcode run` still works.
  (`fix/cli-server-startup-hang`)

## [0.1.0-preview] — 2026-06-07

First public preview release (git tag `v0.1.0-preview`): Windows (64-bit) installer
and macOS (Apple Silicon) build. See `docs/` for the landing page and manual.
