/**
 * @file Width-aware text helpers for the vanilla TUI runtime (Stage T2 of the
 * solid-free TUI milestone). All measurements use display columns, not code units,
 * so fullwidth CJK (Japanese) and wide emoji never drift the layout. The width
 * engine is string-kit's unicode.width (the same one terminal-kit uses internally),
 * so ScreenBuffer cell placement and these helpers agree.
 */
// Width-aware text helpers for the vanilla TUI runtime (Stage T2 of the
// solid-free TUI milestone). All measurements use display columns, not code
// units, so fullwidth CJK (Japanese) and wide emoji never drift the layout.
// The width engine is string-kit's unicode.width (the same one terminal-kit
// uses internally), so ScreenBuffer cell placement and these helpers agree.
import stringKit from "string-kit";

const unicode = stringKit.unicode;

/**
 * Display width of a string in terminal cells (fullwidth = 2, control = 0).
 * @param {string} str - The string to measure.
 * @returns {number} The total display-column width.
 */
// Display width of a string in terminal cells (fullwidth = 2, control = 0).
export function width(str) {
  return unicode.width(str);
}

/**
 * Display width of a single character/grapheme (used by the wrap/truncate loops).
 * @param {string} ch - A single character or grapheme.
 * @returns {number} Its display-column width.
 */
// Width of a single character/grapheme (used by the wrap/truncate loops).
function charWidth(ch) {
  return unicode.width(ch);
}

/**
 * Iterate a string by grapheme-ish units (code points), yielding each with its
 * cell width.
 * @param {string} str - The string to iterate.
 * @returns {Generator} Yields `[ch, width]` pairs for each code point.
 */
// Iterate a string by grapheme-ish units (code points) with their cell width.
function* cells(str) {
  for (const ch of str) yield [ch, charWidth(ch)];
}

/**
 * Hard-wrap a string into lines no wider than `max` display columns. Breaks at
 * the column boundary (no word breaking — callers that want word wrap can split
 * on spaces first). Embedded "\n" forces a new line. A zero/negative max yields
 * the whole string as one line.
 * @param {string} str - The string to wrap.
 * @param {number} max - Maximum display-column width per line; <= 0 disables wrapping.
 * @returns {Array} The wrapped lines.
 */
// Hard-wrap a string into lines no wider than `max` display columns. Breaks at
// the column boundary (no word breaking — callers that want word wrap can split
// on spaces first). A zero/negative max yields the whole string as one line.
export function wrap(str, max) {
  if (max <= 0) return [str];
  const out = [];
  let line = "";
  let w = 0;
  for (const [ch, cw] of cells(str)) {
    if (ch === "\n") { out.push(line); line = ""; w = 0; continue; }
    // Only flush a NON-empty line: a single glyph wider than max (e.g. a CJK
    // glyph at width 1) must not emit a phantom empty line before it.
    if (w + cw > max) { if (w > 0) out.push(line); line = ch; w = cw; }
    else { line += ch; w += cw; }
  }
  out.push(line);
  return out;
}

/**
 * Word-wrap on whitespace, falling back to hard-wrap for words longer than max.
 * A word wider than `max` is hard-wrapped (via wrap()) REGARDLESS of position —
 * not only at line start — so a long no-space run (e.g. a CJK sentence, which is
 * one "word" because it has no spaces) is broken across lines instead of being
 * emitted as one over-long line that the caller then truncates (which silently
 * dropped Japanese text). The CJK-first project relies on this.
 * @param {string} str - The string to wrap; "\n" separates paragraphs.
 * @param {number} max - Maximum display-column width per line; <= 0 disables wrapping.
 * @returns {Array} The wrapped lines, trailing whitespace trimmed.
 */
