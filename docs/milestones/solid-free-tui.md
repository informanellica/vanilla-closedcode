# Milestone: vanilla TUI (remove @opentui/* + solid-js from the terminal UI)

> Status: **view layer + SDK chat loop + renderers (markdown/diff/permission/
> question) DONE; flip NOT yet — breadth gaps remain** (2026-06-13). The vanilla
> `tui/vanilla/` shell runs behind `CLOSEDCODE_VANILLA_TUI=1` and, with a server
> url, streams real sessions via `vanilla/data/` (no solid-js/store — immediate-
> mode rev-bump). Assistant markdown, edit/write/revert diffs (indentation
> preserved), tool output, and permission/question modals are first-party +
> adversarially hardened; then a 4-way parallel breadth pass added keybinds
> (leader chords), the command/dialog registry, model/agent/variant selection,
> and syntax highlighting. **507 headless tests green.** @opentui/solid-js stay
> until the remaining gaps clear — chiefly 24-bit theme (ScreenBufferHD),
> mouse/selection, sidebar, plugins — see "Flip-readiness assessment". Sibling of
> `solid-free-reactivity.md` (the desktop renderer milestone). The reactive core
> built there (`lib/reactivity.js`) is reused for TUI state; everything else in
> the TUI rendering stack is replaced by a pure-JavaScript base.

## Goal (decided)

Not merely "drop SolidJS" — **eliminate the native DLL + Yoga + the Solid binding
together and move the TUI to standard JavaScript.** Concretely, remove the entire
`@opentui/*` stack and `solid-js` from the terminal UI:

- remove `solid-js` (reactivity) → reuse first-party `lib/reactivity.js`;
- remove `@opentui/solid` (the Solid→terminal binding / compiled-output runtime);
- remove `@opentui/core` **and its native backend** (`@opentui/core-win32-x64` etc.
  = a ~1.16 MB native `opentui.dll` per platform, called via `bun-ffi-structs`)
  **and `yoga-layout`** (the Flexbox engine `@opentui/core` pulls in);
- no JSX, no compiled output, no custom universal reconciler.

The TUI is rebuilt on a **pure-JS terminal library (`terminal-kit`)** for ANSI
control, key/mouse input, terminal resize, and a delta-drawn `ScreenBuffer`.
Layout is implemented as **app-specific row/column functions** — a general Flexbox
engine is NOT reimplemented.

```
before                          after
@opentui/solid                  TUI controller (state = plain JS objects)
    -> @opentui/core                 -> lib/reactivity.js  (drives render())
        -> Zig native DLL + Yoga      -> terminal-kit       (ScreenBuffer + input + ANSI)
                                          -> Node.js + ANSI terminal
```

## Stage 0 — de-risking PoC  [DONE]

`c:/tmp/tui-poc/chat-poc.mjs` (terminal-kit 3.1.2, pure-JS, no native build). A
minimal chat screen: header + scrolling message list + fullwidth Japanese + input
line + delta `ScreenBuffer.draw`. **Verified:**

- **CJK fullwidth width is correct** (the top risk): `string-kit unicode.width`
  gives `日本語`=6, `あa`=3, emoji=2; `ScreenBuffer` stores a fullwidth glyph as
  char-cell + filler-cell, so columns/cursor never drift on Japanese. Width-aware
  wrapping keeps every line within the terminal width (verified non-interactively).
- **Live on real hardware (user-confirmed):** Japanese renders without column
  drift (wrap + cursor); scrolling (30 dummy lines + long wrapped lines) is smooth
  with delta draw / no flicker; ASCII **and** Japanese/IME input echo correctly;
  resize re-renders; consistent across **WSL / Git Bash / Windows Terminal**
  (emoji width + color OK).

Conclusion: a `terminal-kit` base is viable for this app (Japanese-first i18n).
Keep the PoC as the reference scaffold for Stage T2.

## Inventory (what's being replaced)

- TUI source: `packages/closedcode/src/cli/cmd/tui/` — **112 files / ~24.7k lines**,
  compiled Solid JSX (each imports `_$createElement`/`_$insertNode`/`_$setProp`/
  `_$effect`/`_$memo`/… from `@opentui/solid`, plus `solid-js` core).
- `solid-js` core APIs used: `ErrorBoundary For Index Match Show Switch batch
  createContext createEffect createMemo createResource createSignal getOwner on
  onCleanup onMount runWithOwner useContext` — **all already in `lib/reactivity.js`**.
