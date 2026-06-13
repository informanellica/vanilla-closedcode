// Windows console helpers for the TUI. On Windows the console delivers Ctrl-C as
// a CTRL_C_EVENT that, by default (ENABLE_PROCESSED_INPUT set), terminates the
// process group — so a stray Ctrl-C during startup (before terminal-kit grabs
// input) can kill the TUI before it exits gracefully. We:
//   - clear ENABLE_PROCESSED_INPUT so Ctrl-C arrives as a normal key event the
//     shell handles (dispatch -> onExit), and
//   - install a NULL console-ctrl handler so the OS ignores Ctrl-C for this
//     process during the unguarded window.
// Backed by koffi (kernel32). Every function is a safe no-op off win32, when
// koffi can't load, or when stdin isn't a real console (e.g. a piped handle) —
// so non-Windows builds and tests are unaffected.
import { createRequire } from "node:module";

const IS_WIN32 = process.platform === "win32";
const STD_INPUT_HANDLE = (-10) >>> 0;        // (DWORD)-10
const ENABLE_PROCESSED_INPUT = 0x0001;

let lib = null;
let loadFailed = false;

// Lazily bind the kernel32 functions we need (once). Returns null if unavailable.
function kernel32() {
  if (lib || loadFailed) return lib;
  if (!IS_WIN32) { loadFailed = true; return null; }
  try {
    const require = createRequire(import.meta.url);
    const koffi = require("koffi");
    const k = koffi.load("kernel32.dll");
    // koffi func(name, resultType, paramTypes). x64 Windows has a single calling
    // convention, so no __stdcall annotation is needed. A Node Buffer is accepted
    // for a "void *" out-pointer (we read the DWORD back with readUInt32LE).
    lib = {
      GetStdHandle: k.func("GetStdHandle", "void *", ["uint32"]),
      GetConsoleMode: k.func("GetConsoleMode", "bool", ["void *", "void *"]),
      SetConsoleMode: k.func("SetConsoleMode", "bool", ["void *", "uint32"]),
      SetConsoleCtrlHandler: k.func("SetConsoleCtrlHandler", "bool", ["void *", "bool"]),
    };
  } catch {
    loadFailed = true;
    lib = null;
  }
  return lib;
}

// Read the current console input mode; returns null when there is no console.
function readInputMode(k) {
  const h = k.GetStdHandle(STD_INPUT_HANDLE);
  const buf = Buffer.alloc(4);
  if (!k.GetConsoleMode(h, buf)) return null; // not a console handle (piped) -> bail
  return { handle: h, mode: buf.readUInt32LE(0) };
}

// Clear ENABLE_PROCESSED_INPUT so Ctrl-C is delivered as input, not a signal.
// The console input mode is buffer state that OUTLIVES this process, so leaving
// it cleared would break Ctrl-C for the parent shell on the same console. Returns
// a restore() that re-sets ONLY the bit we cleared (onto the then-current mode,
// so it doesn't clobber e.g. terminal-kit's own grabInput restore) — call it in a
// finally. Returns undefined when there's nothing to restore (no console, or the
// bit was already clear).
export function win32DisableProcessedInput() {
  const k = kernel32();
  if (!k) return undefined;
  try {
    const cur = readInputMode(k);
    if (!cur) return undefined;
    if (!(cur.mode & ENABLE_PROCESSED_INPUT)) return undefined; // already clear -> nothing to undo
    k.SetConsoleMode(cur.handle, (cur.mode & ~ENABLE_PROCESSED_INPUT) >>> 0);
    return () => {
      try {
        const now = readInputMode(k);
        if (now) k.SetConsoleMode(now.handle, (now.mode | ENABLE_PROCESSED_INPUT) >>> 0);
      } catch { /* ignore */ }
    };
  } catch {
    return undefined; // degrade to default Ctrl-C behavior
  }
}

// Flush any pending console input (stale keystrokes) — best-effort.
export function win32FlushInputBuffer() {
  const k = kernel32();
  if (!k) return;
  try {
    const require = createRequire(import.meta.url);
    const koffi = require("koffi");
    const flush = koffi.load("kernel32.dll").func("FlushConsoleInputBuffer", "bool", ["void *"]);
    flush(k.GetStdHandle(STD_INPUT_HANDLE));
  } catch { /* ignore */ }
}

// Install a NULL console-ctrl handler (SetConsoleCtrlHandler(NULL, TRUE)) so the
// OS ignores Ctrl-C for this process during the unguarded startup window. Returns
// an unguard() that removes it (or undefined if it couldn't be installed).
export function win32InstallCtrlCGuard() {
  const k = kernel32();
  if (!k) return undefined;
  try {
    if (!k.SetConsoleCtrlHandler(null, true)) return undefined;
    return () => { try { k.SetConsoleCtrlHandler(null, false); } catch { /* ignore */ } };
  } catch {
    return undefined;
  }
}
