// Startup splash controller. Deliberately framework-free: it imports NOTHING
// (no reactive runtime, no components, no CSS), so the splash that loading.html
// renders statically keeps working — and updating — even if the import map,
// reactive runtime or CSS fail to load. The splash is the surface that must
// survive a broken renderer the most. This script only updates the status
// line's text and the progress fill's width on the static markup, then signals
// completion via the preload bridge.

const statusEl = document.getElementById("loading-status");
const fillEl = document.getElementById("loading-progress");
const lines = ["Just a moment...", "Migrating your database", "This may take a couple of minutes"];
const delays = [3000, 9000];

let phase = null;
let line = 0;
let percent = 0;
let completed = false;

const setStatus = text => { if (statusEl) statusEl.textContent = text; };
const setFill = value => { if (fillEl) fillEl.style.width = Math.max(0, Math.min(100, value)) + "%"; };

function render() {
  if (phase === "done") { setStatus("All done"); setFill(100); return; }
  setStatus(phase === "sqlite_waiting" ? (lines[line] ?? lines[0]) : "Just a moment...");
  // Mirror the previous behaviour: hold at a visible minimum until real progress.
  setFill(Math.max(25, percent));
}

function complete() {
  if (completed) return;
  completed = true;
  // Let the splash settle on "All done / 100%" before the main window swaps in.
  setTimeout(() => window.api?.loadingWindowComplete?.(), 1000);
}

function setPhase(next) {
  phase = next ?? null;
  render();
  if (phase === "done") complete();
}

render();

const api = window.api;
if (api) {
  // Drive the status text from initialization steps; a rejection just leaves the
  // splash on "Just a moment..." (the main process still owns the swap timeout).
  const init = api.awaitInitialization?.(step => setPhase(step?.phase ?? null));
  if (init && typeof init.catch === "function") init.catch(() => undefined);

  const timers = delays.map((ms, i) => setTimeout(() => { line = i + 1; render(); }, ms));

  const off = api.onSqliteMigrationProgress?.(progress => {
    if (progress.type === "InProgress") { percent = Math.max(0, Math.min(100, progress.value)); render(); }
    if (progress.type === "Done") { percent = 100; setPhase("done"); }
  });

  window.addEventListener("beforeunload", () => {
    try { off?.(); } catch {}
    timers.forEach(clearTimeout);
  });
} else {
  // No preload bridge (shouldn't happen) — nothing to await; let main swap us out.
  complete();
}

export {};
