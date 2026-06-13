// Node-run semantics tests for lib/store.js (Stage R1 store layer). Run with:
//   node src/lib/store.test.mjs   (from packages/app)
// Proves the solid-js/store behaviors the app depends on (deep per-property
// tracking, path setters incl. updaters/predicates/ranges, merge vs replace,
// array length, reconcile keyed diff, produce draft, unwrap).
import { createRoot, createRenderEffect, $TRACK } from "./reactivity.js";
import { createStore, reconcile, produce, unwrap } from "./store.js";

let passed = 0, failed = 0;
function eq(actual, expected, label) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a === b) { passed++; }
  else { failed++; console.error(`FAIL ${label}: got ${a}, want ${b}`); }
}

// 1. deep per-property tracking: only the changed path re-runs
createRoot(() => {
  const [s, set] = createStore({ user: { name: "a", age: 1 } });
  const names = [];
  createRenderEffect(() => names.push(s.user.name));
  set("user", "name", "b");
  set("user", "age", 2);          // sibling -> must NOT re-run the name effect
  eq(names, ["a", "b"], "deep property tracking + sibling isolation");
});

// 2. path setter: key, nested key
createRoot(() => {
  const [s, set] = createStore({ a: 1, nested: { x: 0 } });
  set("a", 5);
  set("nested", "x", 9);
  eq([s.a, s.nested.x], [5, 9], "key + nested-key setters");
});

// 3. function updater receives previous value
createRoot(() => {
  const [s, set] = createStore({ count: 5 });
  set("count", c => c + 1);
  eq(s.count, 6, "function updater");
});

// 4. plain-object value MERGES (top-level and nested); arrays/scalars REPLACE
createRoot(() => {
  const [s, set] = createStore({ a: 1, b: 2, c: 3, obj: { p: 1, q: 2 } });
  set({ a: 10, b: 20 });          // top-level merge (c untouched)
  set("obj", { p: 100 });         // nested merge (q untouched)
  eq([s.a, s.b, s.c, s.obj.p, s.obj.q], [10, 20, 3, 100, 2], "object value merges");
});

// 5. array: index set bumps length signal; predicate + range setters
createRoot(() => {
  const [s, set] = createStore({ nums: [1, 2, 3, 4], todos: [{ id: 1, done: false }, { id: 2, done: false }] });
  let lenRuns = 0;
  createRenderEffect(() => { s.nums.length; lenRuns++; });
  set("nums", 4, 5);              // grow array -> length changes
  set("nums", { from: 0, to: 1 }, n => n * 10); // range updater -> [10,20,3,4,5]
  set("todos", t => t.done === false, "done", true); // array predicate
  eq([s.nums, s.todos.map(t => t.done)], [[10, 20, 3, 4, 5], [true, true]], "array index/range/predicate setters");
  eq(lenRuns >= 2, true, "array length signal fires on grow");
});

// 6. setting a key to undefined deletes it (has-trap notifies)
createRoot(() => {
  const [s, set] = createStore({ a: 1, b: 2 });
  set("b", undefined);
  eq(["b" in s, JSON.stringify(unwrap(s))], [false, JSON.stringify({ a: 1 })], "undefined deletes key");
});

// 7. reconcile: keyed list diff mutates in place — unchanged rows keep identity
//    and do NOT notify; only the changed row re-runs.
createRoot(() => {
  const [s, set] = createStore({ list: [{ id: 1, n: "a" }, { id: 2, n: "b" }] });
  const firstRowRef = s.list[0];          // proxy identity of row id:1
  const joined = [];
  createRenderEffect(() => joined.push(s.list.map(r => r.n).join(",")));
  set("list", reconcile([{ id: 1, n: "A" }, { id: 2, n: "b" }], { key: "id" }));
  const sameIdentity = s.list[0] === firstRowRef;  // row reused, not replaced
  eq(joined, ["a,b", "A,b"], "reconcile updates only changed row");
  eq(sameIdentity, true, "reconcile preserves row identity by key");
});

// 8. reconcile: insert / remove / reorder by key
createRoot(() => {
  const [s, set] = createStore({ list: [{ id: 1 }, { id: 2 }, { id: 3 }] });
  set("list", reconcile([{ id: 3 }, { id: 1 }, { id: 4 }], { key: "id" }));
  eq(s.list.map(r => r.id), [3, 1, 4], "reconcile reorder/insert/remove by key");
});

// 9. produce: mutable draft, batched, granular notifications
createRoot(() => {
  const [s, set] = createStore({ count: 0, list: [1, 2] });
  set(produce(d => { d.count++; d.list.push(3); d.list[0] = 9; }));
  eq([s.count, s.list], [1, [9, 2, 3]], "produce mutable draft");
});

// 10. unwrap: raw, proxy-free, deep
createRoot(() => {
  const [s] = createStore({ a: { b: [1, 2] } });
  const raw = unwrap(s);
  eq(JSON.stringify(raw), JSON.stringify({ a: { b: [1, 2] } }), "unwrap deep value");
  eq(raw === unwrap(s), true, "unwrap returns the stable raw object");
});

// 11. $TRACK: subscribing to a whole array re-runs on structural change
//     (this is the symbol first-party components read as items[$TRACK]).
createRoot(() => {
  const [s, set] = createStore({ items: [1, 2] });
  let runs = 0;
  createRenderEffect(() => { s.items[$TRACK]; runs++; });
  set("items", i => [...i, 3]);   // length/structure change -> $SELF notifies
  eq(runs >= 2, true, "$TRACK re-runs on whole-array change");
  eq(s.items.length === 3 && $TRACK !== undefined, true, "$TRACK is a shared symbol");
});

console.log(`store tests: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