- `@opentui/solid` runtime used: createElement/createTextNode/insertNode/insert/
  setProp/createComponent/effect/memo/use/spread/mergeProps/render/Portal + hooks
  useRenderer/useTerminalDimensions/useKeyboard + slot helpers.
- `@opentui/core` element set used (the widgets to re-cover with terminal-kit):
  Box, Text, Input, Textarea, Select, TabSelect, ScrollBox, ASCIIFont, Code, Diff,
  Markdown, LineNumber, TextNode — i.e. the dialogs/prompt/timeline building blocks.

## Stages

```
T0  [DONE] de-risking PoC (terminal-kit: CJK / scroll / input / resize / delta).
T1  [DONE, revised] The TUI uses the self-written reactive core DIRECTLY (not a
    later flip). KEY FINDING: real `solid-js` resolves to its SSR build in Node,
    where createEffect is NOT fine-grained-reactive (verified: 0 effect re-runs
    after a signal change). lib/reactivity.js is environment-agnostic
    (node-reactive), so the TUI runtime imports IT, not solid-js — making TUI
    reactivity solid-free from the start. (The runtime currently holds a COPY of
    app/src/lib/reactivity.js at tui/runtime/reactivity.js — TODO: consolidate
    the desktop + TUI copies into one shared module, e.g. packages/core.)
T2  [DONE] thin first-party TUI layer on terminal-kit. **Foundation + widgets**
    (packages/closedcode/src/cli/cmd/tui/runtime/, 53 node tests green — incl. the
    multi-line textarea added in T3):
    - text.js: CJK-aware width/wrap/wordWrap/truncate/sliceCols/fit
    - layout.js: Region (clipped draw) + column/row (fixed+flex) + box
    - scroll.js: bottom-pinned scroll windowing for the chat timeline
    - screen.js: createApp = ScreenBuffer + reactive render loop
      (createRenderEffect -> paint -> delta draw; input dispatched in batch())
    **Widgets DONE** (runtime tests 45/45): input.js (createTextInput — CJK
    code-point cursor + width-aware draw), list.js (createSelectList — roving
    focus + typeahead), focus.js (createKeyRouter LAYER STACK so Escape closes
    only the top dialog + createFocusRing Tab cycling), dialog.js (centerBox).
    → T2 toolkit COMPLETE.
T3  [DONE — view layer] Re-architected the TUI app onto the T2 toolkit as a
    parallel `tui/vanilla/` tree (the immediate-mode replacement for the
    compiled-Solid app.js render model). All four planned stages landed; the whole
    `vanilla/` + `runtime/` graph has ZERO `@opentui` / `solid-js` import
    statements (grep-verified). Headless tests: runtime 53 + vanilla widgets 28 +
    shell 41 + dialogs 12 = 134 green (render each draw() into a detached
    ScreenBuffer, drive with dispatch() — no TTY).
    - Stage 1 (app shell) — vanilla/shell.js createShell(): state is signals
      (route home<->session, timeline, prompt, dialog stack); the view is ONE
      rootDraw(region) = column(body / prompt / status) + a centered dialog
      overlay; keys route through the T2 layer-stack router (base = prompt +
      global hotkeys; a dialog pushes a capturing layer, Escape closes only the
      top). vanilla/logo.js = static cli/logo.js wordmark (shimmer deferred).
      vanilla/theme.js = stand-in token->attr palette. mountShell() = createApp+onKey.
    - Stage 2 (chat loop) — runtime/textarea.js (NEW T2 widget: multi-line,
      code-point cursor, wrap + vertical scroll). vanilla/prompt.js (textarea +
      shell mode "!" + history + agent/model meta, replacing the 1500-line
      compiled-Solid prompt). vanilla/autocomplete.js ("/" commands + "@" files,
      sources injected). vanilla/timeline.js (parts model {role,parts:text/
      reasoning/tool/file}, width-wrap + bottom-pin + PageUp/Down scroll).
    - Stage 3 (dialog families) — vanilla/dialogs.js: promise-returning
      select(filtered) / confirm / alert / prompt bound to the dialog manager
      (onClose resolves on Escape). The SDK-backed dialogs become thin callers
      that pass options + onSelect.
    - Stage 4 (status/misc) — vanilla/toast.js (variant toasts, injectable clock)
      + status-bar mode indicator wired into the shell.
    Deferred to the SDK-integration phase (see "Remaining work"): the animated
    logo shimmer, and the @opentui renderer-only features app.js uses (text
    selection, console overlay, terminal title, debug overlay).
    --- original analysis (kept for context) ---
    The 112
    components (e.g. DialogStatus = 380 lines) are compiled Solid-JSX over
    @opentui's retained Renderable tree with reactive logic (createMemo/For/
    Show/Switch) + context (useTheme/useDialog/useSync). T2 is IMMEDIATE-MODE
    (state -> draw functions), so each component is REWRITTEN as a controller
    (signals + handleKey) + a draw(region) function, and app.js's
    @opentui `render()` mount becomes `createApp(rootDraw)`. This is one coherent
    re-architecture of the render model, not 112 independent ports — sequence it:
    (1) migrate the app shell (app.js render setup, RendererContext ->
        createApp + a root layout: header/timeline/prompt/status),
    (2) the prompt + autocomplete + message timeline (the core chat loop),
    (3) the dialogs (createSelectList/centerBox cover most), grouped by family,
    (4) status/logo/misc.
    Reuse solid-js core (For/Show/createMemo/context) from tui/runtime/reactivity.js
    (NOT node's solid-js — it's SSR/non-reactive). Snapshot-test screens by
    rendering state into a detached ScreenBuffer (works without a TTY, as the
    runtime tests do) + a manual `closedcode tui` smoke per stage.
    Original T2 design notes:
    - a single ScreenBuffer sized to the terminal, redrawn on resize;
    - a render() loop: state -> draw functions -> ScreenBuffer.draw({delta:true});
    - reactivity glue: lib/reactivity effects/memos schedule a (coalesced) render;
    - a small LAYOUT helper set (row/column/box/stack/scroll-region) — app-specific,
      NOT a general Flexbox engine;
    - width-aware text (wrap/truncate/align via string-kit unicode.width);
    - input/keymap + focus model (terminal-kit grabInput); a reusable input field,
      a list/menu, a scroll view, a dialog/overlay region.
    This is the novel work — a minimal retained-or-immediate view toolkit that
    replaces the @opentui/core widget set the TUI actually uses.
T3  Port the 112 TUI components from compiled-Solid-JSX-over-@opentui to the T2
    toolkit. Group by family (dialogs, prompt/autocomplete, timeline, status,
    logo). State stays in plain objects + lib/reactivity signals; views become
    draw functions / small widgets. (This is the bulk — a TUI view-layer rewrite.)
T4  [PARTIAL — runnable flip done; full removal gated] The vanilla shell is now
    launchable: thread.js / attach.js gate their lazy `import("./app.js")` on
    `CLOSEDCODE_VANILLA_TUI` — set it to 1 to load vanilla/main.js (a drop-in
    `tui(input)` that mounts the shell on terminal-kit), else the default @opentui
    app (no regression). vanilla/main.js's graph is native-free: terminal-kit +
    the first-party runtime only, no @opentui/solid-js/yoga.
    (terminal-kit is ALREADY a dep — added in T2, package.json "terminal-kit":
    "^3.1.2".) NOT yet done (blocked on the SDK-integration phase below):
    physically removing @opentui/* + solid-js + yoga-layout from package.json,
    because the live app.js path still needs them until the vanilla shell is
    SDK-connected and promoted to default.
T5  [PARTIAL] Verify: (a)+(b) DONE — unit + detached-ScreenBuffer snapshot tests,
    134 green across runtime/widgets/shell/dialogs (no TTY needed); plus a module-
    load + import-graph check that vanilla/main.js pulls no @opentui/solid-js.
    (c) PENDING — a manual `CLOSEDCODE_VANILLA_TUI=1 closedcode` smoke across WSL /
    Git Bash / Windows Terminal (needs a real TTY).
```

