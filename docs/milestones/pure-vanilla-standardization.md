# Milestone: Pure Vanilla Standardization

> Status: **planned** (next milestone after the initial preview release)
> Tracking: split the work below into issues under this milestone.

## Context

The current preview release is **functional** — the app runs, and the main
features needed for public preview are in place. What is *not* finished is the
move to **pure vanilla / standard-API** internals.

Today the codebase is **build-less in places but not pure vanilla**: instead of a
bundler we lean on a custom runtime resolver and a few compatibility layers.
Concretely, some non-standard mechanisms are still relied on:

- `@/foo` style path aliases (esbuild/tsconfig aliases, not standard ESM)
- bare-import / extension / directory-index resolution done by tooling
- asset imports and special files (e.g. `.scm` with `with { type: "file" }`)
- CJS/ESM interop for third-party dependencies
- esbuild builds for the engine/CLI (`script/build.js`, `script/build-node.js`)
- the Electron `oc://` protocol resolver for the renderer

More precisely:

```
now:   build-less (in V/C) + custom runtime resolver / esbuild (in M)
goal:  standard ESM that runs on Node / the browser with no custom resolver
```

So "vanilla" is **partly done**: the View (renderer) and Controller (main/preload)
already run build-less, but no layer is yet "pure vanilla" (the renderer uses
`oc://`, the engine/CLI uses esbuild or a loader).

## Goal

Move our **own** code toward native ESM that resolves with standard mechanisms:
`package.json#imports` (Node), import maps (browser), and standard Node.js APIs —
removing the bundler, the custom loader, and the `oc://` scheme where possible.

## Stages

```
Stage 1: CLI / engine import-alias standardization
         @/ , @tui/ , @test/  ->  package.json#imports ( #/... )
         goal: `node src/index.js` runs with NO custom loader
Stage 2: asset / .scm loading -> standard fs APIs
         fs.readFile(new URL("./x", import.meta.url)); drop `with { type: "file" }`
Stage 3: renderer -> import maps + native ESM (shrink the oc:// resolver)
Stage 4: main / preload -> remove remaining non-standard handling
Stage 5: confirm esbuild / loader dependencies are reduced/removed
```

Each stage removes one compatibility layer and is verified independently
(build-less run + tests), on a dedicated branch, not in the preview release.

## Known limitations (the irreducible wall)

Third-party dependencies (e.g. `effect`, `ai-sdk`, `tree-sitter`, `@opentui/core`)
contain CJS-era / extension-less imports and non-standard imports (e.g. `node:ffi`,
`.scm` file imports) **inside their own packages**. We cannot make those standard
without patching or replacing each dependency. So:

- Pure vanilla is achievable for **our** code (V / C / M).
- A **minimal interop shim** (patch-package / a thin loader entry) will likely
  remain for specific third-party packages. 100% machinery-free across the whole
  dependency graph is not a realistic target.

Target end state: *our code is standard ESM; only a thin, documented interop
layer remains for specific third-party packages.*

## Known preview-time issues (refactor backlog)

These are *not* intended end states — they are areas where the cleanup has not
caught up with the preview release yet. Track them as issues under this milestone.

- **Compiled-looking SolidJS UI source.** Some UI files (e.g.
  `packages/app/src/pages/home.js`) still read like the raw output of the SolidJS
  compiler (`_$template`, `_$createComponent`, `_$insert`, …) and lean on positional
  `firstChild` / `nextSibling` wiring rather than hand-readable vanilla JS. Because
  there is no JSX/TS compile step we cannot reintroduce `.jsx`; instead refactor the
  plain `.js` toward **template literals + named slots**. Recommended shape (the home
  screen is the first candidate):
  - **Static skeleton** in a template literal with `data-slot` placeholders:
    ```js
    const shell = html(`
      <main class="home">
        <header class="home__header">
          <div data-slot="logo"></div>
          <div><h1 data-slot="title"></h1><p data-slot="subtitle"></p></div>
        </header>
        <section class="home__section"><h2>Start</h2><div data-slot="start"></div></section>
        <section class="home__section"><h2>Recent</h2><div data-slot="recent"></div></section>
      </main>
    `);
    ```
  - **Insert by named slot** — `shell.querySelector("[data-slot=logo]").append(LogoEl)`
    — explicit, not positional `firstChild`/`nextSibling`.
  - **Dynamic text** via `slot.textContent = language.t(...)`. Do NOT interpolate
    translation / user strings into the template literal (XSS + layout breakage);
    the template builds the static frame only.
  - **Dynamic lists** via `container.replaceChildren(...)`.
  - **Events** via `addEventListener`.
  Until refactored: edit in place, keep changes small and surgical, and prefer CSS
  over touching component code for purely visual tweaks.

## Out of scope

- Rewriting or vendoring third-party dependencies to remove their internal
  non-standard imports.
- The agent/model/provider identity (`opencode`) kept for upstream compatibility.

---

## 現在の状態（日本語）

本バージョンは主要機能が動作するプレビュー版です。内部実装には、独自ローダ、
ビルド時 alias、第三者ライブラリ向けの互換処理（esbuild / `oc://` など）が一部
残っています。今後、native ESM、`package.json` の `imports`、import maps、
Node.js 標準 API を利用した構成へ**段階的に**移行します（Stage 1〜5）。

第三者依存（`effect` / `ai-sdk` / `tree-sitter` / `@opentui/core` 等）の内部にある
CJS・拡張子なし・非標準 import は、こちらでは標準化できないため対象外です。到達
目標は「**自前コードは標準 ESM、第三者依存にだけ薄い互換層が残る**」状態です。
