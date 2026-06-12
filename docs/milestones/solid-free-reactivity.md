# Milestone: solid-free reactivity (replacing solid-js core)

> Status: **Stage R1 complete** (2026-06-12) — core + store layer implemented,
> semantics tests green (reactivity 16/16, store 13/13). Next: R2 pilot.
> Prerequisite (done): every first-party renderer file is hand-written vanilla —
> zero compiler output; reactivity runs on solid-js core APIs only.

## Inventory (what "solid-js" means to us today)

First-party call sites (non-storybook, `packages/app/src`):

| API group | count |
| --- | --- |
| `createMemo` / `createEffect` / `createRenderEffect` / `createSignal` | 873 / 399 / 536 / 79 |
| `createComponent` / `children` / `mergeProps` / `splitProps` | 1,376 / 1,345 / 128 / 148 |
| control flow `Show` / `For` / `Index` / `Switch+Match` | 455 / 121 / 19 / 115 |
| ownership `createRoot` / `onCleanup` / `onMount` / `getOwner` / `runWithOwner` | 56 / 177 / 59 / 22 / 15 |
| `on` / `batch` / `untrack` / `createResource` / `lazy` | 444 / 70 / 66 / 32 / 10 |
| contexts (`createContext` / `useContext`) | 11 / 10 |
| `solid-js/store` (`createStore`/`reconcile`/`produce`/`unwrap`) | 77 files / 320 sites |
| `solid-js/web` public API (`render` / `insert` / `Dynamic` / `Portal`) | entry + documented exceptions |

Third-party packages that import solid-js **internally** (the wall):
`@solidjs/router` (33 sites), `@solid-primitives/*` (~40), `@tanstack/solid-query`
(15), `@thisbeyond/solid-dnd` (9), `@kobalte/core/*` (popover/dialog/tooltip +
vendored components), `@sentry/solid`, `@solidjs/meta`, `@opentui/solid`
(TUI, engine side, bundled).

## Key design decision

Because call sites are in the thousands but the API surface is small, we do NOT
rewrite call sites. We implement **`lib/reactivity.js` — an API-compatible
self-written core** for the subset we use, and swap what the specifier
`solid-js` RESOLVES to (renderer import map / `package.json#imports`), keeping
the source untouched. Third-party packages keep resolving to the real solid-js
until each is replaced (Stage R3) — two runtimes can coexist because every
first-party component boundary is a plain DOM node; the known crossing hazard
(effects created inside children-getters evaluated under a foreign owner) is
already catalogued per component from the conversion campaign.

## Stages

```
R1  [DONE] lib/reactivity.js: signals/effects/memos/batch/untrack/on +
    owners (root/cleanup/getOwner/runWithOwner) + context +
    helpers (createComponent/children/mergeProps/splitProps/Show/For/...).
    [DONE] lib/store.js: createStore/produce/reconcile/unwrap (+createMutable/
    modifyMutable) ported from solid-js/store onto our core via the three
    runtime deps it needs (getListener/batch/createSignal). Both have node-run
    unit tests (reactivity.test.mjs 16, store.test.mjs 13) proving the trap-list
    semantics. `solid-js` -> reactivity.js, `solid-js/store` -> store.js when aliased.
R2  pilot: alias solid-js -> lib/reactivity.js (and solid-js/store -> lib/store.js)
    for a bounded leaf area (storybook scaffold or a single page) via the import
    map; e2e-verify. Both alias specifiers must flip together since store imports
    getListener/batch/createSignal from the core.
R3  replace third-party solid deps one at a time (router -> the memory router
    we already drive; solid-query -> small fetch cache; primitives -> trivial
    utilities; dnd/kobalte leftovers -> bs/ equivalents; sentry/solid ->
    @sentry/browser). Each removal shrinks the wall.
R4  flip the global alias; solid-js leaves package.json.
```

## Semantics R1 must reproduce (from the campaign's trap list)

- effect/memo dependency tracking with **dynamic dependencies** (re-collected
  per run), nested computations disposed on parent re-run;
- `createMemo` default equality `===`, plus `{ equals: false }`;
- `createRenderEffect` runs synchronously at creation; `createEffect` deferred;
- owner tree: `createRoot(dispose => ...)`, `onCleanup` LIFO on dispose/re-run,
  `getOwner`/`runWithOwner` crossing async boundaries;
- `batch` coalescing, `untrack`, `on(deps, fn, { defer })`;
- context: provider/consumer identity per `createContext()` instance, value
  looked up through the OWNER chain (components don't create scopes unless
  they create computations);
- store: nested proxy with per-path signals, `reconcile` (keyed diff),
  `produce` (mutable draft), `unwrap`.

## Risks

- Suspense/createResource/ErrorBoundary/Portal are used (32/5/5/41 sites) —
  R1 implements resource+suspense-lite (loading flags, no transitions) and
  Portal as a body-mounted container; ErrorBoundary as try/catch around
  build + error signal. Behavioral gaps must be e2e-caught, not assumed.
- Two-runtime coexistence (R2..R3): an effect of ours created under a Kobalte
  owner will NOT be disposed by Kobalte. The conversion campaign already
  routes such cases through getOwner/runWithOwner — those sites keep solid-js
  resolution until their host third-party is replaced.
- `@opentui/solid` (TUI) is bundled and stays on real solid-js permanently
  (third-party interop wall, same status as `.scm` imports).