## Remaining work (to actually delete @opentui)

The T3 view layer is a faithful, tested REBUILD, but it is not yet wired to the
backend. Before @opentui/solid-js/yoga can be removed and the vanilla shell made
default:

**Step 0 [DONE 2026-06-13] — fix the confirmed bugs an external review reproduced**
(10 bugs, all with regression tests; the 5 marked SDK-critical would be hit the
moment streaming/stacked-dialogs land): CJK loss in wordWrap (long no-space word
not hard-wrapped); stacked-dialog Escape double-pop; Ctrl-C dead behind a modal
(added a global key path); no terminal-restore on a draw/handler throw (screen.js
error net + a new test suite for the previously-untested loop); timeline
re-entrant setOffset during draw + scroll drift on append (now an absolute-from-
top scroll model, draw is pure); idle toasts never expiring (repaint scheduled at
duration); toast CJK off-screen (.length -> display width); typeahead default
clock stuck open; history Up<->Down round-trip; `--prompt "!…"` tripping shell
mode (setText path).

Then an in-house adversarial multi-agent pass (independently verify all 10 fixes +
hunt the changed code for NEW bugs + refute each) confirmed the 10 fixes correct,
flagged 2 regression tests that passed trivially on old code (timeline / typeahead
— now strengthened), and surfaced **6 more confirmed bugs** (4 candidates refuted):
createFocusRing Shift-Tab (terminal-kit emits a distinct SHIFT_TAB key, not
TAB+shift); paint() after stop() redrawing over the restored terminal (a deferred
toast timer) — paint now bails when !running; prompt history desync after editing
mid-browse (history.reset() on edit/setText); PageUp on a viewport-fitting timeline
breaking bottom-follow (no-op when nothing to scroll); wrap() phantom empty line for
an over-wide glyph; textarea cursor landing on the previous row's trailing cell at a
CJK soft-wrap boundary (piece-width predicate). Test totals after Step 0: **179 green**
(runtime 63 / screen 9 / widgets 48 / shell 43 / dialogs 16).

