// Node-run unit tests for the vanilla prompt / autocomplete / timeline (Stage
// T3, stage 2). Headless: drive the controllers directly and render into a
// detached ScreenBuffer.   node src/cli/cmd/tui/vanilla/widgets.test.js
import tk from "terminal-kit";
import { makeRegion } from "../runtime/layout.js";
import { createAutocomplete } from "./autocomplete.js";
import { createPrompt, createPromptHistory } from "./prompt.js";
import { createTimeline, buildTimelineLines } from "./timeline.js";
import { createToast } from "./toast.js";

let passed = 0, failed = 0;
function eq(a, b, label) {
  const x = JSON.stringify(a), y = JSON.stringify(b);
  if (x === y) passed++; else { failed++; console.error(`FAIL ${label}: got ${x}, want ${y}`); }
}
function ok(c, label) { eq(!!c, true, label); }
function rowText(buf, y, w) { let s = ""; for (let i = 0; i < w; i++) s += buf.get({ x: i, y }).char; return s.replace(/\s+$/, ""); }
const char = () => ({ isCharacter: true });

// --- autocomplete ---------------------------------------------------------
{
  const ac = createAutocomplete({
    commands: [{ name: "help" }, { name: "models" }, { name: "new" }],
    listFiles: q => ["src/app.js", "src/main.js", "README.md"].filter(f => f.includes(q)),
  });
  ac.onInput("/m", 2);
  ok(ac.visible(), "autocomplete visible after '/m'");
  eq(ac.items().map(i => i.label), ["models"], "command filter '/m' -> models");
  ac.onInput("@main", 5);
  eq(ac.items().map(i => i.label), ["src/main.js"], "file filter '@main'");
  const r = ac.handleKey("ENTER");
  eq(r.accept.text, "@src/main.js ", "accept inserts '@<path> '");
  eq([r.accept.from, r.accept.to], [0, 5], "accept splice range covers the '@main' token");
  ac.onInput("hello world", 11);
  eq(ac.visible(), false, "no trigger -> hidden");
}

// --- prompt history -------------------------------------------------------
{
  const h = createPromptHistory();
  h.append({ input: "one", mode: "normal" });
  h.append({ input: "two", mode: "normal" });
  eq(h.move(-1, "draft").input, "two", "history Up -> latest");
  eq(h.move(-1).input, "one", "history Up again -> older");
  eq(h.move(1).input, "two", "history Down -> newer");
  eq(h.move(1).input, "draft", "history Down at end -> restores draft");
}

// --- prompt: submit, shell mode, autocomplete accept ----------------------
{
  let submitted = null;
  const p = createPrompt({
    placeholders: { normal: ["x"], shell: ["y"] },
    commands: [{ name: "help" }],
    onSubmit: (text, info) => (submitted = { text, mode: info.mode }),
  });
  for (const c of "hi") p.handleKey(c, char());
  eq(p.value(), "hi", "prompt accumulates input");
  p.handleKey("ENTER");
  eq(submitted, { text: "hi", mode: "normal" }, "Enter submits trimmed text + mode");
  eq(p.value(), "", "prompt clears after submit");
  // shell mode
  p.handleKey("!", char());
  eq(p.mode(), "shell", "'!' enters shell mode");
  for (const c of "ls") p.handleKey(c, char());
  p.handleKey("ENTER");
  eq(submitted, { text: "ls", mode: "shell" }, "shell-mode submit carries mode");
  eq(p.mode(), "normal", "submit resets to normal mode");
  // Shift+Enter inserts a newline instead of submitting
  for (const c of "ab") p.handleKey(c, char());
  p.handleKey("ENTER", { shift: true });
  p.handleKey("c", char());
  eq(p.value(), "ab\nc", "Shift-Enter inserts a newline");
  // real terminal-kit emits Shift-Enter / Ctrl-J as DISTINCT key names (no data.shift)
  p.handleKey("SHIFT_ENTER");
  p.handleKey("d", char());
  eq(p.value(), "ab\nc\nd", "SHIFT_ENTER (real key name) inserts a newline");
  p.handleKey("CTRL_J");
  eq(p.value(), "ab\nc\nd\n", "CTRL_J inserts a newline");
}

