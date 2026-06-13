// Node-run unit tests for the vanilla prompt / autocomplete / timeline (Stage
// T3, stage 2). Headless: drive the controllers directly and render into a
// detached ScreenBuffer.   node src/cli/cmd/tui/vanilla/widgets.test.mjs
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
  ok(lines.some(l => l.str === "› hello"), "user text gets the '›' marker");
  ok(lines.some(l => l.str.startsWith("● read")), "tool part renders a bullet line");
  const tl = createTimeline(() => msgs, {});
  const buf = new tk.ScreenBuffer({ width: 40, height: 2 }); // smaller than the 4 content lines
  buf.fill({ char: " " });
  const res = tl.draw(makeRegion(buf, 0, 0, 40, 2));
  eq(res.offset, 0, "timeline bottom-pinned by default");
  eq(res.maxScroll, 2, "maxScroll = content(4) - viewport(2)");
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
  const buf = new tk.ScreenBuffer({ width: 30, height: 4 }); buf.fill({ char: " " });
  t.draw(makeRegion(buf, 0, 0, 30, 4));
  ok(rowText(buf, 3, 30).includes("saved"), "toast drawn on the bottom row");
}

console.log(`tui vanilla widgets tests: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
