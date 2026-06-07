# AGENTS.md — vanilla-closedcode

Project-wide conventions for humans and AI agents working in this repository.
Per-package notes live in each package's own `AGENTS.md`.

## Coding conventions

This is a **vanilla JavaScript** project. The "vanilla" in the name is literal and
is a hard rule:

- **No TypeScript.** No `.ts` / `.tsx` source files. (Ambient `.d.ts` type stubs are
  allowed.) Add types with JSDoc comments when you need them — never introduce a
  TypeScript compile step or author files in TypeScript.
- **No JSX.** Write SolidJS using its plain-JS runtime API (`template`,
  `createComponent`, `insert`, `effect`, …) — the exact form the SolidJS compiler
  emits. Do not author `.jsx` files or use JSX syntax.
- **No React.** The UI framework is SolidJS. Do not add React or React-style
  libraries.

### Why — build-less, source is the runtime

There is **no JSX/TS compile step and no runtime bundler**. The plain `.js` files
under `packages/*/src` ARE the source of truth: the desktop app copies these source
trees and runs them directly ("build-less"). A `.jsx` or `.ts` file would never be
compiled and would silently break the app.

When you open UI code you will see compiled-looking SolidJS, e.g.:

```js
var _tmpl$ = _$template(`<div class="...">`)
return _$createComponent(Show, { get when() { return ready() }, ... })
```

The build-less approach is intentional (no JSX/TS compile step). This raw
SolidJS-**compiler-output form**, however, is **not** the intended end state — it is
incomplete refactoring, tracked as a preview-time issue in
[docs/milestones/pure-vanilla-standardization.md](docs/milestones/pure-vanilla-standardization.md).
Because there is no compile step we cannot reintroduce `.jsx`/`.ts`, but the plain
`.js` should eventually be refactored into a more legible, hand-authored vanilla
SolidJS form. Until then: **edit it in place**, keep edits small and surgical, and
for purely visual changes prefer CSS over touching component code.

## Package-specific notes

- `packages/app/AGENTS.md` — UI (SolidJS) dev & testing
- `packages/closedcode/AGENTS.md` — backend / CLI
- `packages/desktop-electron/AGENTS.md` — Electron desktop shell