// --- prompt height grows with content (1..6 input rows + 2 meta/hint) ------
{
  const p = createPrompt({ placeholders: { normal: [], shell: [] } });
  eq(p.height(40), 3, "empty prompt height = 1 input + 2");
  for (const c of "a\nb\nc") p.handleKey(c === "\n" ? "ENTER" : c, c === "\n" ? { shift: true } : char());
  eq(p.height(40), 5, "3-line input -> height 5");
}

// --- timeline: parts rendering + bottom-pin + scroll ----------------------
{
  const msgs = [
    { role: "user", parts: [{ type: "text", text: "hello" }] },
    { role: "assistant", parts: [{ type: "tool", name: "read", title: "file.js", status: "completed" }, { type: "text", text: "done" }] },
  ];
  const lines = buildTimelineLines(msgs, 40);
  const lineText = l => l.map(s => s.text).join("");
  ok(lines.some(l => lineText(l) === "› hello"), "user text gets the '›' marker (rich line)");
  ok(lines.some(l => lineText(l).startsWith("● read")), "tool part renders a bullet line");
  const tl = createTimeline(() => msgs, {});
  const buf = new tk.ScreenBufferHD({ width: 40, height: 2 }); // smaller than the 4 content lines
  buf.fill({ char: " " });
  const res = tl.draw(makeRegion(buf, 0, 0, 40, 2));
  eq(res.offset, 0, "timeline bottom-pinned by default");
  eq(res.maxStart, 2, "maxStart = content(4) - viewport(2)");
  ok(rowText(buf, 1, 40).includes("done"), "newest line pinned to the bottom row when content overflows");
}

// --- toast: injectable-clock expiry + bottom-right draw -------------------
{
  let clock = 0;
  const t = createToast({ now: () => clock });
  t.show({ message: "hello", duration: 1000 });
  eq(t.visible().length, 1, "toast visible after show");
  clock = 500; eq(t.visible().length, 1, "toast visible before expiry");
  clock = 1500; eq(t.visible().length, 0, "toast expired after its duration");
  clock = 2000; t.show({ message: "saved", variant: "success", duration: 1000 });
  const buf = new tk.ScreenBufferHD({ width: 30, height: 4 }); buf.fill({ char: " " });
  t.draw(makeRegion(buf, 0, 0, 30, 4));
  ok(rowText(buf, 3, 30).includes("saved"), "toast drawn on the bottom row");
}

// --- toast: schedules a repaint at its duration; CJK positioned by width ---
{
  let scheduled = null;
  const t = createToast({ now: () => 0, scheduleRepaint: ms => (scheduled = ms) });
  t.show({ message: "x", duration: 1234 });
  eq(scheduled, 1234, "toast schedules a repaint at its duration (idle expiry)");
  const buf = new tk.ScreenBufferHD({ width: 12, height: 2 }); buf.fill({ char: " " });
  t.show({ message: "日本語", duration: 9999 });
  t.draw(makeRegion(buf, 0, 0, 12, 2));
  // " 日本語 " = 8 display cols, right-aligned in width 12 -> starts at col 4, "日" at col 5.
  // (With code-unit .length=6 it would start at col 6 and overflow the right edge.)
  eq(buf.get({ x: 5, y: 1 }).char, "日", "CJK toast positioned by display width, in-bounds");
}

