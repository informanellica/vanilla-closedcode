// Node-run tests for the vanilla TUI app shell loop (screen.js). No TTY: inject a
// mock terminal + a mock ScreenBuffer (options.createBuffer) so start()/stop() and
// the error safety net can be exercised headlessly.
//   node src/cli/cmd/tui/runtime/screen.test.js
import { createApp } from "./screen.js";
import { createSignal } from "./reactivity.js";

let passed = 0, failed = 0;
function eq(a, b, label) { if (JSON.stringify(a) === JSON.stringify(b)) passed++; else { failed++; console.error(`FAIL ${label}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); } }
function ok(c, label) { eq(!!c, true, label); }

function mockTerm() {
  const calls = [], listeners = {};
  return {
    width: 20, height: 6, calls, listeners,
    fullscreen(v) { calls.push(["fullscreen", v]); },
    hideCursor(v) { calls.push(["hideCursor", v]); },
    showCursor() { calls.push(["showCursor"]); },
    styleReset() { calls.push(["styleReset"]); },
    grabInput(v) { calls.push(["grabInput", v]); },
    on(ev, fn) { (listeners[ev] ??= []).push(fn); },
    off(ev, fn) { listeners[ev] = (listeners[ev] || []).filter(f => f !== fn); },
    emit(ev, ...a) { for (const fn of [...(listeners[ev] || [])]) fn(...a); },
  };
}
const mockBuffer = () => ({ fill() {}, put() {}, get() { return { char: " " }; }, draw() {}, moveTo() {}, drawCursor() {} });
const exited = c => c.some(([k, v]) => k === "fullscreen" && v === false);

// 1. start enters fullscreen + grabs input; stop restores; stop is idempotent
{
  const term = mockTerm();
  const app = createApp(() => {}, { terminal: term, createBuffer: mockBuffer, installProcessHandlers: false });
  app.start();
  ok(term.calls.some(([k, v]) => k === "fullscreen" && v === true), "start enters fullscreen");
  ok(term.calls.some(([k]) => k === "grabInput"), "start grabs input");
  app.stop();
  ok(exited(term.calls), "stop exits fullscreen (terminal restored)");
  app.stop(); // idempotent — must not throw
  passed++;
}

// 2. a throwing rootDraw restores the terminal and surfaces via onError
{
  const term = mockTerm();
  const [boom, setBoom] = createSignal(false);
  const errors = [];
  const app = createApp(region => { region.line(0, "x"); if (boom()) throw new Error("draw fail"); },
    { terminal: term, createBuffer: mockBuffer, installProcessHandlers: false, onError: e => errors.push(e) });
  app.onKey(name => { if (name === "x") setBoom(true); });
  app.start();
  eq(errors.length, 0, "no error on the first (clean) paint");
  term.emit("key", "x", null, {}); // flips boom -> repaint -> draw throws
  ok(errors.length >= 1, "throwing draw routed to onError (not swallowed)");
  ok(exited(term.calls), "terminal restored after the throw (not left raw/fullscreen)");
}

// 3. repaint() after stop() is inert (a deferred toast timer must not draw over
//    the restored terminal)
{
  const term = mockTerm();
  let draws = 0;
  const app = createApp(() => { draws++; }, { terminal: term, createBuffer: mockBuffer, installProcessHandlers: false });
  app.start();
  const afterStart = draws;
  ok(afterStart >= 1, "at least one paint during start");
  app.stop();
  app.repaint(); // simulates a late scheduled toast repaint
  eq(draws, afterStart, "repaint() after stop() draws nothing (no stray frame over the restored shell)");
}

// 4. mouse: enabled -> grabs in drag mode + routes "mouse" events to onMouse
{
  const term = mockTerm();
  const got = [];
  const app = createApp(() => {}, { terminal: term, createBuffer: mockBuffer, installProcessHandlers: false, mouse: true });
  app.onMouse((name, data) => got.push([name, data]));
  app.start();
  ok(term.calls.some(([k, v]) => k === "grabInput" && v && v.mouse === "drag"), "mouse:true grabs input in drag mode");
  term.emit("mouse", "MOUSE_WHEEL_UP", { x: 3, y: 2 });
  eq(got, [["MOUSE_WHEEL_UP", { x: 3, y: 2 }]], "mouse event routed to onMouse handler");
  app.stop();
  ok(!(term.listeners.mouse || []).length, "stop() removes the mouse listener");
}

// 5. mouse: disabled by default -> no mouse grab, no mouse listener
{
  const term = mockTerm();
  const app = createApp(() => {}, { terminal: term, createBuffer: mockBuffer, installProcessHandlers: false });
  app.start();
  ok(term.calls.some(([k, v]) => k === "grabInput" && (!v || v.mouse === false)), "mouse off by default (grab mouse:false)");
  ok(!(term.listeners.mouse || []).length, "no mouse listener when mouse disabled");
  app.stop();
}

// 6. suspend(): hands the TTY back during fn, re-enters fullscreen after
{
  const term = mockTerm();
  const app = createApp(() => {}, { terminal: term, createBuffer: mockBuffer, installProcessHandlers: false });
  app.start();
  const fsEnters = () => term.calls.filter(([k, v]) => k === "fullscreen" && v === true).length;
  const before = fsEnters();
  let exitedDuring = null;
  const ret = await app.suspend(async () => { exitedDuring = exited(term.calls); return "done"; });
  eq(ret, "done", "suspend returns fn's result");
  ok(exitedDuring, "fullscreen exited (TTY released) during suspend");
  ok(fsEnters() > before, "re-entered fullscreen after suspend");
  app.stop();
}

// 7. suspend(): paint() is INERT while suspended — a tracked-signal change during
//    fn() (streaming token / toast timer) must NOT draw over the child process
{
  const term = mockTerm();
  let draws = 0;
  const countingBuffer = () => ({ fill() {}, put() {}, get() { return { char: " " }; }, draw() { draws++; }, moveTo() {}, drawCursor() {} });
  const [tick, setTick] = createSignal(0);
  const app = createApp(() => { tick(); }, { terminal: term, createBuffer: countingBuffer, installProcessHandlers: false });
  app.start();
  const beforeSuspend = draws;
  let duringDraws = null;
  await app.suspend(async () => {
    const d0 = draws;
    setTick(t => t + 1); // tracked-signal write -> render effect re-runs paint()
    setTick(t => t + 1);
    duringDraws = draws - d0; // must be 0: paint() bails while suspended
  });
  eq(duringDraws, 0, "no buf.draw() during suspend (signal changes don't draw over the child)");
  ok(draws > beforeSuspend, "exactly one restore paint() after suspend re-enters fullscreen");
  app.stop();
}

console.log(`tui screen tests: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
