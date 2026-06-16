/**
 * @file Multi-line text input for the vanilla TUI runtime (Stage T2 widget, added
 * in T3 for the real prompt). Like input.js but multi-line: value may contain "\n",
 * the cursor is a CODE-POINT offset (CJK-safe), and the view wraps each logical
 * line to the region width and scrolls vertically to keep the cursor visible.
 * Vertical movement (Up/Down) is by LOGICAL line at the same column — visual
 * movement across wrapped rows is a later refinement (handleKey has no width).
 * ENTER inserts a newline (a plain editor); the prompt decides submit-vs-newline
 * before delegating here.
 */
// Multi-line text input for the vanilla TUI runtime (Stage T2 widget, added in
// T3 for the real prompt). Like input.js but multi-line: value may contain "\n",
// the cursor is a CODE-POINT offset (CJK-safe), and the view wraps each logical
// line to the region width and scrolls vertically to keep the cursor visible.
// Vertical movement (Up/Down) is by LOGICAL line at the same column — visual
// movement across wrapped rows is a later refinement (handleKey has no width).
// ENTER inserts a newline (a plain editor); the prompt decides submit-vs-newline
// before delegating here.
import { createSignal } from "./reactivity.js";
import { width, wrap, sliceCols } from "./text.js";

/** Code-point length of a string (CJK-safe, counts code points not UTF-16 units). */
const cpLen = s => [...s].length;

/**
 * Create a reactive multi-line text-area model with cursor tracking and rendering.
 * @param {string} initial - Initial text value (default "").
 * @param {Object} opts - Options: `minHeight`, `maxHeight`, and `onChange(text)` callback.
 * @returns {Object} A model exposing signals (value/cursor), editing methods (setText, clear, insert, newline, handleKey), and view helpers (draw, height, rowCount, locate).
 */