// --- timeline: draw is pure; scrolled view is stable across appends --------
{
  const msgs = [];
  for (let i = 0; i < 20; i++) msgs.push({ role: "assistant", parts: [{ type: "text", text: "line" + i }] });
  const tl = createTimeline(() => msgs, {});
  const buf = new tk.ScreenBufferHD({ width: 30, height: 5 }); buf.fill({ char: " " });
  const reg = makeRegion(buf, 0, 0, 30, 5);
  const viewport = () => { const r = []; for (let y = 0; y < 5; y++) r.push(rowText(buf, y, 30)); return r; };
  tl.draw(reg); // establish viewport bounds (maxStart) before scrolling
  tl.handleKey("PAGE_UP"); // scroll up so offset>0 (meaningful purity check)
  buf.fill({ char: " " }); tl.draw(reg);
  const scrolled = tl.offset();
  ok(scrolled > 0, "PageUp scrolls up on overflowing content");
  const v1 = viewport();
  buf.fill({ char: " " }); tl.draw(reg); // draw again, no state change
  eq(tl.offset(), scrolled, "draw() does not mutate scroll state (no re-entrant repaint)");
  // append below: the WHOLE scrolled viewport must stay put (not just row 0, which is blank)
  const beforeAppend = viewport();
  msgs.push({ role: "assistant", parts: [{ type: "text", text: "NEWEST" }] });
  buf.fill({ char: " " }); tl.draw(reg);
  eq(viewport(), beforeAppend, "scrolled-up viewport stays put when content is appended below");
}

// --- timeline: PageUp on a viewport-fitting conversation keeps follow -------
{
  const msgs = [{ role: "assistant", parts: [{ type: "text", text: "only message" }] }];
  const tl = createTimeline(() => msgs, {});
  const buf = new tk.ScreenBufferHD({ width: 20, height: 5 }); buf.fill({ char: " " });
  const reg = makeRegion(buf, 0, 0, 20, 5);
  tl.draw(reg);
  tl.handleKey("PAGE_UP"); // nothing to scroll back to -> must NOT break follow
  eq(tl.follow(), true, "PageUp on a fitting timeline keeps follow=true");
  for (let i = 0; i < 10; i++) msgs.push({ role: "assistant", parts: [{ type: "text", text: "stream" + i }] });
  buf.fill({ char: " " }); tl.draw(reg);
  ok(rowText(buf, 4, 20).includes("stream9"), "streamed lines still auto-scroll into view (newest at bottom)");
}

// --- prompt history: edit mid-browse, then Up recalls latest + keeps draft --
{
  const h = createPromptHistory();
  const p = createPrompt({ placeholders: { normal: [], shell: [] }, history: h, onSubmit: () => {} });
  for (const s of ["one", "two", "three"]) { for (const c of s) p.handleKey(c, char()); p.handleKey("ENTER"); }
  p.handleKey("UP"); p.handleKey("UP"); eq(p.value(), "two", "Up Up -> two");
  p.handleKey("Z", char()); eq(p.value(), "Ztwo", "edit the recalled buffer");
  p.textarea.setCursor(0);
  p.handleKey("UP"); eq(p.value(), "three", "after an edit, Up recalls the LATEST (history cursor reset, not stale)");
  p.handleKey("DOWN"); eq(p.value(), "Ztwo", "Down at the end restores the edited draft (not silently lost)");
}

// --- prompt: history Up/Down round-trip + setText doesn't trip shell mode --
{
  const h = createPromptHistory();
  const p = createPrompt({ placeholders: { normal: [], shell: [] }, history: h, onSubmit: () => {} });
  for (const c of "one") p.handleKey(c, char()); p.handleKey("ENTER");
  for (const c of "two") p.handleKey(c, char()); p.handleKey("ENTER");
  eq(p.value(), "", "cleared after submits");
  p.handleKey("UP"); eq(p.value(), "two", "Up -> latest");
  p.handleKey("UP"); eq(p.value(), "one", "Up again -> older");
  p.handleKey("DOWN"); eq(p.value(), "two", "Down -> newer (round-trip works)");
  p.handleKey("DOWN"); eq(p.value(), "", "Down at the end restores the draft");
  p.setText("!ls -la");
  eq(p.value(), "!ls -la", "setText keeps the leading '!'");
  eq(p.mode(), "normal", "setText('!...') does not trip shell mode");
  p.setText(""); // empty + cursor at 0 so "!" triggers shell mode
  p.handleKey("!", char()); eq(p.mode(), "shell", "entered shell mode");
  p.setText("plain recall");
  eq(p.mode(), "normal", "setText resets mode to normal (e.g. stash restore from shell mode)");
}

console.log(`tui vanilla widgets tests: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
