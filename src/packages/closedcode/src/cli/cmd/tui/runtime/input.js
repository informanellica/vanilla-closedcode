/** @file Single-line text input controller for the vanilla TUI runtime (Stage T2 widgets). */
// State is signals (value + cursor); the cursor is a CODE-POINT index so a
// fullwidth glyph edits/moves as one unit. Editing keys mutate the value;
// draw() renders the (horizontally scrolled) text and, when focused, requests
// the hardware cursor at the correct display column.
import { createSignal } from "./reactivity.js";
import { width, sliceCols } from "./text.js";

/**
 * Create a single-line text input controller backed by reactive signals.
 * @param {string} initial - Initial text value.
 * @param {Object} opts - Callbacks: onChange(text) on edits, onSubmit(text) on Enter.
 * @returns {Object} Controller with value, setValue, cursor, setCursor, handleKey, and draw.
 */
export function createTextInput(initial = "", opts = {}) {
  const [value, setValue] = createSignal(initial);
  const [cursor, setCursor] = createSignal([...initial].length); // code-point index
  const chars = () => [...value()];

  /**
   * Set both value and cursor together; the cursor is clamped to [0, arr.length].
   * @param {Array} arr - Array of code-point characters forming the new value.
   * @param {number} c - Desired cursor position (code-point index).
   * @returns {void}
   */
  function setBoth(arr, c) { setValue(arr.join("")); setCursor(Math.max(0, Math.min(c, arr.length))); }

  /**
   * Apply a key to the input: insert characters, edit (Backspace/Delete), move
   * the cursor (arrows/Home/End), or submit (Enter).
   * @param {string} name - Key name or the character to insert.
   * @param {Object} data - terminal-kit key data; data.isCharacter marks printable input.
   * @returns {boolean} True if the key was handled by this input.
   */
  function handleKey(name, data) {
    const cs = chars();
    const c = cursor();
    if (data && data.isCharacter) { cs.splice(c, 0, name); setBoth(cs, c + 1); opts.onChange?.(cs.join("")); return true; }
    switch (name) {
      case "BACKSPACE": if (c > 0) { cs.splice(c - 1, 1); setBoth(cs, c - 1); opts.onChange?.(cs.join("")); } return true;
      case "DELETE": if (c < cs.length) { cs.splice(c, 1); setBoth(cs, c); opts.onChange?.(cs.join("")); } return true;
      case "LEFT": if (c > 0) setCursor(c - 1); return true;
      case "RIGHT": if (c < cs.length) setCursor(c + 1); return true;
      case "HOME": setCursor(0); return true;
      case "END": setCursor(cs.length); return true;
      case "ENTER": opts.onSubmit?.(value()); return true;
      default: return false;
    }
  }

  /**
   * Compute the horizontal display-column scroll so the cursor stays visible in
   * a viewport `cols` wide.
   * @param {number} cols - Viewport width in display columns.
   * @returns {{scrollCols: number, cursorCol: number}} Scroll offset and on-screen cursor column.
   */
  function viewport(cols) {
    const cs = chars();
    const before = cs.slice(0, cursor()).join("");
    const cursorColAbs = width(before);
    let scroll = 0;
    if (cursorColAbs > cols - 1) scroll = cursorColAbs - (cols - 1);
    return { scrollCols: scroll, cursorCol: cursorColAbs - scroll };
  }

  /**
   * Render the input into a Region: placeholder when empty, otherwise the
   * horizontally-scrolled text; when focused, request the hardware cursor.
   * @param {Object} region - Target Region (single row used).
   * @param {Object} opts - Draw options: focused (boolean), attr (cell attributes), ctx ({ focusCursor(x, y) }), placeholder (string).
   * @returns {void}
   */
  function draw(region, { focused, attr, ctx, placeholder } = {}) {
    const cols = region.width;
    const text = value();
    if (text === "" && placeholder) {
      region.line(0, placeholder, { ...attr, dim: true });
    } else {
      const { scrollCols } = viewport(cols);
      region.text(0, 0, sliceCols(text, scrollCols, cols), attr);
    }
    if (focused && ctx) {
      const { cursorCol } = viewport(cols);
      ctx.focusCursor(region.x + Math.min(cols - 1, Math.max(0, cursorCol)), region.y);
    }
  }

  return { value, setValue, cursor, setCursor, handleKey, draw };
}