// Word-wrap on whitespace, falling back to hard-wrap for words longer than max.
// A word wider than `max` is hard-wrapped (via wrap()) REGARDLESS of position —
// not only at line start — so a long no-space run (e.g. a CJK sentence, which is
// one "word" because it has no spaces) is broken across lines instead of being
// emitted as one over-long line that the caller then truncates (which silently
// dropped Japanese text). The CJK-first project relies on this.
export function wordWrap(str, max) {
  if (max <= 0) return [str];
  const out = [];
  for (const para of str.split("\n")) {
    let line = "";
    let w = 0;
    const flush = () => { out.push(line.replace(/\s+$/, "")); line = ""; w = 0; };
    for (const word of para.split(/(\s+)/)) {
      if (word === "") continue;
      const ww = width(word);
      if (ww > max) {
        // word alone exceeds the width: flush the current line, then hard-wrap it.
        if (w > 0) flush();
        const pieces = wrap(word, max);
        for (let i = 0; i < pieces.length - 1; i++) out.push(pieces[i]);
        line = pieces[pieces.length - 1];
        w = width(line);
        continue;
      }
      if (w + ww > max) { flush(); if (/^\s+$/.test(word)) continue; line = word; w = ww; }
      else { line += word; w += ww; }
    }
    flush();
  }
  return out;
}

/**
 * Truncate to `max` display columns, appending `ellipsis` if it had to cut.
 * @param {string} str - The string to truncate.
 * @param {number} max - Maximum display-column width of the result (including ellipsis).
 * @param {string} ellipsis - Marker appended when truncation occurs (default "…").
 * @returns {string} The original string if it fits, otherwise the truncated string + ellipsis.
 */
// Truncate to `max` display columns, appending `ellipsis` if it had to cut.
export function truncate(str, max, ellipsis = "…") {
  if (width(str) <= max) return str;
  const ew = width(ellipsis);
  const budget = Math.max(0, max - ew);
  let out = "";
  let w = 0;
  for (const [ch, cw] of cells(str)) {
    if (w + cw > budget) break;
    out += ch;
    w += cw;
  }
  return out + ellipsis;
}

/**
 * Slice a string to the display-column range [start, start+len). Wide chars that
 * straddle a boundary are dropped (replaced by a space) so the result is exactly
 * `len` columns and never splits a fullwidth glyph.
 * @param {string} str - The source string.
 * @param {number} start - First display column to include (0-based).
 * @param {number} len - Number of display columns to take.
 * @returns {string} The sliced substring, exactly `len` columns wide.
 */
// Slice a string to the display-column range [start, start+len). Wide chars that
// straddle a boundary are dropped (replaced by a space) so the result is exactly
// `len` columns and never splits a fullwidth glyph.
export function sliceCols(str, start, len) {
  let col = 0;
  let out = "";
  let taken = 0;
  for (const [ch, cw] of cells(str)) {
    if (col >= start + len) break;
    if (col >= start) {
      if (taken + cw > len) { out += " "; taken += 1; }
      else { out += ch; taken += cw; }
    } else if (col + cw > start) {
      // a wide char straddles the start boundary — pad with a space
      out += " "; taken += 1;
    }
    col += cw;
  }
  return out;
}

/**
 * Pad/truncate to exactly `cols` display columns (left/right/center align).
 * @param {string} str - The string to fit.
 * @param {number} cols - Target display-column width.
 * @param {string} align - "left", "right", or "center" (default "left").
 * @param {string} fillChar - Character used for padding (default " ").
 * @returns {string} The string padded with fillChar or truncated to `cols` columns.
 */
// Pad/truncate to exactly `cols` display columns (left/right/center align).
export function fit(str, cols, align = "left", fillChar = " ") {
  const w = width(str);
  if (w > cols) return truncate(str, cols);
  const pad = cols - w;
  if (align === "right") return fillChar.repeat(pad) + str;
  if (align === "center") {
    const l = Math.floor(pad / 2);
    return fillChar.repeat(l) + str + fillChar.repeat(pad - l);
  }
  return str + fillChar.repeat(pad);
}
