# Human-readable vanilla review

Scope: `src/packages/app/src` and `src/packages/desktop-electron/src/renderer`, focused on places where the solid-free / vanilla code still looks like temporary compiler output, debug instrumentation, or hard-to-read runtime code.

## Summary

The concern is valid, but it is not evenly spread across the app.

Most application-level vanilla code uses readable names. The problematic density is concentrated in a few runtime/compatibility files:

- `src/packages/app/src/lib/reactivity.js`
- `src/packages/app/src/lib/context.js`
- `src/packages/app/src/lib/store.js`
- `src/packages/app/src/lib/router/index.js`
- a small amount in `src/packages/desktop-electron/src/renderer/index.js`

The biggest readability risk is `reactivity.js`, because it is now infrastructure: when this file has `c`, `s`, `gen`, `p1`, `p2`, `p3`, or debug globals, it makes reactive-loop debugging much harder.

## High-priority cleanup

### `src/packages/app/src/lib/reactivity.js`

This file still has the strongest "not yet human-readable" smell.

Examples:

- `globalThis.__RUNS` in `Computation.run()`
- `const m`, `const k` inside the same debug counter
- `const c = condition()` in `Show`
- `createResource(p1, p2, p3)`
- `const src`, `const s`, `const gen`
- promise callbacks named `v` and `e`

Suggested naming direction:

- `__RUNS` -> remove, or gate behind `__CLOSEDCODE_REACTIVITY_DEBUG`
- `m` -> `runCounts`
- `k` -> `computationKey`
- `c` -> `conditionValue`
- `p1`, `p2`, `p3` -> `sourceOrFetcher`, `fetcherOrOptions`, `optionsArg`
- `src` -> `sourceAccessor`
- `s` -> `sourceValue`
- `gen` -> `requestGeneration`
- `v` -> `resolvedValue`
- `e` -> `rejection`

This should be done together with the redraw-loop debugging, because the names directly affect how easy it is to reason about dependency collection.

### `src/packages/app/src/lib/context.js`

This file still contains debug instrumentation:

- `globalThis.__GATES`
- `const g`

If this is still needed for boot diagnostics, it should be named and gated. If not needed, remove it.

Suggested naming:

- `__GATES` -> `__CLOSEDCODE_CONTEXT_GATE_DEBUG`
- `g` -> `gateCounts`

## Medium-priority cleanup

### `src/packages/app/src/lib/store.js`

This is a port of `solid-js/store`, so some compact names are expected. Still, because it is now local infrastructure, it would benefit from a small naming pass around non-loop variables.

Examples:

- `p` for proxy
- `l` for length
- `i` in nested loops

Do not over-refactor this while debugging the renderer loop. It is lower risk than `reactivity.js`.

### `src/packages/app/src/lib/router/index.js`

This file is also a compatibility port. It has some compact variables:

- `s`
- `m`
- `to`
- `from`
- `i`

Many are acceptable in parser/router code, especially in short local scopes. This is not the first cleanup target unless the renderer loop points into router matching.

## Low-priority / acceptable cases

Short names are common and mostly fine in these cases:

- loop counters: `i`, `j`
- coordinate math: `x`, `y`
- color math: `r`, `g`, `b`, `l`, `a`
- DOM event handlers: `e`
- tiny local helpers with obvious context
- generated or compiler-output-like story files
- i18n files and fixtures

These should not block debugging.

## Current renderer state

The desktop renderer gate is readable now:

- `defaultServer`
- `sidecar`
- `windowConfig`
- `windowCount`
- `locale`

The old debug globals seen during investigation (`__SS`, `__W`, `__GATE`) are not present in the current `renderer/index.js`. The remaining global in this file, `window.__CLOSEDCODE__`, is a named app namespace for deep links and is acceptable.

## Recommended workflow

1. During redraw-loop debugging, first clean `reactivity.js` names around `Show`, `createMemo`, `insert`, and `createResource`.
2. Remove or gate `globalThis.__RUNS`.
3. Remove or gate `globalThis.__GATES` in `lib/context.js`.
4. Keep the diff narrow: do not do a broad style pass across generated stories, i18n, router, and store at the same time.
5. After the loop is fixed, consider a separate low-risk cleanup pass for `store.js` and `router/index.js`.

## Bottom line

There is enough non-human-readable naming to justify cleanup, but it is concentrated. The app is not broadly unreadable. The main issue is that the core reactivity shim still looks like an active debugging scaffold, and that is exactly the file where clarity matters most right now.