Then the **SDK-integration phase**:

KEY INSIGHT: the SDK client (`createClosedcodeClient` from `sdk/v2`) is pure
HTTP/SSE — no @opentui/solid in its graph — and because the vanilla shell is
immediate-mode (one render effect repaints the whole screen), it does NOT need
solid-js/store's fine-grained reactivity / reconcile identity. So the 435-line
`context/sync.js` reducer collapses to plain in-place mutation + one `rev` signal
bump per event batch.

1. [DONE — core] `vanilla/data/`: store.js (event reducer for the v1
   message+part model -> a `timeline(sessionID)` mapped to {role,parts}; session/
   message/part/permission/question; `sessionStatusText`), index.js (SDK actions
   submit/abort/findFiles/bootstrap/syncSession + the coalesced event loop, sdk +
   ids injected), connection.js (real createClosedcodeClient + Identifier.ascending
   ids). main.js builds it when input.url is present (else stub). Shell wired
   dual-mode (timeline streams, prompt submit hits the SDK, model/agent dialogs
   list real providers/agents, `/`-autocomplete merges server commands, `@` ->
   sdk.find.files). 224 green incl. an 18-case shell-data integration test
   (full submit -> create/prompt -> streamed events -> render).
   REMAINING for steps 1-3: model/agent SELECTION persistence + variants
   (local.js cycle/favorite/variant); the permission + question PROMPT widgets
   (data is captured, no interactive UI yet); the session-list / rename / stash /
   skill / provider-connect dialogs; sidebar + todo + diff; theme from the real
   ThemeProvider (24-bit). keybind/project/editor contexts.
2. [DONE — core] streaming wired (message.part.delta concatenation -> timeline);
   real session create/switch/abort. (permission/question prompts: remaining.)
3. [DONE — core] real sources fed: providers/agents -> model/agent dialogs;
   sdk.find.files -> `@`; server command.list merged into `/`. (session/theme
   lists + frecency sort: remaining.)
   permission + question PROMPT widgets: [DONE] vanilla/prompts.js (data-driven
   modal; Allow once/always/Reject with the edit diff, question single-select;
   replies via sdk.permission/question.*). Still remaining for 1-3: model/agent
   SELECTION persistence + variants (local.js cycle/favorite/variant); the
   session-list / rename / stash / skill / provider-connect dialogs; sidebar +
   todo + diff; theme from the real ThemeProvider (24-bit); keybind/project/editor.
2. [DONE — core] streaming + permission/question wired.
3. [DONE — core] real sources fed (providers/agents, find.files, command.list).
4. [DONE] the non-trivial renderers, previously handed to @opentui/core, are now
   first-party (richtext.js styled segments + markdown.js + diff.js): assistant
   markdown (headings/bold/italic/code/lists/quote/fence/hr/links), unified +
   LCS diffs (edit/write/revert) with preserved indentation, tool output. Hardened
   by a 19-agent adversarial bug-hunt (10 confirmed bugs fixed, all regression-
   tested). STILL OPEN here: per-language syntax HIGHLIGHTING of code blocks
   (currently one codeBlock color, no tree-sitter), and split-diff view.
