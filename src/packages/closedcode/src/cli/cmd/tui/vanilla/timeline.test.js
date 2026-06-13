// Node-run tests for timeline rendering of tool parts (diff + output detail) and
// markdown assistant text.   node src/cli/cmd/tui/vanilla/timeline.test.js
import { buildTimelineLines } from "./timeline.js";

let passed = 0, failed = 0;
function eq(a, b, label) { if (JSON.stringify(a) === JSON.stringify(b)) passed++; else { failed++; console.error(`FAIL ${label}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); } }
function ok(c, label) { eq(!!c, true, label); }
const text = l => l.map(s => s.text).join("");

// 1. edit-tool diff renders indented under the bullet
{
  const msgs = [{ role: "assistant", parts: [
    { type: "tool", name: "edit", title: "app.js", status: "completed", diff: { old: "const a = 1", new: "const a = 2" } },
  ] }];
  const lines = buildTimelineLines(msgs, 60).map(text);
  ok(lines.some(l => l.startsWith("● edit")), "tool bullet line");
  ok(lines.some(l => l.includes("- const a = 1")), "diff removed line shown (indented)");
  ok(lines.some(l => l.includes("+ const a = 2")), "diff added line shown");
  ok(lines.every(l => l.startsWith("●") || l.startsWith("  ") || l === ""), "detail lines are indented 2 cols");
}

// 2. read-tool text output renders code-styled + capped
{
  const out = Array.from({ length: 20 }, (_, i) => "line " + i).join("\n");
  const msgs = [{ role: "assistant", parts: [{ type: "tool", name: "read", title: "big.txt", status: "completed", output: out }] }];
  const lines = buildTimelineLines(msgs, 40).map(text);
  ok(lines.some(l => l.includes("line 0")), "first output line shown");
  ok(lines.some(l => l.includes("more lines")), "long output capped with a '+N more lines' marker");
  ok(!lines.some(l => l.includes("line 19")), "lines past the cap are not shown");
}

// 3. assistant markdown still renders (bold marker stripped, list bullet present)
{
  const msgs = [{ role: "assistant", parts: [{ type: "text", text: "**bold** text\n- item" }] }];
  const lines = buildTimelineLines(msgs, 40).map(text);
  ok(lines.some(l => l.includes("bold text") && !l.includes("**")), "markdown bold marker stripped");
  ok(lines.some(l => l.startsWith("• item")), "markdown list bullet rendered");
}

console.log(`tui vanilla timeline tests: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
