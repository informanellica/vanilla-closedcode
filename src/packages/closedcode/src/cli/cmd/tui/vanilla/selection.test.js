// Node-run tests for vanilla/selection.js — model/agent/variant selection over a
// mock data.store. No TTY/jest; asserts real behavior against a synthetic store.
//   node src/cli/cmd/tui/vanilla/selection.test.js
import { createSelection } from "./selection.js";

let passed = 0, failed = 0;
function eq(a, b, label) {
  const x = JSON.stringify(a), y = JSON.stringify(b);
  if (x === y) passed++; else { failed++; console.error(`FAIL ${label}: got ${x}, want ${y}`); }
}
function ok(c, label) { eq(!!c, true, label); }

// A minimal mock data layer exposing just the store accessors selection reads.
// `providers`/`agents` are plain arrays returned fresh each call.
function mockData({ providers = [], agents = [] } = {}) {
  return { store: { providers: () => providers, agents: () => agents } };
}

const PROVIDERS = [
  { id: "anthropic", name: "Anthropic", models: {
    "opus-4-8": { name: "Opus 4.8", variants: { low: {}, high: {} } },
    "sonnet-4-6": { name: "Sonnet 4.6" },
  } },
  { id: "openai", name: "OpenAI", models: {
    "gpt-5": { name: "GPT-5" },
  } },
];
const AGENTS = [
  { name: "build", mode: "primary" },
  { name: "plan", mode: "primary" },
  { name: "reviewer", mode: "subagent" }, // not selectable
  { name: "secret", hidden: true },        // not selectable
];

// --- agent: fallback / set / cycle wrap / list filtering ------------------
{
  const sel = createSelection({ data: mockData({ providers: PROVIDERS, agents: AGENTS }) });
  eq(sel.agent.list().map(a => a.name), ["build", "plan"], "agent.list() drops subagent + hidden");
  eq(sel.agent.current(), "build", "agent.current() falls back to first visible agent");
  sel.agent.set("plan");
  eq(sel.agent.current(), "plan", "agent.set + current()");
  sel.agent.set("reviewer"); // subagent -> rejected, stays on plan
  eq(sel.agent.current(), "plan", "agent.set rejects a non-visible agent");
  sel.agent.cycle();         // plan -> build (wrap forward off the end)
  eq(sel.agent.current(), "build", "agent.cycle(+1) wraps from last to first");
  sel.agent.cycle(-1);       // build -> plan (wrap backward off the start)
  eq(sel.agent.current(), "plan", "agent.cycle(-1) wraps from first to last");
}

// --- agent fallback to opts.agent when no agents exist --------------------
{
  const sel = createSelection({ data: mockData({ providers: [], agents: [] }), agent: "build" });
  eq(sel.agent.current(), "build", "agent.current() uses opts.agent when no agents");
}

// --- model: fallback / set / current / parsed -----------------------------
{
  const sel = createSelection({ data: mockData({ providers: PROVIDERS, agents: AGENTS }) });
  eq(sel.model.current(), { providerID: "anthropic", modelID: "opus-4-8" }, "model.current() falls back to first provider's first model");
  eq(sel.model.parsed(), { provider: "Anthropic", model: "Opus 4.8" }, "model.parsed() names the fallback model");
  sel.model.set({ providerID: "openai", modelID: "gpt-5" });
  eq(sel.model.current(), { providerID: "openai", modelID: "gpt-5" }, "model.set + current()");
  eq(sel.model.parsed(), { provider: "OpenAI", model: "GPT-5" }, "model.parsed() after set");
  sel.model.set({ providerID: "openai", modelID: "nope" }); // invalid -> no-op
  eq(sel.model.current(), { providerID: "openai", modelID: "gpt-5" }, "model.set ignores an invalid model");
  eq(sel.model.list().map(m => m.modelID), ["opus-4-8", "sonnet-4-6", "gpt-5"], "model.list() flattens all providers");
}

// --- model.current() undefined with no providers --------------------------
{
  const sel = createSelection({ data: mockData({ providers: [], agents: AGENTS }) });
  eq(sel.model.current(), undefined, "model.current() is undefined with no providers");
  eq(sel.model.parsed(), { provider: "Connect a provider", model: "No model selected" }, "model.parsed() placeholder with no providers");
}

