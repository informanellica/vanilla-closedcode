/**
 * @file Styled-segment ("rich") line model for the vanilla TUI (renderer parity
 * phase). A rich line is an array of segments { text, style }; style flags map to
 * terminal-kit attrs. This lets the timeline render INLINE styling within one
 * line (bold/italic/code in markdown, +/- in diffs) — which the plain
 * region.line(row, str, attr) path can't express. All width math is CJK-aware.
 */
import { width, wrap } from "../runtime/text.js";
import { attr as themeAttr } from "./theme.js";

/**
 * Construct a styled segment.
 * @param {string} text - The segment's text.
 * @param {Object} style - Style flags (token, bold, italic, dim, strike, underline, inverse, bg).
 * @returns {Object} A {text, style} segment.
 */
export const seg = (text, style = {}) => ({ text, style });

/**
 * Resolve a segment's style flags to a terminal-kit attr via the theme.
 * @param {Object} theme - Theme token map.
 * @param {Object} style - Style flags {token, bold, italic, dim, strike, underline, inverse, bg}.
 * @returns {Object} A terminal-kit attr object.
 */
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

/**
 * Total display width of a rich line (CJK-aware sum of segment widths).
 * @param {Array} segments - The rich-line segments.
 * @returns {number} The combined display width in columns.
 */
export function richWidth(segments) { let w = 0; for (const s of segments) w += width(s.text); return w; }

/**
 * Draw a rich line into `region` at `row`, left-to-right, clipped to width.
 * @param {Object} region - The drawing region.
 * @param {number} row - The row index to draw at.
 * @param {Array} segments - The rich-line segments to render.
 * @param {Object} theme - Theme token map (for resolving segment styles).
 * @returns {void}
 */
export function drawRichLine(region, row, segments, theme) {
  let col = 0;
  for (const s of segments) {
    if (col >= region.width) break;
    if (!s.text) continue;
    region.text(col, row, s.text, styleToAttr(theme, s.style));
    col += width(s.text);
  }
}

/**
 * Drop trailing whitespace-only segments from a (single) wrapped line.
 * @param {Array} line - The segments of one wrapped line.
 * @returns {Array} The line with trailing blank segments removed.
 */
function trimTrailing(line) {
  const out = [...line];
  while (out.length && /^\s*$/.test(out[out.length - 1].text)) out.pop();
  return out;
}

/**
 * Wrap a styled segment stream to `max` columns, breaking on whitespace and
 * hard-wrapping any single word wider than max (CJK-safe), preserving styles.
 * @param {Array} segments - The rich-line segments to wrap.
 * @param {number} max - The maximum line width in columns.
 * @returns {Array} An array of wrapped rich lines (each an array of segments).
 */
export function wrapRich(segments, max) {
  if (max <= 0) return [segments];
  const lines = [];
  let line = [];
  let w = 0;
  /**
   * Push the in-progress line (trimmed) to the output and start a fresh one.
   * @returns {void}
   */
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

/**
 * Prefix every wrapped line with a fixed gutter SEGMENT (e.g. a list bullet on
 * the first line, a hanging-indent on the rest).
 * @param {Array} lines - The wrapped rich lines.
 * @param {Object} first - The gutter segment for the first line.
 * @param {Object} rest - The gutter segment for subsequent lines.
 * @returns {Array} The lines, each with its gutter segment prepended.
 */
export function withGutter(lines, first, rest) {
  return lines.map((line, i) => [i === 0 ? first : rest, ...line]);
}

/**
 * Hard-wrap a single text into rich lines PRESERVING all whitespace — for code /
 * diff bodies where leading indentation is significant (wrapRich is prose-oriented
 * and discards leading whitespace, which would flatten indented code). Tabs are
 * expanded to spaces so they occupy real columns.
 * @param {string} text - The raw text to wrap.
 * @param {Object} style - The style applied to every produced segment.
 * @param {number} max - The maximum line width in columns.
 * @param {number} tabWidth - Spaces per tab (default 4).
 * @returns {Array} An array of single-segment rich lines.
 */
export function wrapCode(text, style, max, tabWidth = 4) {
  const expanded = String(text ?? "").replace(/\t/g, " ".repeat(tabWidth));
  const pieces = wrap(expanded, Math.max(1, max));
  if (!pieces.length) pieces.push("");
  return pieces.map(p => [seg(p, style)]);
}
