/**
 * Vanilla TUI runtime (Stage T2 of the solid-free TUI milestone); public API re-exporting the toolkit pieces.
 * @module closedcode/cli/cmd/tui/runtime
 */
// Vanilla TUI runtime (Stage T2 of the solid-free TUI milestone) — public API.
// A pure-JavaScript terminal UI toolkit built on terminal-kit (ANSI / input /
// ScreenBuffer delta draw) + solid-js reactivity, replacing @opentui/solid (the
// Solid->terminal binding) and, after the Stage-T4 flip, solid-js itself. No
// native DLL, no Yoga, no JSX, no custom reconciler: state is plain objects +
// signals, views are draw functions over Regions, layout is app-specific
// row/column splitting.
//
// terminal-kit is MIT (cronvel) — to be added to THIRD-PARTY-NOTICES.md.
export { createApp } from "./screen.js";
export { makeRegion, column, row, box } from "./layout.js";
export { width, wrap, wordWrap, truncate, sliceCols, fit } from "./text.js";
export { wrapMessages, drawScrollLines } from "./scroll.js";
export { createTextInput } from "./input.js";
export { createTextArea } from "./textarea.js";
export { createSelectList } from "./list.js";
export { centerBox } from "./dialog.js";
export { createKeyRouter, createFocusRing } from "./focus.js";
