// Width-aware text helpers for the vanilla TUI runtime (Stage T2 of the
// solid-free TUI milestone). All measurements use display columns, not code
// units, so fullwidth CJK (Japanese) and wide emoji never drift the layout.
// The width engine is string-kit's unicode.width (the same one terminal-kit
// uses internally), so ScreenBuffer cell placement and these helpers agree.
import stringKit from "string-kit";

const unicode = stringKit.unicode;

// Display width of a string in terminal cells (fullwidth = 2, control = 0).
export function width(str) {
  return unicode.width(str);
}

// Width of a single character/grapheme (used by the wrap/truncate loops).
function charWidth(ch) {
  return unicode.width(ch);
}

// Iterate a string by grapheme-ish units (code points) with their cell width.
function* cells(str) {
  for (const ch of str) yield [ch, charWidth(ch)];
}

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
    if (w + cw > max) { out.push(line); line = ch; w = cw; }
    else { line += ch; w += cw; }
  }
  out.push(line);
  return out;
}

// Word-wrap on whitespace, falling back to hard-wrap for words longer than max.
export function wordWrap(str, max) {
  if (max <= 0) return [str];
  const out = [];
  for (const para of str.split("\n")) {
    let line = "";
    let w = 0;
    for (const word of para.split(/(\s+)/)) {
      if (word === "") continue;
      const ww = width(word);
      if (w === 0 && ww > max) { for (const piece of wrap(word, max)) out.push(piece); line = ""; w = 0; continue; }
      if (w + ww > max) { out.push(line.replace(/\s+$/, "")); line = word.replace(/^\s+/, ""); w = width(line); }
      else { line += word; w += ww; }
    }
    out.push(line.replace(/\s+$/, ""));
  }
  return out;
}

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
