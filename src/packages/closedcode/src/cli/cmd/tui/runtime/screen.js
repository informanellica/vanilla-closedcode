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
  const keyHandlers = new Set();

  function makeBuffer() {
    buf = new tk.ScreenBuffer({ dst: term, width: term.width, height: term.height });
  }

  const baseAttr = options.attr ?? { color: "default", bgColor: "default" };

  function paint() {
    if (!buf) return;
    buf.fill({ attr: baseAttr, char: " " });
    let cursor = null;
    const region = makeRegion(buf, 0, 0, term.width, term.height);
    rootDraw(region, { focusCursor: (x, y) => { cursor = { x, y }; } });
    buf.draw({ delta: true });
    if (cursor) { term.showCursor(); buf.moveTo(cursor.x, cursor.y); buf.drawCursor(); }
    else term.hideCursor();
  }

  function start() {
    if (running) return;
    running = true;
    term.fullscreen(true);
    term.hideCursor();
    makeBuffer();
    term.grabInput({ mouse: options.mouse ? "button" : false });
    term.on("key", onKeyEvent);
    term.on("resize", onResize);
    createRoot(dispose => {
      disposeRoot = dispose;
      // The render effect: reading signals inside rootDraw subscribes this
      // effect, so any signal change re-runs it and repaints (dynamic deps).
      createRenderEffect(() => paint());
    });
  }

  function onKeyEvent(name, _matches, data) {
    // batch so a handler that flips several signals produces a single repaint
    batch(() => { for (const h of [...keyHandlers]) h(name, data); });
  }
  function onResize() {
    makeBuffer();
    paint();
  }

  function stop() {
    if (!running) return;
    running = false;
    term.off("key", onKeyEvent);
    term.off("resize", onResize);
    disposeRoot?.();
    disposeRoot = null;
    term.grabInput(false);
    term.hideCursor(false);
    term.styleReset();
    term.fullscreen(false);
  }

  // Register a key handler; returns an unsubscribe. Inside a solid owner it
  // auto-unregisters on cleanup.
  function onKey(handler) {
    keyHandlers.add(handler);
    const off = () => keyHandlers.delete(handler);
    try { onCleanup(off); } catch { /* no owner — caller manages */ }
    return off;
  }

  return { start, stop, onKey, repaint: paint, get term() { return term; }, get buffer() { return buf; } };
}