// --- model.cycle wraps in both directions ---------------------------------
{
  const sel = createSelection({ data: mockData({ providers: PROVIDERS, agents: AGENTS }) });
  // order: opus-4-8, sonnet-4-6, gpt-5
  eq(sel.model.current().modelID, "opus-4-8", "cycle: starts at fallback");
  sel.model.cycle();  eq(sel.model.current().modelID, "sonnet-4-6", "cycle(+1) -> next");
  sel.model.cycle();  eq(sel.model.current().modelID, "gpt-5", "cycle(+1) -> next");
  sel.model.cycle();  eq(sel.model.current().modelID, "opus-4-8", "cycle(+1) wraps to first");
  sel.model.cycle(-1); eq(sel.model.current().modelID, "gpt-5", "cycle(-1) wraps to last");
}

// --- favorites: toggle on/off + list (invalid filtered) -------------------
{
  const sel = createSelection({ data: mockData({ providers: PROVIDERS, agents: AGENTS }) });
  eq(sel.model.favorite.list(), [], "favorites start empty");
  sel.model.favorite.toggle({ providerID: "openai", modelID: "gpt-5" });
  sel.model.favorite.toggle({ providerID: "anthropic", modelID: "opus-4-8" });
  eq(sel.model.favorite.list().map(m => m.modelID), ["opus-4-8", "gpt-5"], "toggle adds (most-recent first)");
  sel.model.favorite.toggle({ providerID: "openai", modelID: "gpt-5" }); // remove
  eq(sel.model.favorite.list().map(m => m.modelID), ["opus-4-8"], "toggle again removes");
  sel.model.favorite.toggle({ providerID: "openai", modelID: "ghost" }); // invalid -> ignored
  eq(sel.model.favorite.list().map(m => m.modelID), ["opus-4-8"], "favorite.toggle ignores invalid model");
}

// --- variant: list comes from the current model; set/current/cycle --------
{
  const sel = createSelection({ data: mockData({ providers: PROVIDERS, agents: AGENTS }) });
  // fallback model opus-4-8 has variants { low, high }
  eq(sel.variant.list(), ["low", "high"], "variant.list() from the current model's variants");
  eq(sel.variant.current(), undefined, "variant.current() undefined before any set");
  sel.variant.set("high");
  eq(sel.variant.current(), "high", "variant.set + current()");
  // switch to a model with no variants -> empty list, current undefined
  sel.model.set({ providerID: "anthropic", modelID: "sonnet-4-6" });
  eq(sel.variant.list(), [], "variant.list() empty for a model without variants");
  eq(sel.variant.current(), undefined, "variant.current() undefined for a variant-less model");
  sel.variant.cycle(); // no-op (0 variants)
  eq(sel.variant.current(), undefined, "variant.cycle() is a no-op with no variants");
  // back to opus -> the earlier variant choice is remembered per-model
  sel.model.set({ providerID: "anthropic", modelID: "opus-4-8" });
  eq(sel.variant.current(), "high", "variant choice is remembered per model");
}

// --- variant.cycle: undefined -> first -> ... -> last -> undefined ---------
{
  const sel = createSelection({ data: mockData({ providers: PROVIDERS, agents: AGENTS }) });
  eq(sel.variant.current(), undefined, "cycle: start undefined");
  sel.variant.cycle(); eq(sel.variant.current(), "low", "cycle: undefined -> first");
  sel.variant.cycle(); eq(sel.variant.current(), "high", "cycle: first -> last");
  sel.variant.cycle(); eq(sel.variant.current(), undefined, "cycle: last -> undefined (off)");
}

// --- invalid set routes to the injected toast as a warning ----------------
{
  const toasts = [];
  const sel = createSelection({ data: mockData({ providers: PROVIDERS, agents: AGENTS }), toast: { show: t => toasts.push(t) } });
  sel.model.set({ providerID: "x", modelID: "y" });
  sel.agent.set("nobody");
  eq(toasts.map(t => t.variant), ["warning", "warning"], "invalid set/agent.set emit a warning toast");
}

