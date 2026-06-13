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

// 7. text input: editing + CJK cursor + horizontal scroll
{
  const { createTextInput } = await import("./input.js");
  const ch = c => ({ isCharacter: true });
  const inp = createTextInput("");
  inp.handleKey("あ", ch()); inp.handleKey("い", ch()); inp.handleKey("X", ch());
  eq(inp.value(), "あいX", "input insert (CJK + ascii)");
  eq(inp.cursor(), 3, "input cursor after inserts (code points)");
  inp.handleKey("LEFT"); inp.handleKey("BACKSPACE"); // delete 'い'
  eq(inp.value(), "あX", "input backspace at cursor deletes one code point");
  inp.handleKey("HOME"); inp.handleKey("Z", ch());
  eq(inp.value(), "ZあX", "input HOME then insert at start");
  // draw + cursor column (focused): cursor after "Zあ" = 1 + 2 = 3 columns
  const buf = new tk.ScreenBuffer({ width: 10, height: 1 });
  let cur = null;
  inp.setCursor(2); // after "Zあ"
  inp.draw(makeRegion(buf, 0, 0, 10, 1), { focused: true, ctx: { focusCursor: (x, y) => (cur = [x, y]) } });
  eq(cur, [3, 0], "input focusCursor at display column (Z=1 + あ=2)");
}

// 8. select list: roving focus, select, typeahead
{
  const { createSelectList } = await import("./list.js");
  let picked = null;
  let clock = 0;
  const list = createSelectList(["Apple", "Banana", "Cherry", "Avocado"], { onSelect: (it, i) => (picked = [it, i]), now: () => clock });
  list.handleKey("DOWN"); list.handleKey("DOWN");
  eq(list.active(), 2, "list DOWN x2 -> index 2");
  list.handleKey("END");
  eq(list.active(), 3, "list END -> last");
  list.handleKey("ENTER");
  eq(picked, ["Avocado", 3], "list ENTER selects active");
  list.setActive(0);
  list.handleKey("b", { isCharacter: true }); // typeahead 'b' -> Banana
  eq(list.active(), 1, "list typeahead 'b' -> Banana");
  clock = 2000; // typeahead window expired
  list.handleKey("c", { isCharacter: true }); // 'c' -> Cherry
  eq(list.active(), 2, "list typeahead 'c' (new) -> Cherry");
}

// 9. key router layer stack: top layer captures, Escape pops only the top
{
  const { createKeyRouter } = await import("./focus.js");
  const router = createKeyRouter();
  const seen = [];
  const base = { handleKey: n => { seen.push("base:" + n); return true; } };
  router.pushLayer(base);
  router.dispatch("a");
  eq(seen, ["base:a"], "router routes to base layer");
  let dialogClosed = false;
  const remove = router.pushLayer({ handleKey: n => { seen.push("dlg:" + n); return true; }, onEscape: () => { dialogClosed = true; } });
  router.dispatch("b");
  eq(seen[seen.length - 1], "dlg:b", "top layer captures keys");
  router.dispatch("ESCAPE");
  eq(dialogClosed, true, "Escape hits TOP layer onEscape only");
  remove();
  router.dispatch("c");
  eq(seen[seen.length - 1], "base:c", "after layer removed, base receives keys again");
}

// 10. focus ring: Tab cycles, routes to focused widget
{
  const { createFocusRing } = await import("./focus.js");
  const log = [];
  const a = { handleKey: n => { log.push("a:" + n); return true; } };
  const b = { handleKey: n => { log.push("b:" + n); return true; } };
  const ring = createFocusRing([a, b]);
  ring.handleKey("x");
  eq(log[log.length - 1], "a:x", "focus ring routes to first widget");
  ring.handleKey("TAB");
  ring.handleKey("y");
  eq(log[log.length - 1], "b:y", "Tab moves focus to second widget");
  ring.handleKey("TAB", { shift: true });
  ring.handleKey("z");
  eq(log[log.length - 1], "a:z", "Shift-Tab moves focus back");
  ring.handleKey("SHIFT_TAB"); // the DISTINCT key name terminal-kit actually emits
  ring.handleKey("w");
  eq(log[log.length - 1], "b:w", "SHIFT_TAB (real key name) cycles focus back");
}

// 11. centerBox: centered overlay returns inner region
{
  const { centerBox } = await import("./dialog.js");
  const buf = new tk.ScreenBuffer({ width: 20, height: 10 });
  buf.fill({ char: " " });
  const inner = centerBox(makeRegion(buf, 0, 0, 20, 10), 10, 4, { title: "Hi" });
  // outer box centered: x=(20-10)/2=5, y=(10-4)/2=3; corner at (5,3)
  eq(buf.get({ x: 5, y: 3 }).char, "╭", "centerBox centered corner");
  eq(inner.width, 8, "centerBox inner width (10-2)");
  eq(inner.x, 6, "centerBox inner x offset");
}

