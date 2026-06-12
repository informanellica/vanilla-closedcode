// Node-run tests for the vanilla TUI runtime (Stage T2). No TTY needed: render
// into a DETACHED terminal-kit ScreenBuffer and inspect cells; drive reactivity
// with solid-js signals (the createApp render loop uses the same pattern).
//   node src/cli/cmd/tui/runtime/runtime.test.mjs   (from packages/closedcode)
import tk from "terminal-kit";
import { createRoot, createRenderEffect, createSignal, batch } from "./reactivity.js";
import { makeRegion, column, row, box } from "./layout.js";
import { width, wrap, wordWrap, truncate, fit, sliceCols } from "./text.js";
import { wrapMessages, drawScrollLines } from "./scroll.js";

let passed = 0, failed = 0;
function eq(a, b, label) {
  const x = JSON.stringify(a), y = JSON.stringify(b);
  if (x === y) passed++; else { failed++; console.error(`FAIL ${label}: got ${x}, want ${y}`); }
}
// Read a region's row back as a trimmed string (fillers/ spaces collapse at end).
function rowText(buf, x, y, w) {
  let s = "";
  for (let i = 0; i < w; i++) s += buf.get({ x: x + i, y }).char;
  return s.replace(/\s+$/, "");
}

// 1. width-aware text helpers (CJK)
eq(width("日本語"), 6, "width fullwidth");
eq(width("あa"), 3, "width mixed");
eq(wrap("ABCDEF", 3), ["ABC", "DEF"], "wrap hard");
eq(wrap("あいう", 4), ["あい", "う"], "wrap fullwidth boundary");
eq(truncate("日本語テスト", 6), "日本…", "truncate fullwidth + ellipsis");
eq(fit("hi", 6, "right"), "    hi", "fit right");
eq(fit("hi", 6, "center"), "  hi  ", "fit center");
eq(sliceCols("あいう", 2, 2), "い", "sliceCols fullwidth window");
eq(wordWrap("foo bar baz", 7), ["foo bar", "baz"], "wordWrap");

// 2. layout: column splits height, fixed + flex
{
  const buf = new tk.ScreenBuffer({ width: 10, height: 5 });
  buf.fill({ char: " " });
  const region = makeRegion(buf, 0, 0, 10, 5);
  column(region, [
    { size: 1, draw: r => r.line(0, "HEAD", { color: "white" }) },
    { size: "flex", draw: r => { r.line(0, "body0"); r.line(r.height - 1, "bodyN"); } },
    { size: 1, draw: r => r.line(0, "FOOT") },
  ]);
  eq(rowText(buf, 0, 0, 10), "HEAD", "column head row 0");
  eq(rowText(buf, 0, 1, 10), "body0", "column flex top row 1");
  eq(rowText(buf, 0, 3, 10), "bodyN", "column flex bottom row 3");
  eq(rowText(buf, 0, 4, 10), "FOOT", "column foot row 4");
}

// 3. layout: row splits width; clipping past region width
{
  const buf = new tk.ScreenBuffer({ width: 12, height: 1 });
  buf.fill({ char: " " });
  const region = makeRegion(buf, 0, 0, 12, 1);
  row(region, [
    { size: 6, draw: r => r.line(0, "LEFT") },
    { size: "flex", draw: r => r.line(0, "RIGHTSIDE") },
  ]);
  // left col (6 wide) shows LEFT padded; right col (6 wide) truncates RIGHTSIDE
  eq(rowText(buf, 0, 0, 6), "LEFT", "row left col");
  eq(width(rowText(buf, 6, 0, 6)) <= 6, true, "row right col within 6 cols");
}

// 4. box border + inner region
{
  const buf = new tk.ScreenBuffer({ width: 8, height: 4 });
  buf.fill({ char: " " });
  const region = makeRegion(buf, 0, 0, 8, 4);
  const inner = box(region, { title: "T" });
  inner.line(0, "x");
  eq(buf.get({ x: 0, y: 0 }).char, "╭", "box corner");
  eq(buf.get({ x: 1, y: 1 }).char, "x", "box inner draw at (1,1)");
  eq(inner.width, 6, "box inner width = outer-2");
}

// 5. scroll windowing (bottom-pinned)
{
  const lines = Array.from({ length: 10 }, (_, i) => `L${i}`);
  const buf = new tk.ScreenBuffer({ width: 6, height: 3 });
  buf.fill({ char: " " });
  const region = makeRegion(buf, 0, 0, 6, 3);
  const r0 = drawScrollLines(region, lines, 0, {}); // bottom: L7,L8,L9
  eq([rowText(buf, 0, 0, 6), rowText(buf, 0, 1, 6), rowText(buf, 0, 2, 6)], ["L7", "L8", "L9"], "scroll bottom-pinned");
  eq(r0.maxScroll, 7, "scroll maxScroll");
  buf.fill({ char: " " });
  drawScrollLines(region, lines, 2, {}); // scrolled up 2: L5,L6,L7
  eq([rowText(buf, 0, 0, 6), rowText(buf, 0, 2, 6)], ["L5", "L7"], "scroll offset 2");
}

// 6. REACTIVITY: a render effect repaints when a signal changes (the createApp model)
{
  const buf = new tk.ScreenBuffer({ width: 8, height: 1 });
  const [msg, setMsg] = createSignal("hi");
  let paints = 0;
  createRoot(() => {
    createRenderEffect(() => {
      paints++;
      buf.fill({ char: " " });
      makeRegion(buf, 0, 0, 8, 1).line(0, msg());
    });
  });
  eq(rowText(buf, 0, 0, 8), "hi", "reactive initial paint");
  setMsg("世界");
  eq(buf.get({ x: 0, y: 0 }).char, "世", "reactive repaint on signal change (fullwidth)");
  batch(() => { setMsg("a"); setMsg("b"); });
  eq(paints, 3, "batch coalesces a+b into one repaint (initial + set + batched)");
  eq(rowText(buf, 0, 0, 8), "b", "reactive final value");
}

console.log(`tui runtime tests: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
