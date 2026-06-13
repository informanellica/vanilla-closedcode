// Node-run tests for the Windows console helpers.  node src/cli/cmd/tui/win32.test.js
// Portable: on win32 it exercises the real koffi/kernel32 binding (the ctrl
// handler installs at process scope, no console needed); off win32 (and when
// stdin isn't a real console) everything must be a safe no-op. The actual
// ENABLE_PROCESSED_INPUT clearing needs a real console and isn't asserted here.
import { win32DisableProcessedInput, win32FlushInputBuffer, win32InstallCtrlCGuard } from "./win32.js";

let passed = 0, failed = 0;
function eq(a, b, label) { if (JSON.stringify(a) === JSON.stringify(b)) passed++; else { failed++; console.error(`FAIL ${label}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); } }
function ok(c, label) { eq(!!c, true, label); }

const IS_WIN32 = process.platform === "win32";

// 1. every helper is callable without throwing, in any environment
{
  let threw = false;
  try {
    win32DisableProcessedInput();
    win32FlushInputBuffer();
    const u = win32InstallCtrlCGuard();
    if (typeof u === "function") u();
  } catch { threw = true; }
  ok(!threw, "all win32 helpers are no-throw");
}

// 2. win32InstallCtrlCGuard contract: undefined OR an unguard function
{
  const u = win32InstallCtrlCGuard();
  ok(u === undefined || typeof u === "function", "guard returns undefined or an unguard fn");
  if (typeof u === "function") {
    let t = false; try { u(); } catch { t = true; }
    ok(!t, "unguard() is no-throw");
  }
}

// 3. platform behavior
if (!IS_WIN32) {
  eq(win32DisableProcessedInput(), undefined, "DisableProcessedInput is a no-op off win32");
  eq(win32FlushInputBuffer(), undefined, "FlushInputBuffer is a no-op off win32");
  eq(win32InstallCtrlCGuard(), undefined, "guard is undefined off win32 (nothing to guard)");
} else {
  // On win32 the koffi/kernel32 binding loads and SetConsoleCtrlHandler installs
  // a process-scope guard (does not require a console input handle).
  const u = win32InstallCtrlCGuard();
  ok(typeof u === "function", "win32: ctrl-c guard installs via SetConsoleCtrlHandler");
  if (typeof u === "function") u(); // restore
  // DisableProcessedInput must still no-throw whether or not stdin is a console.
  let t = false; try { win32DisableProcessedInput(); } catch { t = true; }
  ok(!t, "win32: DisableProcessedInput no-throw (no-ops gracefully without a console)");
}

console.log(`tui win32 tests: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
