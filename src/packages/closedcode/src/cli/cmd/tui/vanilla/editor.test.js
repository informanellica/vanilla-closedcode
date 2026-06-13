// Node-run tests for the external-editor flow.  node src/cli/cmd/tui/vanilla/editor.test.js
import path from "node:path";
import { editInEditor, splitCommand, resolveEditor } from "./editor.js";

let passed = 0, failed = 0;
function eq(a, b, label) { if (JSON.stringify(a) === JSON.stringify(b)) passed++; else { failed++; console.error(`FAIL ${label}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); } }
function ok(c, label) { eq(!!c, true, label); }

// In-memory fs honoring the writeFileSync/readFileSync/unlinkSync used by editor.js.
function memFs(seed = {}) {
  const files = { ...seed };
  return {
    files,
    writeFileSync: (f, d) => { files[f] = String(d); },
    readFileSync: (f) => { if (!(f in files)) { const e = new Error("ENOENT"); e.code = "ENOENT"; throw e; } return files[f]; },
    unlinkSync: (f) => { delete files[f]; },
  };
}

// --- splitCommand / resolveEditor ------------------------------------------
{
  eq(splitCommand("vi"), ["vi"], "single command");
  eq(splitCommand("code --wait"), ["code", "--wait"], "command with flag");
  eq(splitCommand('"/path with space/ed" -x'), ["/path with space/ed", "-x"], "quoted path with flag");
  eq(splitCommand(""), [], "empty -> []");
  eq(resolveEditor({ VISUAL: "v", EDITOR: "e" }), "v", "VISUAL wins");
  eq(resolveEditor({ EDITOR: "e" }), "e", "EDITOR next");
  eq(resolveEditor({}, "win32"), "notepad", "win32 default notepad");
  eq(resolveEditor({}, "linux"), "vi", "posix default vi");
}

// --- happy path: edits the temp file, runs inside suspend, cleans up --------
{
  const fs = memFs();
  let spawned, suspended = 0;
  const spawn = (bin, args) => {
    spawned = { bin, args };
    const file = args[args.length - 1];
    const h = {};
    queueMicrotask(() => { fs.files[file] = "EDITED CONTENT"; h.exit?.(0); }); // the "editor" writes + exits
    return { on: (ev, cb) => { h[ev] = cb; } };
  };
  const suspend = async (fn) => { suspended++; return fn(); };
  const pFile = path.join("/tmp", "p.md");
  const result = await editInEditor("initial", { fs, spawn, suspend, editor: "fakeed --wait", tmpdir: "/tmp", filename: "p.md" });
  eq(result, "EDITED CONTENT", "returns the edited file content");
  eq(suspended, 1, "ran the editor inside suspend()");
  eq([spawned.bin, spawned.args], ["fakeed", ["--wait", pFile]], "spawned editor argv = bin + flags + tmp file");
  ok(!(pFile in fs.files), "temp file removed after read");
}

// --- editor unchanged file -> returns the original initial text -------------
{
  const fs = memFs();
  const spawn = (bin, args) => { const h = {}; queueMicrotask(() => h.exit?.(0)); return { on: (ev, cb) => { h[ev] = cb; } }; };
  const result = await editInEditor("keep me", { fs, spawn, suspend: fn => fn(), editor: "noop", tmpdir: "/tmp", filename: "q.md" });
  eq(result, "keep me", "no edit -> initial text round-trips");
}

// --- spawn failure (editor not found) -> falls back to initial, no throw ----
{
  const fs = memFs();
  const spawn = () => { throw new Error("ENOENT"); };
  const result = await editInEditor("original", { fs, spawn, suspend: fn => fn(), editor: "missing", tmpdir: "/tmp", filename: "r.md" });
  eq(result, "original", "spawn throw -> returns initial");
  ok(!(path.join("/tmp", "r.md") in fs.files), "temp file cleaned up even on spawn failure");
}

// --- child emits 'error' -> still returns the (unmodified) file content ------
{
  const fs = memFs();
  const spawn = (bin, args) => { const h = {}; queueMicrotask(() => h.error?.(new Error("spawn EACCES"))); return { on: (ev, cb) => { h[ev] = cb; } }; };
  const result = await editInEditor("x", { fs, spawn, suspend: fn => fn(), editor: "bad", tmpdir: "/tmp", filename: "s.md" });
  eq(result, "x", "child 'error' -> returns initial, no throw");
}

// --- non-zero exit (abort: vi :cq / crash) -> discard edits, keep original ----
{
  const fs = memFs();
  // the editor writes a partial/aborted buffer then exits NON-zero
  const spawn = (bin, args) => { const f = args[args.length - 1]; const h = {}; queueMicrotask(() => { fs.files[f] = "PARTIAL / ABORTED"; h.exit?.(1); }); return { on: (ev, cb) => { h[ev] = cb; } }; };
  const result = await editInEditor("ORIGINAL", { fs, spawn, suspend: fn => fn(), editor: "ed", tmpdir: "/tmp", filename: "abort.md" });
  eq(result, "ORIGINAL", "non-zero editor exit discards edits (returns initial)");
  ok(!(path.join("/tmp", "abort.md") in fs.files), "temp file cleaned up after aborted edit");
}

// --- CRLF normalization (notepad/win32) -> no stray carriage returns ----------
{
  const fs = memFs();
  const spawn = (bin, args) => { const f = args[args.length - 1]; const h = {}; queueMicrotask(() => { fs.files[f] = "line1\r\nline2\r\n"; h.exit?.(0); }); return { on: (ev, cb) => { h[ev] = cb; } }; };
  const result = await editInEditor("x", { fs, spawn, suspend: fn => fn(), editor: "notepad", tmpdir: "/tmp", filename: "crlf.md" });
  eq(result, "line1\nline2\n", "CRLF (\\r\\n) normalized to LF; no embedded carriage returns");
  ok(!result.includes("\r"), "no stray \\r in editor output");
}

console.log(`tui vanilla editor tests: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
