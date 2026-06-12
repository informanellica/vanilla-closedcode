// Text input controller for the vanilla TUI runtime (Stage T2 widgets). State is
// signals (value + cursor); the cursor is a CODE-POINT index so a fullwidth
// glyph edits/moves as one unit. Editing keys mutate the value; draw() renders
// the (horizontally scrolled) text and, when focused, requests the hardware
// cursor at the correct display column.
import { createSignal } from "./reactivity.js";
import { width, sliceCols } from "./text.js";

export function createTextInput(initial = "", opts = {}) {
  const [value, setValue] = createSignal(initial);
  const [cursor, setCursor] = createSignal([...initial].length); // code-point index
  const chars = () => [...value()];

  function setBoth(arr, c) { setValue(arr.join("")); setCursor(Math.max(0, Math.min(c, arr.length))); }

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

  // Compute the horizontal display-column scroll so the cursor stays visible in
  // a viewport `cols` wide. Returns { scrollCols, cursorCol } (both in columns).
  function viewport(cols) {
    const cs = chars();
    const before = cs.slice(0, cursor()).join("");
    const cursorColAbs = width(before);
    let scroll = 0;
    if (cursorColAbs > cols - 1) scroll = cursorColAbs - (cols - 1);
    return { scrollCols: scroll, cursorCol: cursorColAbs - scroll };
  }

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
