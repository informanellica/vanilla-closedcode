// Side-by-side (split) diff rendering for the vanilla TUI — the from-scratch
// counterpart to the unified renderUnifiedDiff/renderTextDiff in diff.js. Where
// the unified view stacks removed (-) and added (+) lines top-to-bottom in one
// column, this lays them out in two columns: removed text on the LEFT, the added
// text that replaces it on the RIGHT, separated by a vertical rule. Consecutive
// del/add runs are zipped row-by-row so a replacement reads across; context lines
// appear in both columns. Output is RICH LINES (richtext.js seg arrays). Width-
// aware / CJK-safe via runtime/text.js width()+truncate(); cells TRUNCATE (never
// wrap) so the two columns stay row-aligned. Optional per-cell syntax highlighting
// (syntax.js) keeps add/removed legible by tinting each segment's background.
import { seg } from "./richtext.js";
import { computeLineDiff } from "./diff.js";
import { highlightLine, normalizeLang } from "./syntax.js";
import { width, truncate } from "../runtime/text.js";

// Token per side/kind. Foreground color when syntax highlighting is off; also the
// background-tint token name when it is on (diffAddedBg/diffRemovedBg are optional
// theme tokens — styleToAttr falls back to theme[bg] ?? bg, so the bare token name
// is always safe to pass).
const TOKEN = { add: "diffAdded", del: "diffRemoved", ctx: "diffContext" };
const BG_TOKEN = { add: "diffAddedBg", del: "diffRemovedBg" };

// Compute the column geometry for a total `width`. A 1-col separator sits between
// two columns; each inner column gets Math.max(1, floor((width-1)/2)) display cols.
// The left column starts at col 0, the separator at `sep`, the right column after
// it. Any odd remainder is left as blank gap before the separator (never exceeded).
export function splitLayout(width) {
  // Guard a non-finite width (omitted call / NaN) at the single source so the
  // inner>=1 invariant holds and downstream truncate() always gets a real number
  // (truncate(_, NaN) would otherwise spuriously mark fitting text as truncated).
  const w = Number.isFinite(width) ? Math.max(0, width) : 0;
  const inner = Math.max(1, Math.floor((w - 1) / 2));
  return { inner, sepCol: inner, rightStart: inner + 1, width: w };
}

// Pair a computed line diff into side-by-side rows. ctx lines occupy BOTH columns
// (left===right===text). A maximal run of consecutive "del" hunks and the run of
// "add" hunks immediately following it are ZIPPED: row i = { left:del[i], right:add[i] }.
// Uneven runs leave the surplus cell on the other side empty (null). Source order
// is preserved. Each row is { left, right } where a cell is { text, kind } | null.
export function pairRows(hunks) {
  const rows = [];
  const list = Array.isArray(hunks) ? hunks : [];
  let i = 0;
  while (i < list.length) {
    const h = list[i];
    if (h.type === "ctx") {
      rows.push({ left: { text: h.text ?? "", kind: "ctx" }, right: { text: h.text ?? "", kind: "ctx" } });
      i++;
      continue;
    }
    if (h.type === "del" || h.type === "add") {
      // Gather the maximal run of dels, then the run of adds that immediately follows.
      const dels = [];
      while (i < list.length && list[i].type === "del") dels.push(list[i++]);
      const adds = [];
      while (i < list.length && list[i].type === "add") adds.push(list[i++]);
      const n = Math.max(dels.length, adds.length);
      for (let k = 0; k < n; k++) {
        const d = dels[k], a = adds[k];
        rows.push({
          left: d ? { text: d.text ?? "", kind: "del" } : null,
          right: a ? { text: a.text ?? "", kind: "add" } : null,
        });
      }
      continue;
    }
    i++; // unknown hunk type -> skip defensively
  }
  return rows;
}