// --- storage: persistence via an injected synchronous adapter -------------
// A fake in-memory storage: save() deep-copies the snapshot (mimicking a real
// JSON-on-disk round-trip), load() returns the last saved box, _peek() reads it.
function memStorage() {
  let box = null;
  return { load: () => box, save: s => { box = JSON.parse(JSON.stringify(s)); }, _peek: () => box };
}

// Each mutation persists, and a no-op set never corrupts the saved snapshot.
{
  const storage = memStorage();
  const sel = createSelection({ data: mockData({ providers: PROVIDERS, agents: AGENTS }), storage });
  eq(storage._peek(), null, "storage: nothing saved before any mutation");

  sel.model.favorite.toggle({ providerID: "anthropic", modelID: "opus-4-8" });
  eq(storage._peek().favorites, [{ providerID: "anthropic", modelID: "opus-4-8" }], "storage: favorite.toggle persists");

  sel.model.set({ providerID: "openai", modelID: "gpt-5" });
  eq(storage._peek().model, { providerID: "openai", modelID: "gpt-5" }, "storage: model.set persists the override");

  sel.agent.set("plan");
  eq(storage._peek().agent, "plan", "storage: agent.set persists");

  // current model is gpt-5 (no variants) — set a variant on opus instead.
  sel.model.set({ providerID: "anthropic", modelID: "opus-4-8" });
  sel.variant.set("high");
  eq(storage._peek().variants, { "anthropic/opus-4-8": "high" }, "storage: variant.set persists keyed by model");

  // A no-op set (invalid model) must NOT change the saved snapshot.
  const before = JSON.stringify(storage._peek());
  sel.model.set({ providerID: "openai", modelID: "nope" });
  eq(JSON.stringify(storage._peek()), before, "storage: invalid model.set does not corrupt saved state");
}

// RESTORE: a second selection over the SAME storage + store rehydrates state.
{
  const storage = memStorage();
  const first = createSelection({ data: mockData({ providers: PROVIDERS, agents: AGENTS }), storage });
  first.model.set({ providerID: "anthropic", modelID: "opus-4-8" });
  first.variant.set("high");
  first.agent.set("plan");
  first.model.favorite.toggle({ providerID: "openai", modelID: "gpt-5" });
  first.model.favorite.toggle({ providerID: "anthropic", modelID: "sonnet-4-6" });

  const restored = createSelection({ data: mockData({ providers: PROVIDERS, agents: AGENTS }), storage });
  eq(restored.model.current(), { providerID: "anthropic", modelID: "opus-4-8" }, "restore: model.current() rehydrated");
  eq(restored.agent.current(), "plan", "restore: agent.current() rehydrated");
  eq(restored.variant.current(), "high", "restore: variant.current() rehydrated per model");
  eq(restored.model.favorite.list().map(m => m.modelID), ["sonnet-4-6", "gpt-5"], "restore: favorites rehydrated (order preserved)");
}

// A malformed snapshot is tolerated: no throw, yields a working selection.
{
  const bad = { load: () => ({ favorites: 5, variants: "x", model: 7, agent: 9 }), save: () => {} };
  let sel;
  let threw = false;
  try { sel = createSelection({ data: mockData({ providers: PROVIDERS, agents: AGENTS }), storage: bad }); }
  catch { threw = true; }
  eq(threw, false, "malformed snapshot does not throw");
  eq(sel.model.current(), { providerID: "anthropic", modelID: "opus-4-8" }, "malformed snapshot: model falls back");
  eq(sel.agent.current(), "build", "malformed snapshot: agent falls back");
  eq(sel.model.favorite.list(), [], "malformed snapshot: favorites empty");
  // and the selection is still mutable afterward
  sel.model.set({ providerID: "openai", modelID: "gpt-5" });
  eq(sel.model.current(), { providerID: "openai", modelID: "gpt-5" }, "malformed snapshot: selection still works");
}

// No storage adapter: persist() is a no-op (no crash on any mutation path).
{
  const sel = createSelection({ data: mockData({ providers: PROVIDERS, agents: AGENTS }) });
  sel.model.set({ providerID: "openai", modelID: "gpt-5" });
  sel.agent.set("plan");
  sel.model.favorite.toggle({ providerID: "openai", modelID: "gpt-5" });
  ok(true, "no storage: mutations succeed without a save adapter");
}

console.log(`tui vanilla selection tests: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
