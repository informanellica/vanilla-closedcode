// Styled-segment ("rich") line model for the vanilla TUI (renderer parity phase).
// A rich line is an array of segments { text, style }; style flags map to
// terminal-kit attrs. This lets the timeline render INLINE styling within one
// line (bold/italic/code in markdown, +/- in diffs) — which the plain
// region.line(row, str, attr) path can't express. All width math is CJK-aware.
import { width, wrap } from "../runtime/text.js";
import { attr as themeAttr } from "./theme.js";

export const seg = (text, style = {}) => ({ text, style });

// Resolve a segment's style flags to a terminal-kit attr via the theme.
export function styleToAttr(theme, style = {}) {
  const a = themeAttr(theme, style.token ?? "text");
  if (style.bold) a.bold = true;
  if (style.italic) a.italic = true;
  if (style.dim) a.dim = true;
  if (style.strike) a.strike = true;
  if (style.underline) a.underline = true;
  if (style.inverse) a.inverse = true;
  if (style.bg) a.bgColor = theme[style.bg] ?? style.bg;
  return a;
}

export function richWidth(segments) { let w = 0; for (const s of segments) w += width(s.text); return w; }

// Draw a rich line into `region` at `row`, left-to-right, clipped to width.
export function drawRichLine(region, row, segments, theme) {
  let col = 0;
  for (const s of segments) {
    if (col >= region.width) break;
    if (!s.text) continue;
    region.text(col, row, s.text, styleToAttr(theme, s.style));
    col += width(s.text);
  }
}

function trimTrailing(line) {
  const out = [...line];
  while (out.length && /^\s*$/.test(out[out.length - 1].text)) out.pop();
  return out;
}

// Wrap a styled segment stream to `max` columns, breaking on whitespace and
// hard-wrapping any single word wider than max (CJK-safe), preserving styles.
export function wrapRich(segments, max) {
  if (max <= 0) return [segments];
  const lines = [];
  let line = [];
  let w = 0;
  const flush = () => { lines.push(trimTrailing(line)); line = []; w = 0; };
  for (const s of segments) {
    for (const part of s.text.split(/(\s+)/)) {
      if (part === "") continue;
      const pw = width(part);
      if (/^\s+$/.test(part)) {
        if (w === 0) continue;                 // never lead a line with whitespace
        if (w + pw > max) { flush(); continue; }
        line.push(seg(part, s.style)); w += pw;
        continue;
      }
      if (pw > max) {                          // word longer than the width -> hard-wrap
        const chunks = wrap(part, max);
        for (const chunk of chunks) {
          if (w > 0) flush();
          line.push(seg(chunk, s.style)); w = width(chunk);
        }
        continue;
      }
      if (w + pw > max) flush();
      line.push(seg(part, s.style)); w += pw;
    }
  }
  flush();
  return lines;
}

// Prefix every wrapped line with a fixed gutter SEGMENT (e.g. a list bullet on
// the first line, a hanging-indent on the rest). first/rest are seg objects.
export function withGutter(lines, first, rest) {
  return lines.map((line, i) => [i === 0 ? first : rest, ...line]);
}

// Hard-wrap a single text into rich lines PRESERVING all whitespace — for code /
// diff bodies where leading indentation is significant (wrapRich is prose-oriented
// and discards leading whitespace, which would flatten indented code). Tabs are
// expanded to spaces so they occupy real columns.
export function wrapCode(text, style, max, tabWidth = 4) {
  const expanded = String(text ?? "").replace(/\t/g, " ".repeat(tabWidth));
  const pieces = wrap(expanded, Math.max(1, max));
  if (!pieces.length) pieces.push("");
  return pieces.map(p => [seg(p, style)]);
}
