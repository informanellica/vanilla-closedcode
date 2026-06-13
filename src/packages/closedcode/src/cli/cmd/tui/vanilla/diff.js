// Diff rendering for the vanilla TUI (renderer parity phase). The live timeline
// hands edit/write tool diffs + session-revert diffs to @opentui's <diff>; this
// renders them as RICH LINES (richtext.js): added (green +), removed (red -),
// context (dim), hunk/file headers. Two entry points — renderUnifiedDiff for a
// standard unified-diff string, and computeLineDiff+renderLineDiff for a raw
// before/after pair (LCS line diff). Width-aware / CJK-safe; long lines wrap with
// a 2-col hanging indent so the +/- gutter stays aligned.
import { seg } from "./richtext.js";
import { truncate, wrap } from "../runtime/text.js";

// Wrap a diff/code body PRESERVING leading indentation (hard char-wrap, not the
// prose wrapRich which would strip it), with a 2-col +/- gutter. Tabs -> spaces.
function gutterLines(body, token, marker, width) {
  const inner = Math.max(1, width - 2);
  const pieces = wrap(String(body ?? "").replace(/\t/g, "    "), inner);
  if (!pieces.length) pieces.push("");
  return pieces.map((p, i) => [seg(i === 0 ? marker + " " : "  ", { token, bold: i === 0 && marker !== " " }), seg(p, { token })]);
}

// Render a unified-diff string into rich lines.
export function renderUnifiedDiff(diffText, width) {
  const out = [];
  for (const raw of String(diffText ?? "").replace(/\r\n/g, "\n").split("\n")) {
    if (raw.startsWith("+++") || raw.startsWith("---")) { out.push([seg(truncate(raw, width), { token: "textMuted", bold: true })]); continue; }
    if (raw.startsWith("@@")) { out.push([seg(truncate(raw, width), { token: "secondary" })]); continue; }
    if (raw.startsWith("\\ ")) { out.push([seg(truncate(raw, width), { token: "diffContext", dim: true })]); continue; } // git "\ No newline at end of file"
    if (raw.startsWith("+")) { out.push(...gutterLines(raw.slice(1), "diffAdded", "+", width)); continue; }
    if (raw.startsWith("-")) { out.push(...gutterLines(raw.slice(1), "diffRemoved", "-", width)); continue; }
    out.push(...gutterLines(raw.startsWith(" ") ? raw.slice(1) : raw, "diffContext", " ", width));
  }
  return out;
}

// Split into lines, treating "" as ZERO lines and dropping the single trailing
// "" produced by a final newline — so creating/clearing a file (or just adding a
// trailing newline) doesn't render a phantom +/- blank line.
function splitLines(t) {
  if (t == null || t === "") return [];
  const lines = String(t).split("\n");
  if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

// Minimal LCS line diff between two texts -> [{ type:"add"|"del"|"ctx", text }].
export function computeLineDiff(oldText, newText) {
  const a = splitLines(oldText);
  const b = splitLines(newText);
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { out.push({ type: "ctx", text: a[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ type: "del", text: a[i] }); i++; }
    else { out.push({ type: "add", text: b[j] }); j++; }
  }
  while (i < n) out.push({ type: "del", text: a[i++] });
  while (j < m) out.push({ type: "add", text: b[j++] });
  return out;
}

const HUNK_TOKEN = { add: "diffAdded", del: "diffRemoved", ctx: "diffContext" };
const HUNK_MARK = { add: "+", del: "-", ctx: " " };

// Render a computed line diff ([{type,text}]) into rich lines.
export function renderLineDiff(hunks, width) {
  const out = [];
  for (const h of hunks) out.push(...gutterLines(h.text, HUNK_TOKEN[h.type] ?? "diffContext", HUNK_MARK[h.type] ?? " ", width));
  return out;
}

// Convenience: before/after text -> rendered rich lines.
export function renderTextDiff(oldText, newText, width) {
  return renderLineDiff(computeLineDiff(oldText, newText), width);
}