export function createTextArea(initial = "", opts = {}) {
  const [value, setValue] = createSignal(initial);
  const [cursor, setCursor] = createSignal(cpLen(initial)); // code-point offset
  const minH = opts.minHeight ?? 1;
  const maxH = opts.maxHeight ?? 6;
  const chars = () => [...value()];
  const lines = () => value().split("\n");

  /**
   * Commit an edited character array as the new value and clamp the cursor.
   * @param {Array} arr - The full text as an array of code-point characters.
   * @param {number} c - Desired cursor offset (clamped to [0, arr.length]).
   * @returns {void}
   */
  function commit(arr, c) {
    const next = arr.join("");
    setValue(next);
    setCursor(Math.max(0, Math.min(c, arr.length)));
    opts.onChange?.(next);
  }
  /**
   * Replace the entire text and move the cursor to the end.
   * @param {string} str - The new text value.
   * @returns {void}
   */
  function setText(str) { setValue(str); setCursor(cpLen(str)); opts.onChange?.(str); }
  /** Clear the text and cursor. @returns {void} */
  function clear() { setText(""); }

  /**
   * Convert a code-point offset into a logical {line, col} position.
   * @param {number} off - Code-point offset (defaults to the current cursor).
   * @returns {Object} `{line, col}` over logical (newline-split) lines.
   */
  // code-point offset -> { line, col } over logical lines
  function locate(off = cursor()) {
    const ls = lines();
    let rem = off;
    for (let i = 0; i < ls.length; i++) {
      const len = cpLen(ls[i]);
      if (rem <= len) return { line: i, col: rem };
      rem -= len + 1;
    }
    const last = ls.length - 1;
    return { line: last, col: cpLen(ls[last]) };
  }
  /**
   * Convert a logical {line, col} position into a code-point offset (inverse of locate).
   * @param {number} line - Logical line index (clamped to valid range).
   * @param {number} col - Column within the line (clamped to the line length).
   * @returns {number} The code-point offset into the full value.
   */
  function offsetOf(line, col) {
    const ls = lines();
    line = Math.max(0, Math.min(line, ls.length - 1));
    let off = 0;
    for (let i = 0; i < line; i++) off += cpLen(ls[i]) + 1;
    return off + Math.max(0, Math.min(col, cpLen(ls[line])));
  }

  /**
   * Insert text at the cursor, advancing the cursor past the inserted code points.
   * @param {string} str - The text to insert.
   * @returns {void}
   */
  function insert(str) {
    const cs = chars();
    const c = cursor();
    const ins = [...str];
    cs.splice(c, 0, ...ins);
    commit(cs, c + ins.length);
  }

  /**
   * Apply a key event to the text area (insert characters, edit, or move the cursor).
   * @param {string} name - Key name (e.g. "BACKSPACE", "LEFT", "ENTER") or the literal character.
   * @param {Object} data - Key metadata; `data.isCharacter` marks a printable character.
   * @returns {boolean} True if the key was handled/consumed, false otherwise.
   */
  function handleKey(name, data) {
    const cs = chars();
    const c = cursor();
    if (data && data.isCharacter) { insert(name); return true; }
    switch (name) {
      case "BACKSPACE": if (c > 0) { cs.splice(c - 1, 1); commit(cs, c - 1); } return true;
      case "DELETE": if (c < cs.length) { cs.splice(c, 1); commit(cs, c); } return true;
      case "LEFT": if (c > 0) setCursor(c - 1); return true;
      case "RIGHT": if (c < cs.length) setCursor(c + 1); return true;
      case "UP": { const { line, col } = locate(); if (line > 0) setCursor(offsetOf(line - 1, col)); return true; }
      case "DOWN": { const { line, col } = locate(); if (line < lines().length - 1) setCursor(offsetOf(line + 1, col)); return true; }
      case "HOME": { const { line } = locate(); setCursor(offsetOf(line, 0)); return true; }
      case "END": { const { line } = locate(); setCursor(offsetOf(line, cpLen(lines()[line]))); return true; }
      case "ENTER": insert("\n"); return true;
      default: return false;
    }
  }

  /**
   * Build the visual rows: each logical line wrapped to W columns.
   * @param {number} W - Region width in display columns to wrap each line to.
   * @returns {Array} Rows of `{text, line, dispColStart}` where dispColStart is the display column at which the row begins within its logical line.
   */
  // Display rows: each logical line wrapped to W columns. dispColStart = display
  // column at which the row begins within its logical line.
  function buildRows(W) {
    const rows = [];
    lines().forEach((ln, li) => {
      let dispCol = 0;
      for (const piece of wrap(ln, W)) { rows.push({ text: piece, line: li, dispColStart: dispCol }); dispCol += width(piece); }
    });
    return rows;
  }
  /**
   * Number of visual rows at width W.
   * @param {number} W - Region width in display columns.
   * @returns {number} The visual row count.
   */
  function rowCount(W) { return buildRows(W).length; }
  /**
   * Desired region height (clamped between minHeight and maxHeight) for width W.
   * @param {number} W - Region width in display columns.
   * @returns {number} The clamped height in rows.
   */
  function height(W) { return Math.max(minH, Math.min(maxH, rowCount(W))); }

  /**
   * Render the text area (or placeholder) into a region and place the hardware cursor.
   * @param {Object} region - Render region with `width`, `height`, `x`, `y`, `line()`, and `text()`.
   * @param {Object} options - `{focused, attr, ctx, placeholder}`: focus state, cell attrs, render context (with focusCursor), and placeholder text.
   * @returns {void}
   */
  function draw(region, { focused, attr, ctx, placeholder } = {}) {
    const W = region.width;
    const h = region.height;
    if (value() === "" && placeholder) {
      region.line(0, placeholder, { ...attr, dim: true });
      if (focused && ctx) ctx.focusCursor(region.x, region.y);
      return;
    }
    const rows = buildRows(W);
    const { line, col } = locate();
    const curDispCol = width([...lines()[line]].slice(0, col).join(""));
    // cursor's display row: the last row of `line` whose dispColStart <= curDispCol.
    // Comparing against dispColStart (not dispColStart + W) means a cursor exactly
    // at a wrap boundary lands at the START of the next visual row, not the empty
    // trailing cell of the previous one — wrapped CJK pieces are often < W wide, so
    // the old "+ W" test mis-placed the hardware cursor on odd-width terminals.
    let curRow = 0;
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].line !== line) continue;
      if (curDispCol >= rows[i].dispColStart) curRow = i;
      else break;
    }
    let start = curRow >= h ? curRow - h + 1 : 0;
    start = Math.min(start, Math.max(0, rows.length - h));
    for (let i = 0; i < h && start + i < rows.length; i++) region.text(0, i, rows[start + i].text, attr);
    if (focused && ctx) {
      const cr = rows[curRow] ?? { dispColStart: 0 };
      ctx.focusCursor(region.x + Math.min(W - 1, curDispCol - cr.dispColStart), region.y + (curRow - start));
    }
  }

  return { value, setValue, setText, clear, cursor, setCursor, insert, newline: () => insert("\n"), handleKey, draw, height, rowCount, locate };
}
