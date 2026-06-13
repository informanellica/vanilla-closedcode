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

// --- regressions from the renderer bug-hunt -------------------------------
{
  // leading indentation preserved (the HIGH bug: code structure was flattened)
  const l = renderUnifiedDiff("+        deeply.indented()", 40).find(x => text(x).includes("deeply"));
  ok(text(l).includes("        deeply.indented()"), "diff preserves 8-space leading indentation");
  // nested indentation stays distinct
  const nested = renderTextDiff("def f():\n    if x:\n        return 1", "def f():\n    if x:\n        return 2", 60).map(text);
  ok(nested.some(x => x.includes("    if x:")), "4-space indent kept");
  ok(nested.some(x => x.includes("        return")), "8-space indent kept distinct from 4-space");
  // tabs expand to spaces (not dropped)
  ok(text(renderUnifiedDiff("+\tindented", 40)[0]).includes("    indented"), "leading tab expands to spaces");
}
{
  // empty-side diff: no phantom blank +/- line (new-file write)
  eq(computeLineDiff("", "x\ny"), [{ type: "add", text: "x" }, { type: "add", text: "y" }], "new-file diff has no phantom 'del' blank line");
  eq(computeLineDiff("x\ny", ""), [{ type: "del", text: "x" }, { type: "del", text: "y" }], "cleared-file diff has no phantom 'add' blank line");
  eq(computeLineDiff("line1", "line1\n"), [{ type: "ctx", text: "line1" }], "trailing-newline only -> no phantom add");
  // backslash content line is NOT mistaken for the '\\ No newline' marker
  const bs = renderUnifiedDiff("\\windows\\path", 50)[0];
  ok(text(bs).startsWith("  "), "backslash content line keeps a context gutter (not the No-newline marker)");
}

// --- optional syntax highlighting (opts.lang) -----------------------------
{
  const styleOfWord = (line, word) => (line.find(s => s.text === word) || {}).style;
  // added JS line: keyword + number colored; marker stays diffAdded; bg tinted
  const added = renderUnifiedDiff("+const x = 1", 40, { lang: "js" }).find(l => text(l).includes("const"));
  eq(text(added), "+ const x = 1", "lang: added line tiles exactly (marker + highlighted body)");
  eq(styleOfWord(added, "const")?.token, "syntaxKeyword", "lang: 'const' highlighted as keyword");
  eq(styleOfWord(added, "1")?.token, "syntaxNumber", "lang: '1' highlighted as number");
  eq(styleOfWord(added, "const")?.bg, "diffAddedBg", "lang: added body segments carry diffAddedBg tint");
  eq(added[0].style.bg, "diffAddedBg", "lang: added gutter marker also tinted");
  ok(added[0].style.token === "diffAdded", "lang: gutter marker keeps diffAdded token (sign stays green)");

  // removed line -> diffRemovedBg tint
  const removed = renderUnifiedDiff("-let y = 2", 40, { lang: "js" }).find(l => text(l).includes("let"));
  eq(styleOfWord(removed, "let")?.bg, "diffRemovedBg", "lang: removed body carries diffRemovedBg tint");

  // context line is highlighted but gets NO background band
  const ctx = renderUnifiedDiff(" return z", 40, { lang: "js" }).find(l => text(l).includes("return"));
  eq(styleOfWord(ctx, "return")?.token, "syntaxKeyword", "lang: context line highlighted");
  ok(styleOfWord(ctx, "return")?.bg == null, "lang: context line has no background tint");

  // unknown / absent lang falls back to a single diff-colored body segment
  const plain = renderUnifiedDiff("+const x = 1", 40, { lang: "no-such-lang" }).find(l => text(l).includes("const"));
  eq([text(plain), tokenOf(plain)], ["+ const x = 1", "diffAdded"], "unknown lang -> plain single diffAdded body");
  const noopts = renderUnifiedDiff("+const x = 1", 40).find(l => text(l).includes("const"));
  eq(noopts.length, 2, "no opts -> body is one segment (marker + body), unchanged behavior");

  // renderTextDiff threads lang through too
  const td = renderTextDiff("a = 1", "a = 2", 40, { lang: "js" });
  ok(td.some(l => (l.find(s => s.text === "2") || {}).style?.token === "syntaxNumber"), "renderTextDiff: lang threaded to renderLineDiff");

  // highlighted lines still wrap within width (CJK + tiling preserved)
  const wide = renderUnifiedDiff("+const s = \"" + "あ".repeat(20) + "\"", 12, { lang: "js" });
  ok(wide.every(l => richWidth(l) <= 12), "highlighted long line wraps within width (CJK)");
  ok(wide.length > 1, "highlighted long line wrapped to multiple rows");
}

console.log(`tui vanilla diff tests: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
