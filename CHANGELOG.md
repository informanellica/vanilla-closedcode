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

## [0.1.0-preview] — 2026-06-07

First public preview release (git tag `v0.1.0-preview`): Windows (64-bit) installer
and macOS (Apple Silicon) build. See `docs/` for the landing page and manual.
