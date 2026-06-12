# Milestone: vanilla TUI (remove @opentui/* + solid-js from the terminal UI)

> Status: **plan; de-risking PoC DONE** (2026-06-12). Sibling of
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
T2  [IN PROGRESS] thin first-party TUI layer on terminal-kit. **Foundation DONE**
    (packages/closedcode/src/cli/cmd/tui/runtime/, 25 node tests green):
    - text.js: CJK-aware width/wrap/wordWrap/truncate/sliceCols/fit
    - layout.js: Region (clipped draw) + column/row (fixed+flex) + box
    - scroll.js: bottom-pinned scroll windowing for the chat timeline
    - screen.js: createApp = ScreenBuffer + reactive render loop
      (createRenderEffect -> paint -> delta draw; input dispatched in batch())
    **Remaining T2 widgets:** Input (cursor/editing/CJK), List/Select (roving
    focus + typeahead), Dialog/overlay region, a focus model + keymap router.
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
T4  Remove @opentui/* (core + solid + native binaries) + solid-js + yoga-layout
    from packages/closedcode (and the `plugin` package). Add terminal-kit. Flip
    any remaining `solid-js` imports -> lib/reactivity (esbuild alias for the
    bundled sidecar/CLI; a Node resolve hook or `#reactivity` #imports alias for
    native-ESM dev). npm install; confirm the tree resolves and no native dep.
T5  Verify: terminal-kit has no headless renderer, so combine (a) unit tests of
    the T2 layout/width/wrap helpers, (b) snapshot tests that render state into a
    detached ScreenBuffer and assert the cell grid (works without a TTY — proven
    in the PoC), and (c) a manual `closedcode tui` smoke across WSL / Git Bash /
    Windows Terminal.
```

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