5. The deferred renderer features (mouse selection/copy, console, terminal title,
   debug overlay) and the animated logo shimmer.
6. THEN T4-final: flip default, prune @opentui/* + solid-js + yoga-layout (keep
   terminal-kit), npm install, confirm no native dep; and T5(c) cross-terminal
   smoke.

### Flip-readiness assessment (2026-06-13) — NOT YET; do not delete @opentui

The hard, novel work is done, plus a large breadth pass (a 4-way parallel build:
keybind / syntax-highlight / command-registry / selection, each new-file + self-
tested, then integrated). **507 headless tests green.** Checklist toward making
the vanilla path DEFAULT (and removing @opentui/solid-js/yoga):
- [x] keybind system — vanilla/keybind.js (leader Ctrl-X chords + configurable map),
      adapter from terminal-kit names, additive to the raw key flow.
- [x] command/dialog registry — vanilla/commands.js: New/Switch/Rename/Delete/
      Compact/Share/Unshare/Export session, Switch model/agent/variant/theme,
      Connect provider, Status, Help, Exit (palette + slash + leader chords).
- [x] model/agent/variant selection + cycle/favorite — vanilla/selection.js
      (in-memory; disk persistence still TODO).
- [x] per-language syntax highlighting — vanilla/syntax.js in markdown fenced code
      (js/ts/json/python/bash + plaintext; exact-tiling, never throws).
STILL OPEN (flipping now would still regress):
- [ ] real ThemeProvider (24-bit color — needs terminal-kit ScreenBufferHD; the
      current stand-in is the 16-color named palette). The biggest visual gap.
- [ ] sidebar (files / todos / diffs), subagent view, timeline-jump dialog
      (needs todo/diff added to the data store).
- [ ] mouse + text selection/copy, paste-image, external editor, drag-drop
      (terminal-kit input; OS-bound, hard to test headlessly).
- [ ] plugin runtime + slots; startup/TTFD; win32 ctrl-c guard / suspend.
- [ ] a few dialogs: stash / skill / mcp / console-org; split-diff view; model
      selection DISK persistence.
Conclusion: the gap is much smaller (keybinds, most dialogs, selection, syntax
done), but the remaining items — chiefly 24-bit theme, mouse/selection, sidebar,
and plugins — mean deleting @opentui now would still regress real usage. Default
stays @opentui; vanilla remains opt-in behind `CLOSEDCODE_VANILLA_TUI=1`.

## Risks / open items

- **Scope: this is a TUI view-layer rewrite** (T2+T3), larger than the desktop
  "internalization" work — because terminal-kit is immediate-mode ScreenBuffer +
  manual layout, not a retained component tree with Flexbox. Budget accordingly;
  stage by component family and keep the app shippable between stages.
- **Layout parity.** The current TUI relies on Yoga Flexbox; T2 must reproduce the
  specific layouts the app uses (timeline, dialogs, prompt, status bars) as
  row/column functions. Inventory the actual layout patterns before T2 design.
- **Widget parity.** Re-cover the @opentui/core widgets the TUI uses (Input/
  Textarea/Select/TabSelect/ScrollBox/Markdown/Code/Diff/ASCIIFont). Markdown/Code
  highlighting and Diff rendering are non-trivial (today handed to @opentui/core).
- **Performance.** Streaming chat redraw via JS ScreenBuffer delta draw (no native
  core). Proven smooth in the PoC at small scale; validate with a long streaming
  session. Coalesce renders (one per frame / microtask), draw only dirty regions.
- **Input/IME.** PoC confirmed ASCII + Japanese input echo; validate full editing
  (multi-line textarea, paste, history, autocomplete) and IME edge cases per OS.
- **Mouse / true-color / terminal quirks** across WSL / Git Bash / Windows Terminal.
- **`plugin` package** declares `@opentui/*` peer deps — coordinate removal/version.
- **Attribution:** terminal-kit is MIT (cronvel) — add to THIRD-PARTY-NOTICES.md
  when adopted. (No code is ported from @opentui, so no @opentui attribution is
  incurred by this path.)

## Effort

T1 is free; T2 (the toolkit) is the hard, novel module; T3 (112 components) is the
bulk but mechanical-ish once T2 exists; T4/T5 are flip + verify. Net: a focused
sub-project, with the upside of a **fully pure-JS, native-free, dependency-minimal
TUI** — matching the stated goal.
