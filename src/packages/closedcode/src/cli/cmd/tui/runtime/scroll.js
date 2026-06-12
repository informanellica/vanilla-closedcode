// Scrollable line view for the vanilla TUI runtime (Stage T2). Renders a list of
// pre-wrapped lines into a region, windowed by a scroll offset measured from the
// bottom (0 = pinned to the latest line — the chat-timeline default). Returns the
// clamped offset + maxScroll so callers can keep their scroll signal in range.
import { wordWrap } from "./text.js";

// Turn an array of messages (strings, may contain \n) into display lines wrapped
// to `width` columns. Use the result as `lines` for drawScrollLines.
export function wrapMessages(messages, width) {
  const lines = [];
  for (const m of messages) for (const l of wordWrap(String(m), width)) lines.push(l);
  return lines;
}

// Draw `lines` into `region`, scrolled. offset counts lines hidden BELOW the
// viewport (0 = bottom-pinned). Returns { offset, maxScroll, start }.
export function drawScrollLines(region, lines, offset, attr) {
  const h = region.height;
  const maxScroll = Math.max(0, lines.length - h);
  const off = Math.min(Math.max(0, offset | 0), maxScroll);
  const start = Math.max(0, lines.length - h - off);
  const visible = lines.slice(start, start + h);
  for (let i = 0; i < visible.length; i++) region.line(i, visible[i], attr);
  return { offset: off, maxScroll, start };
}
