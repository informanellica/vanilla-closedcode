// The app shell for the vanilla TUI runtime (Stage T2): a terminal-kit
// ScreenBuffer driven by solid-js reactivity. The render model is immediate-mode
// + reactive: a single render effect calls the root draw function, which reads
// signals (so the effect re-runs and repaints on any change), and composites
// into the ScreenBuffer with a delta draw (only changed cells hit the terminal).
// Key input is dispatched inside solid `batch()` so a handler that updates many
// signals coalesces to ONE repaint.
//
// Reactivity is imported from "./reactivity.js" (Stage T4 will flip it to the
// self-written core via the engine's bundler alias / #imports, exactly as the
// desktop renderer did).
import tk from "terminal-kit";
import { createRoot, createRenderEffect, batch, onCleanup } from "./reactivity.js";
import { makeRegion } from "./layout.js";

// rootDraw(region, ctx) draws the whole UI into `region` each frame. ctx exposes
// { focusCursor(x,y) } to request the hardware cursor at an absolute cell (for
// input fields); if never called the cursor stays hidden.
export function createApp(rootDraw, options = {}) {
  const term = options.terminal ?? tk.terminal;
  let buf = null;
  let disposeRoot = null;
  let running = false;
  let suspended = false; // true while the TTY is handed to a child (suspend()): paint() must be inert
  const keyHandlers = new Set();
  const mouseHandlers = new Set();

  // Mouse grab mode passed to terminal-kit grabInput: true -> "drag" (button +
  // drag motion + wheel, enough for scroll/click/select); a string passes through;
  // falsy disables mouse (native terminal selection stays available).
  const mouseMode = options.mouse === true ? "drag" : (options.mouse || false);
  const grab = () => term.grabInput({ mouse: mouseMode });

  function makeBuffer() {
    // ScreenBufferHD = 24-bit color (hex/RGBA themes). options.createBuffer lets
    // tests inject a detached/mock buffer (no TTY).
    buf = options.createBuffer ? options.createBuffer(term) : new tk.ScreenBufferHD({ dst: term, width: term.width, height: term.height });
  }

  // HD has no "default" color sentinel — clear to the theme's bg/fg (hex).
  const baseAttr = options.attr ?? { color: "#cdd6f4", bgColor: "#1e1e2e" };

  // Any throw from rootDraw or a key handler would otherwise leave the terminal
  // in raw/fullscreen mode (unusable). Restore first, then surface the error via
  // options.onError or rethrow.
  function onFatal(error) {
    try { stop(); } catch { /* never let teardown mask the original error */ }
    if (options.onError) options.onError(error);
    else throw error;
  }

  function paint() {
    // Bail if stopped OR suspended: repaint()/onResize, a deferred toast timer, or
    // a tracked-signal change (e.g. a streaming token) can fire AFTER stop()
    // restored the terminal, or WHILE a child process (suspend()) owns the TTY —
    // drawing then would emit stray escapes over the recovered shell / the child.
    if (!buf || !running || suspended) return;
    try {
      buf.fill({ attr: baseAttr, char: " " });
      let cursor = null;
      const region = makeRegion(buf, 0, 0, term.width, term.height);
      rootDraw(region, { focusCursor: (x, y) => { cursor = { x, y }; } });
      buf.draw({ delta: true });
      if (cursor) { term.showCursor(); buf.moveTo(cursor.x, cursor.y); buf.drawCursor(); }
      else term.hideCursor();
    } catch (error) {
      onFatal(error);
    }
  }

  let procHandlers = null;
  function start() {
    if (running) return;
    running = true;
    term.fullscreen(true);
    term.hideCursor();
    makeBuffer();
    grab();
    term.on("key", onKeyEvent);
    if (mouseMode) term.on("mouse", onMouseEvent);
    term.on("resize", onResize);
    // Process-level net: an async throw must still restore the terminal before
    // the process dies. Opt-out for tests (installProcessHandlers: false).
    if (options.installProcessHandlers !== false) {
      const die = error => { stop(); console.error(error); process.exit(1); };
      procHandlers = { uncaughtException: die, unhandledRejection: die };
      process.on("uncaughtException", procHandlers.uncaughtException);
      process.on("unhandledRejection", procHandlers.unhandledRejection);
    }
    createRoot(dispose => {
      disposeRoot = dispose;
      // The render effect: reading signals inside rootDraw subscribes this
      // effect, so any signal change re-runs it and repaints (dynamic deps).
      createRenderEffect(() => paint());
    });
  }

  function onKeyEvent(name, _matches, data) {
    try {
      // batch so a handler that flips several signals produces a single repaint
      batch(() => { for (const h of [...keyHandlers]) h(name, data); });
    } catch (error) {
      onFatal(error);
    }
  }
  // terminal-kit mouse events ("MOUSE_WHEEL_UP", "MOUSE_LEFT_BUTTON_PRESSED",
  // "MOUSE_DRAG", "MOUSE_LEFT_BUTTON_RELEASED", …) with data { x, y } (1-based
  // screen coords). Routed to mouse handlers inside a batch, same as keys.
  function onMouseEvent(name, data) {
    try {
      batch(() => { for (const h of [...mouseHandlers]) h(name, data); });
    } catch (error) {
      onFatal(error);
    }
  }
  function onResize() {
    makeBuffer();
    paint();
  }

  function stop() {
    if (!running) return;
    running = false;
    term.off("key", onKeyEvent);
    if (mouseMode) term.off("mouse", onMouseEvent);
    term.off("resize", onResize);
    if (procHandlers) {
      process.off?.("uncaughtException", procHandlers.uncaughtException);
      process.off?.("unhandledRejection", procHandlers.unhandledRejection);
      procHandlers = null;
    }
    disposeRoot?.();
    disposeRoot = null;
    term.grabInput(false);
    term.hideCursor(false);
    term.styleReset();
    term.fullscreen(false);
    buf = null; // so any late repaint() bails on the !buf guard too
  }

  // Register a key handler; returns an unsubscribe. Inside a solid owner it
  // auto-unregisters on cleanup.
  function onKey(handler) {
    keyHandlers.add(handler);
    const off = () => keyHandlers.delete(handler);
    try { onCleanup(off); } catch { /* no owner — caller manages */ }
    return off;
  }
  // Register a mouse handler (h(name, data)); same lifecycle as onKey.
  function onMouse(handler) {
    mouseHandlers.add(handler);
    const off = () => mouseHandlers.delete(handler);
    try { onCleanup(off); } catch { /* no owner — caller manages */ }
    return off;
  }

  // Temporarily hand the terminal back to a child process (e.g. $EDITOR): leave
  // fullscreen + release input/mouse so the child owns the TTY, run fn(), then
  // re-enter fullscreen, re-grab input, and repaint. Restores even if fn throws.
  // When not running, just runs fn() (nothing to suspend).
  async function suspend(fn) {
    if (!running) return fn();
    suspended = true; // paint() bails now, so any tracked-signal change during fn() can't draw over the child
    term.off("key", onKeyEvent);
    if (mouseMode) term.off("mouse", onMouseEvent);
    term.off("resize", onResize);
    term.grabInput(false);
    term.styleReset();
    term.fullscreen(false);
    term.showCursor();
    try {
      return await fn();
    } finally {
      suspended = false; // clear BEFORE the restore paint() so re-entering fullscreen draws once
      if (running) {
        term.fullscreen(true);
        term.hideCursor();
        makeBuffer();
        grab();
        term.on("key", onKeyEvent);
        if (mouseMode) term.on("mouse", onMouseEvent);
        term.on("resize", onResize);
        paint();
      }
    }
  }

  return { start, stop, onKey, onMouse, suspend, repaint: paint, get term() { return term; }, get buffer() { return buf; } };
}