// Build the segments for ONE cell, fitted to `inner` display columns. Truncates
// the raw text FIRST, then (optionally) highlights the truncated text. `pad` left-
// pads the cell to exactly `inner` columns (the left column needs this so the
// separator lines up; the right column does not). An empty/null cell -> blank pad.
function cellSegments(cell, inner, pad, useSyntax, lang) {
  // A genuinely ABSENT cell (the surplus side of an uneven del/add run) -> neutral
  // ctx-colored pad: it reads as "nothing on this side", not as a change.
  if (!cell || cell.text == null) {
    return pad ? [seg(" ".repeat(inner), { token: TOKEN.ctx })] : [];
  }
  const token = TOKEN[cell.kind] ?? TOKEN.ctx;
  const bg = useSyntax ? BG_TOKEN[cell.kind] : undefined; // undefined for ctx -> no tint
  // A PRESENT cell that is an empty line (a deleted/added blank line) must keep
  // its add/removed signal — a full-width tinted/colored band, not a neutral blank
  // that would be indistinguishable from an unchanged empty row. A blank CHANGE
  // bands on either column (even the right, which normally skips trailing pad —
  // here the band IS the signal); a blank unchanged (ctx) line on the no-pad side
  // collapses to nothing.
  if (cell.text === "") {
    const isChange = cell.kind === "del" || cell.kind === "add";
    if (!pad && !isChange) return [];
    return [seg(" ".repeat(inner), bg ? { bg } : { token })];
  }
  const text = truncate(String(cell.text), inner);
  let segs;
  if (useSyntax) {
    segs = highlightLine(text, lang).map(s => seg(s.text, bg ? { ...s.style, bg } : { ...s.style }));
  } else {
    segs = [seg(text, { token })];
  }
  if (pad) {
    const gap = inner - width(text);
    // Extend the tint/color across the full column so an add/del band is unbroken.
    if (gap > 0) segs.push(seg(" ".repeat(gap), bg ? { bg } : { token }));
  }
  return segs;
}

// Render already-paired rows into RICH LINES — the shared back end for both the
// before/after and unified-string entry points. Two columns of inner width
// floor((width-1)/2) with a 1-col `border` separator ("│") between them. CJK-safe;
// cells truncate to stay aligned. opts.lang (when normalizeLang is non-null) turns
// on per-cell syntax highlighting, tinting each segment's bg to convey add/removed.
function renderRows(rows, width, opts) {
  const { inner } = splitLayout(width);
  const useSyntax = opts.lang != null && normalizeLang(opts.lang) != null;
  const lang = opts.lang;
  const out = [];
  for (const r of rows) {
    const left = cellSegments(r.left, inner, true, useSyntax, lang);   // left pads to align the separator
    const right = cellSegments(r.right, inner, false, useSyntax, lang); // right needs no trailing pad
    out.push([...left, seg("│", { token: "border" }), ...right]);
  }
  return out;
}

// Side-by-side diff of oldText vs newText (the {old,new} tool-diff form). Never throws.
export function renderSplitDiff(oldText, newText, width, opts = {}) {
  return renderRows(pairRows(computeLineDiff(oldText, newText)), width, opts);
}

// Parse a unified-diff STRING into hunks [{type,text}], dropping header/marker
// lines (+++/---/@@/\) and preserving the exact +/-/context structure verbatim
// (no re-diff, unlike renderSplitDiff which recomputes the LCS). "" / null -> [].
export function hunksFromUnified(diffText) {
  if (diffText == null || diffText === "") return [];
  const hunks = [];
  for (const raw of String(diffText).replace(/\r\n/g, "\n").split("\n")) {
    if (raw.startsWith("+++") || raw.startsWith("---") || raw.startsWith("@@") || raw.startsWith("\\")) continue;
    if (raw.startsWith("+")) hunks.push({ type: "add", text: raw.slice(1) });
    else if (raw.startsWith("-")) hunks.push({ type: "del", text: raw.slice(1) });
    else hunks.push({ type: "ctx", text: raw.startsWith(" ") ? raw.slice(1) : raw });
  }
  return hunks;
}

// Side-by-side view from a unified-diff STRING (the permission-prompt / tool-diff
// string form). Faithful to the diff's own hunk structure. Never throws.
export function renderSplitUnified(diffText, width, opts = {}) {
  return renderRows(pairRows(hunksFromUnified(diffText)), width, opts);
}