// 12. textarea: multiline editing, newline, Up/Down by logical line, CJK, wrap
{
  const { createTextArea } = await import("./textarea.js");
  const ch = () => ({ isCharacter: true });
  const ta = createTextArea("");
  ta.handleKey("a", ch()); ta.handleKey("ENTER"); ta.handleKey("b", ch()); ta.handleKey("c", ch());
  eq(ta.value(), "a\nbc", "textarea ENTER inserts newline");
  eq(ta.cursor(), 4, "textarea cursor after 'a\\nbc'");
  ta.handleKey("UP"); // to line 0, col 2 -> clamped to col 1 (len of 'a')
  eq(ta.locate(), { line: 0, col: 1 }, "textarea UP keeps column (clamped)");
  ta.handleKey("HOME");
  eq(ta.cursor(), 0, "textarea HOME to line start");
  ta.handleKey("DOWN"); ta.handleKey("END");
  eq(ta.value().slice(ta.cursor() - 2), "bc", "textarea DOWN+END to end of second line");
  // CJK + wrap rendering into a narrow region
  const ta2 = createTextArea("あいうえお");
  eq(ta2.rowCount(4), 3, "textarea wraps CJK to width 4 (2 glyphs/row -> 3 rows)");
  const buf = new tk.ScreenBuffer({ width: 4, height: 3 });
  buf.fill({ char: " " });
  let cur = null;
  ta2.draw(makeRegion(buf, 0, 0, 4, 3), { focused: true, ctx: { focusCursor: (x, y) => (cur = [x, y]) } });
  // fullwidth glyphs occupy a char-cell + a filler-cell, so read glyph cells directly
  eq([buf.get({ x: 0, y: 0 }).char, buf.get({ x: 2, y: 0 }).char], ["あ", "い"], "textarea row 0 = first 2 fullwidth glyphs");
  eq(cur, [2, 2], "textarea cursor at end is row 2, display col 2 (after お)");
  // cursor exactly at a CJK soft-wrap boundary on an ODD width must land at the
  // START of the next visual row, not the empty trailing cell of the previous row
  const ta3 = createTextArea("あいうえお");
  const b2 = new tk.ScreenBuffer({ width: 5, height: 6 }); b2.fill({ char: " " });
  let cur2 = null;
  ta3.setCursor(2); // before 'う', which renders at row 1 col 0 (rows: あい / うえ / お)
  ta3.draw(makeRegion(b2, 0, 0, 5, 6), { focused: true, ctx: { focusCursor: (x, y) => (cur2 = [x, y]) } });
  eq(cur2, [0, 1], "textarea cursor at a CJK wrap boundary -> start of the next visual row");
}

// 13. wordWrap hard-wraps an over-long no-space word (CJK-loss regression)
{
  const long = "日本語".repeat(10); // 30 display cols, NO spaces -> one "word"
  const lines = wordWrap("› " + long, 20);
  eq(lines.every(l => width(l) <= 20), true, "wordWrap: every line within the width");
  eq(lines.map(l => l.replace(/\s/g, "")).join("").includes("日本語日本語"), true, "wordWrap: CJK content preserved (not dropped)");
  eq(wordWrap("aaaaaaaa", 3), ["aaa", "aaa", "aa"], "wordWrap: over-long ascii word hard-wrapped mid-line");
  eq(wordWrap("foo bar baz", 7), ["foo bar", "baz"], "wordWrap: ordinary wrapping unchanged");
  // wrap: a single glyph wider than max must not emit a phantom empty leading line
  eq(wrap("あ", 1), ["あ"], "wrap: over-wide single glyph -> no phantom empty line");
  eq(wrapMessages(["あ", "ok"], 1)[0], "あ", "wrapMessages: no leading blank line at width 1");
}

// 14. select-list typeahead: the DEFAULT (un-injected) clock resets after 800ms
{
  const { createSelectList } = await import("./list.js");
  const list = createSelectList(["Apple", "Banana", "Cherry", "Avocado"]); // no `now` -> default real clock
  list.handleKey("b", { isCharacter: true });
  eq(list.active(), 1, "default-clock typeahead 'b' -> Banana");
  await new Promise(r => setTimeout(r, 810)); // exceed the 800ms window with the REAL clock
  list.handleKey("a", { isCharacter: true }); // a fresh search, not "ba"
  eq(list.active(), 3, "after >800ms the window resets: 'a' -> Avocado (not stuck on 'ba')");
}

console.log(`tui runtime tests: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
