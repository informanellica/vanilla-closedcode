// Node-run tests for the file-backed selection storage adapter.
//   node src/cli/cmd/tui/vanilla/data/selection-storage.test.js
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createSelectionStorage } from "./selection-storage.js";

let passed = 0, failed = 0;
function eq(a, b, label) { if (JSON.stringify(a) === JSON.stringify(b)) passed++; else { failed++; console.error(`FAIL ${label}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); } }
function ok(c, label) { eq(!!c, true, label); }

// Fresh temp dir per run (no Date.now/random allowed elsewhere, but a test may).
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cc-selstore-"));

// 1. round-trip: save then load returns the same snapshot
{
  const store = createSelectionStorage({ dir: tmp });
  eq(store.load(), null, "load before any save -> null");
  const snap = {
    agent: "build",
    model: { providerID: "anthropic", modelID: "opus" },
    favorites: [{ providerID: "anthropic", modelID: "opus" }],
    variants: { "anthropic/opus": "thinking" },
  };
  store.save(snap);
  eq(store.load(), snap, "load after save round-trips the snapshot");
  // a fresh adapter over the same dir reads what the first wrote (persistence).
  eq(createSelectionStorage({ dir: tmp }).load(), snap, "a new adapter over the same dir restores it");
}

// 2. the file actually lands at <dir>/tui-selection.json (and name is overridable)
{
  ok(fs.existsSync(path.join(tmp, "tui-selection.json")), "default file name is tui-selection.json");
  const named = createSelectionStorage({ dir: tmp, name: "other.json" });
  named.save({ agent: "plan" });
  ok(fs.existsSync(path.join(tmp, "other.json")), "opts.name overrides the file name");
}

// 3. resilience: malformed JSON on disk -> load() returns null (never throws)
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cc-selbad-"));
  fs.writeFileSync(path.join(dir, "tui-selection.json"), "{ not valid json");
  const store = createSelectionStorage({ dir });
  eq(store.load(), null, "malformed file -> null, no throw");
  // a JSON primitive (not an object) is also treated as nothing-saved
  fs.writeFileSync(path.join(dir, "tui-selection.json"), "42");
  eq(store.load(), null, "non-object JSON -> null");
  // a JSON array passes typeof===object but is NOT a valid snapshot -> null
  fs.writeFileSync(path.join(dir, "tui-selection.json"), "[1,2,3]");
  eq(store.load(), null, "JSON array -> null (object-only contract)");
}

// 4. save creates the directory if missing (mkdir recursive), no throw
{
  const nested = path.join(tmp, "deep", "nested", "cfg");
  const store = createSelectionStorage({ dir: nested });
  store.save({ agent: "x" });
  ok(fs.existsSync(path.join(nested, "tui-selection.json")), "save() creates missing parent dirs");
}

// 5. default dir (no opts.dir) resolves under the home dir's .closedcode, no throw
{
  const store = createSelectionStorage();
  ok(store && typeof store.load === "function" && typeof store.save === "function", "default-dir adapter constructs without throwing");
}

console.log(`tui vanilla selection-storage tests: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
