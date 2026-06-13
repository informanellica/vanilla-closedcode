// Node-run tests for the side-by-side (split) diff.   node src/cli/cmd/tui/vanilla/splitdiff.test.js
import tk from "terminal-kit";
import { makeRegion } from "../runtime/layout.js";
import { drawRichLine } from "./richtext.js";
import { defaultTheme } from "./theme.js";
import { renderSplitDiff, pairRows, splitLayout } from "./splitdiff.js";
import { computeLineDiff } from "./diff.js";

let passed = 0, failed = 0;
function eq(a, b, label) { if (JSON.stringify(a) === JSON.stringify(b)) passed++; else { failed++; console.error(`FAIL ${label}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); } }
function ok(c, label) { eq(!!c, true, label); }

// Render rich lines into a ScreenBufferHD and read the chars back row-by-row.
function screen(lines, w, h = lines.length) {
  const buf = new tk.ScreenBufferHD({ width: w, height: h }); buf.fill({ char: " " });
  const region = makeRegion(buf, 0, 0, w, h);
  lines.forEach((line, row) => drawRichLine(region, row, line, defaultTheme));
  const rows = []; for (let y = 0; y < h; y++) { let s = ""; for (let x = 0; x < w; x++) s += buf.get({ x, y }).char; rows.push(s.replace(/\s+$/, "")); }
  return rows;
}
// Column index of the first "│" separator in a row string (-1 if absent).
const sepIdx = (rowStr) => rowStr.indexOf("│");

// --- pairing logic ----------------------------------------------------------
{
  // equal del/add runs zip into single rows {left:del, right:add}.
  const rows = pairRows(computeLineDiff("a\nb", "x\ny"));
  eq(rows.map(r => [r.left && r.left.text, r.right && r.right.text]), [["a", "x"], ["b", "y"]], "equal runs zip");
  eq(rows.every(r => r.left.kind === "del" && r.right.kind === "add"), true, "zip kinds del/add");
}
{
  // ctx appears on BOTH sides.
  const rows = pairRows(computeLineDiff("keep\nold", "keep\nnew"));
  eq([rows[0].left.text, rows[0].right.text, rows[0].left.kind], ["keep", "keep", "ctx"], "ctx on both sides");
  eq([rows[1].left.text, rows[1].right.text], ["old", "new"], "replacement zipped after ctx");
}
{
  // more dels than adds -> surplus dels get an EMPTY (null) right cell.
  const rows = pairRows(computeLineDiff("a\nb\nc", "x"));
  eq(rows.map(r => [r.left && r.left.text, r.right && r.right.text]), [["a", "x"], ["b", null], ["c", null]], "more dels -> empty right");
}
{
  // more adds than dels -> surplus adds get an EMPTY (null) left cell.
  const rows = pairRows(computeLineDiff("a", "x\ny\nz"));
  eq(rows.map(r => [r.left && r.left.text, r.right && r.right.text]), [["a", "x"], [null, "y"], [null, "z"]], "more adds -> empty left");
}
{
  // pure-add (old empty): every row has an empty left cell.
  const rows = pairRows(computeLineDiff("", "one\ntwo"));
  eq(rows.map(r => [r.left, r.right && r.right.text]), [[null, "one"], [null, "two"]], "pure add -> empty left cells");
  // pure-remove (new empty): every row has an empty right cell.
  const rows2 = pairRows(computeLineDiff("one\ntwo", ""));
  eq(rows2.map(r => [r.left && r.left.text, r.right]), [["one", null], ["two", null]], "pure remove -> empty right cells");
}
{
  // never throws on null / empty / odd inputs; empty&empty -> [].
  eq(renderSplitDiff("", "", 20), [], "empty & empty -> []");
  eq(Array.isArray(renderSplitDiff(null, null, 20)), true, "null inputs do not throw");
  eq(Array.isArray(renderSplitDiff(undefined, "x", 1)), true, "width 1 does not throw");
}

// --- layout formula ---------------------------------------------------------
{
  eq(splitLayout(21), { inner: 10, sepCol: 10, rightStart: 11, width: 21 }, "layout 21 -> inner 10");
  eq(splitLayout(20), { inner: 9, sepCol: 9, rightStart: 10, width: 20 }, "layout 20 -> inner 9");
  eq(splitLayout(1).inner, 1, "min inner 1");
}

// --- rendering: separator + left/right placement ----------------------------
{
  const lines = renderSplitDiff("old", "new", 21);
  const rows = screen(lines, 21);
  const { sepCol } = splitLayout(21);
  eq(sepIdx(rows[0]), sepCol, "separator at expected column");
  ok(rows[0].indexOf("old") >= 0 && rows[0].indexOf("old") < sepIdx(rows[0]), "left text left of separator");
  ok(rows[0].indexOf("new") > sepIdx(rows[0]), "right text right of separator");
}
{
  // ctx row: same text appears on both sides of the separator.
  const lines = renderSplitDiff("keep\nold", "keep\nnew", 21);
  const rows = screen(lines, 21);
  const s = sepIdx(rows[0]);
  ok(rows[0].slice(0, s).includes("keep") && rows[0].slice(s + 1).includes("keep"), "ctx text on both sides");
}
{
  // pure-add: left side blank, added text on the right.
  const lines = renderSplitDiff("", "hello", 21);
  const rows = screen(lines, 21);
  const s = sepIdx(rows[0]);
  eq(rows[0].slice(0, s).trim(), "", "pure add -> blank left cell");
  ok(rows[0].slice(s + 1).includes("hello"), "pure add -> text on right");
}

// --- CJK: fullwidth truncation + aligned separator --------------------------
{
  const lines = renderSplitDiff("日本語テスト\nshort", "ascii\n別の行テキスト", 21);
  const rows = screen(lines, 21);
  const cols = rows.map(sepIdx);
  // separator column is identical across all rows (CJK padding via width()).
  eq(new Set(cols).size, 1, "separator column identical across rows (CJK aligned)");
  ok(cols[0] >= 0, "separator present on CJK row");
  // nothing overflows the total width.
  ok(rows.every(r => r.length <= 21), "CJK rows do not overflow width");
}

// --- width math: odd total never writes past `width` ------------------------
{
  for (const w of [15, 21, 33, 7, 9]) {
    const lines = renderSplitDiff("alpha\nbeta\ngamma", "delta\nepsilon zeta\neta", w);
    const rows = screen(lines, w);
    ok(rows.every(r => r.length <= w), `odd width ${w}: no row exceeds width`);
    // separator never lands on the last column (right column must have >=0 room).
    const cols = rows.map(sepIdx).filter(c => c >= 0);
    ok(cols.every(c => c < w), `odd width ${w}: separator within bounds`);
  }
}

// --- syntax highlighting path: still single rich line, bg tint is safe ------
{
  const lines = renderSplitDiff("const a=1", "const b=2", 41, { lang: "js" });
  const rows = screen(lines, 41);
  ok(rows[0].includes("│"), "syntax path still draws separator");
  ok(rows[0].includes("const a=1") || rows[0].slice(0, sepIdx(rows[0])).includes("const"), "syntax left cell rendered");
  ok(rows[0].slice(sepIdx(rows[0]) + 1).includes("const"), "syntax right cell rendered");
  // unknown lang falls back to plain (no throw, still renders).
  ok(renderSplitDiff("a", "b", 21, { lang: "no-such-lang" }).length === 1, "unknown lang falls back");
}

// --- regression: non-finite width must not produce NaN geometry / fake ellipsis
{
  eq(splitLayout(undefined).inner, 1, "omitted width -> inner clamped to 1 (invariant holds)");
  eq(splitLayout(NaN).inner, 1, "NaN width -> inner 1");
  eq(Number.isFinite(splitLayout(undefined).width), true, "omitted width -> finite width");
  // Under the NaN bug truncate appended '…' to text that fits; with the guard,
  // single-char cells that fit in inner=1 render verbatim (no spurious ellipsis).
  const noW = renderSplitDiff("a", "b"); // width omitted
  ok(noW.length === 1 && noW.every(line => line.every(s => !s.text.includes("…"))), "omitted width: fitting cell shows no spurious ellipsis");
}

// --- regression: a deleted/added BLANK line keeps its add/removed signal -------
{
  // diff is ctx:a | del:'' | ctx:b — row 1 is the removed blank line.
  const sx = renderSplitDiff("a\n\nb", "a\nb", 21, { lang: "js" });
  eq(sx[1][0].style.bg, "diffRemovedBg", "blank deleted line keeps removed bg tint (syntax mode)");
  const sp = renderSplitDiff("a\n\nb", "a\nb", 21); // no syntax
  eq(sp[1][0].style.token, "diffRemoved", "blank deleted line keeps diffRemoved token (no-syntax)");
  const sa = renderSplitDiff("a\nb", "a\n\nb", 21, { lang: "js" }); // added blank line on the right
  ok(sa[1].some(s => s.style.bg === "diffAddedBg"), "blank added line keeps added bg tint");
  // a genuinely ABSENT cell (surplus add -> empty left) stays neutral ctx, not a change.
  const padd = renderSplitDiff("a", "x\ny", 21); // row 1 has a null left cell
  eq(padd[1][0].style.token, "diffContext", "absent (null) cell stays neutral ctx pad");
}

console.log(`tui vanilla splitdiff tests: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
