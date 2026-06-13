// Node-run tests for the diff renderer.   node src/cli/cmd/tui/vanilla/diff.test.js
import { richWidth } from "./richtext.js";
import { renderUnifiedDiff, computeLineDiff, renderLineDiff, renderTextDiff } from "./diff.js";

let passed = 0, failed = 0;
function eq(a, b, label) { if (JSON.stringify(a) === JSON.stringify(b)) passed++; else { failed++; console.error(`FAIL ${label}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); } }
function ok(c, label) { eq(!!c, true, label); }
const text = l => l.map(s => s.text).join("");
const tokenOf = l => (l.find(s => s.text.trim()) || l[0] || {}).style?.token;

// --- unified diff ---------------------------------------------------------
{
  const diff = ["--- a/file.js", "+++ b/file.js", "@@ -1,3 +1,3 @@", " keep", "-old line", "+new line"].join("\n");
  const lines = renderUnifiedDiff(diff, 40);
  ok(lines.some(l => text(l).startsWith("@@")), "hunk header rendered");
  const added = lines.find(l => text(l).includes("new line"));
  const removed = lines.find(l => text(l).includes("old line"));
  eq([text(added).slice(0, 2), tokenOf(added)], ["+ ", "diffAdded"], "added line: '+ ' gutter + diffAdded token");
  eq([text(removed).slice(0, 2), tokenOf(removed)], ["- ", "diffRemoved"], "removed line: '- ' gutter + diffRemoved token");
  const ctx = lines.find(l => text(l).includes("keep"));
  eq([text(ctx).slice(0, 2), tokenOf(ctx)], ["  ", "diffContext"], "context line: 2-space gutter + diffContext");
  // file headers are not mistaken for +/- removals
  ok(lines.some(l => text(l) === "--- a/file.js") && lines.some(l => text(l) === "+++ b/file.js"), "file headers kept verbatim (not parsed as -/+)");
}

// --- LCS line diff --------------------------------------------------------
{
  const hunks = computeLineDiff("a\nb\nc", "a\nB\nc");
  eq(hunks, [{ type: "ctx", text: "a" }, { type: "del", text: "b" }, { type: "add", text: "B" }, { type: "ctx", text: "c" }], "LCS: middle line replaced (del b, add B)");
  const more = computeLineDiff("x\ny", "x\ny\nz");
  eq(more.at(-1), { type: "add", text: "z" }, "LCS: appended line is an add");
  const lines = renderLineDiff(hunks, 30);
  ok(lines.some(l => text(l) === "- b") && lines.some(l => text(l) === "+ B"), "renderLineDiff markers");
}

// --- before/after convenience + CJK wrap ----------------------------------
{
  const lines = renderTextDiff("旧", "新", 20);
  ok(lines.some(l => text(l).includes("新")) && lines.some(l => text(l).includes("旧")), "renderTextDiff shows CJK add/del");
  const wide = renderUnifiedDiff("+" + "あ".repeat(20), 12); // 40-col content into width 12
  ok(wide.every(l => richWidth(l) <= 12), "long diff line wraps within width (CJK)");
  ok(wide.length > 1, "long line wrapped to multiple rows");
}

console.log(`tui vanilla diff tests: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
