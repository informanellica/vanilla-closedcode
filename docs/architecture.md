# Architecture — M / V / C

ClosedCode is structured as three layers that map onto the classic
**Model–View–Controller** split. Several docs (and the Stage plan in the
Pure Vanilla milestone) refer to these as **V / C / M** without re-defining them;
this file is the canonical definition.

## The three layers

| Layer | What it is | Package | Build state |
|-------|------------|---------|-------------|
| **M — Model** | Engine / HTTP server / sidecar / CLI (sessions, providers, storage, the agent loop) | `packages/closedcode` | **Built** with esbuild (`script/build.js`, `script/build-node.js`) |
| **V — View** | Renderer — the SolidJS UI | `packages/app` | **Build-less** — served over the `oc://` protocol via a runtime import-rewriting resolver |
| **C — Controller** | Electron `main` / `preload` — window lifecycle, IPC, protocol handlers, spawning the sidecar | `packages/desktop-electron` | **Build-less** — runs the `src` tree directly |

Note that **M is not the GUI's backend-by-wrapping-the-CLI**: the GUI and the CLI
are *siblings* over the same engine. The desktop Controller (C) spawns the Model
(M) as a sidecar and the View (V) talks to it over the HTTP SDK; the standalone
CLI is a second front-end onto the same M.

## How this maps to the Stage plan

The [Pure Vanilla Standardization milestone](milestones/pure-vanilla-standardization.md)
sequences the de-machinery work by layer:

- **Stage 3** — Renderer → import maps + native ESM (shrink the `oc://` resolver) → **V**
- **Stage 4** — Remove the non-standard processing in `main` / `preload` → **C**
- Engine / CLI esbuild build → **M** (Stage 5 confirms the loader/esbuild reductions)

## "Build-less" vs "pure vanilla"

These are **not** the same thing:

- **Build-less** means there is no JSX/TS compile step and no runtime bundler — the
  `.js` source under `packages/*/src` *is* what runs. V and C are already build-less.
- **Pure vanilla** means standard ESM that runs on Node / the browser with **no
  custom resolver and no esbuild**. No layer is fully there yet: V still relies on
  the `oc://` resolver, and M is still esbuild-built.

## The interop wall (why it is not 100% machinery-free)

Our own code (M / V / C) is the part we standardize toward plain ESM. Third-party
dependencies (`effect`, `ai-sdk`, `tree-sitter`, `@opentui/core`, …) carry
non-standard internals — CJS-era imports, extensionless imports, `node:ffi`,
`.scm` imports — that cannot be standardized without patching them. The realistic
target is therefore:

> **Our own code (View / Controller / Model) is standard ESM; a thin, documented
> interop layer remains only for third-party dependencies.**

See the [Pure Vanilla Standardization milestone](milestones/pure-vanilla-standardization.md)
and the [roadmap](roadmap.md) for the staged plan and the open refactor backlog.
