// Node-run semantics tests for lib/reactivity.js (Stage R1). Run with:
//   node src/lib/reactivity.test.mjs   (from packages/app)
// Covers the trap list in docs/milestones/solid-free-reactivity.md.
import {
  createSignal, createMemo, createRenderEffect, createEffect, createRoot,
  onCleanup, getOwner, runWithOwner, untrack, batch, on,
  createContext, useContext, createComponent, mergeProps, splitProps,
} from "./reactivity.js";

let passed = 0, failed = 0;
function eq(actual, expected, label) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a === b) { passed++; }
  else { failed++; console.error(`FAIL ${label}: got ${a}, want ${b}`); }
}

// 1. dynamic dependency re-collection
createRoot(() => {
  const [a, setA] = createSignal(1);
  const [b, setB] = createSignal(10);
  const [useA, setUseA] = createSignal(true);
  const log = [];
  createRenderEffect(() => log.push(useA() ? a() : b()));
  setA(2);           // tracked (useA=true)
  setB(11);          // NOT tracked
  setUseA(false);    // switch deps -> reads b
  setA(3);           // no longer tracked
  setB(12);          // tracked now
  eq(log, [1, 2, 11, 12], "dynamic deps");
});

// 2. memo equality (=== default, equals:false override)
createRoot(() => {
  const [n, setN] = createSignal(0);
  let runs = 0;
  const even = createMemo(() => (runs++, n() % 2 === 0));
  const log = [];
  createRenderEffect(() => log.push(even()));
  setN(2);   // memo recomputes, value unchanged -> downstream NOT rerun
  setN(3);   // value flips
  eq(log, [true, false], "memo === gate");
  eq(runs, 3, "memo recompute count");

  let forced = 0;
  const [m, setM] = createSignal(0);
  const always = createMemo(() => (m(), {}), undefined, { equals: false });
  createRenderEffect(() => (always(), forced++));
  setM(1);
  eq(forced, 2, "equals:false always notifies");
});

// 3. nested computations disposed on parent re-run; onCleanup LIFO
createRoot(() => {
  const [outer, setOuter] = createSignal(0);
  const [inner, setInner] = createSignal(0);
  const log = [];
  createRenderEffect(() => {
    const o = outer();
    onCleanup(() => log.push(`cleanup-a${o}`));
    onCleanup(() => log.push(`cleanup-b${o}`));
    createRenderEffect(() => log.push(`inner${o}:${inner()}`));
  });
  setInner(1);       // inner effect of generation 0
  setOuter(1);       // disposes gen-0 inner + cleanups (LIFO)
  setInner(2);       // only gen-1 inner runs
  eq(log, ["inner0:0", "inner0:1", "cleanup-b0", "cleanup-a0", "inner1:1", "inner1:2"], "nested disposal + LIFO");
});

// 4. batch coalescing
createRoot(() => {
  const [x, setX] = createSignal(1);
  const [y, setY] = createSignal(2);
  const log = [];
  createRenderEffect(() => log.push(x() + y()));
  batch(() => { setX(10); setY(20); });
  eq(log, [3, 30], "batch coalesces");
});

// 5. untrack
createRoot(() => {
  const [t, setT] = createSignal(0);
  let runs = 0;
  createRenderEffect(() => { runs++; untrack(() => t()); });
  setT(1);
  eq(runs, 1, "untrack prevents subscription");
});

// 6. on() with defer
createRoot(() => {
  const [s, setS] = createSignal(0);
  const log = [];
  createRenderEffect(on(s, v => log.push(v), { defer: true }));
  setS(1); setS(2);
  eq(log, [1, 2], "on defer skips initial");
});

// 7. context identity through owner chain + provider scoping
createRoot(() => {
  const Ctx = createContext("default");
  let seenInside, seenOutside;
  const Reader = () => { seenInside = useContext(Ctx); return null; };
  createComponent(Ctx.Provider, { value: "provided", get children() { return createComponent(Reader, {}); } });
  seenOutside = useContext(Ctx);
  eq(seenInside, "provided", "context provided value");
  eq(seenOutside, "default", "context default outside provider");
});

// 8. getOwner / runWithOwner across async boundary (cleanup registration)
await new Promise(resolve => {
  createRoot(dispose => {
    const owner = getOwner();
    const log = [];
    setTimeout(() => {
      runWithOwner(owner, () => onCleanup(() => log.push("late-cleanup")));
      dispose();
      eq(log, ["late-cleanup"], "runWithOwner async cleanup");
      resolve();
    }, 0);
  });
});

// 9. mergeProps/splitProps preserve getters
createRoot(() => {
  const [v, setV] = createSignal("a");
  const props = { get value() { return v(); }, fixed: 1, onClick: () => {} };
  const merged = mergeProps({ value: "default", extra: true }, props);
  const [local, rest] = splitProps(merged, ["value"]);
  setV("b");
  eq(local.value, "b", "splitProps getter live");
  eq(rest.fixed, 1, "splitProps rest");
  eq(rest.extra, true, "mergeProps default present");
});

// 10. createEffect deferred initial run
await new Promise(resolve => {
  createRoot(() => {
    const log = [];
    createEffect(() => log.push("effect"));
    eq(log, [], "createEffect not synchronous");
    queueMicrotask(() => { eq(log, ["effect"], "createEffect ran async"); resolve(); });
  });
});

console.log(`reactivity tests: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
