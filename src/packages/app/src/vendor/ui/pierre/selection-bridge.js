export function formatSelectedLineLabel(range, t) {
  const start = Math.min(range.start, range.end);
  const end = Math.max(range.start, range.end);
  if (start === end) return t("ui.sessionReview.selection.line", {
    line: start
  });
  return t("ui.sessionReview.selection.lines", {
    start,
    end
  });
}
export function previewSelectedLines(source, range) {
  const start = Math.max(1, Math.min(range.start, range.end));
  const end = Math.max(range.start, range.end);
  const lines = source.split("\n").slice(start - 1, end);
  if (lines.length === 0) return;
  return lines.slice(0, 2).join("\n");
}
export function cloneSelectedLineRange(range) {
  const next = {
    start: range.start,
    end: range.end
  };
  if (range.side) next.side = range.side;
  if (range.endSide) next.endSide = range.endSide;
  return next;
}
export function lineInSelectedRange(range, line, side) {
  if (!range) return false;
  const start = Math.min(range.start, range.end);
  const end = Math.max(range.start, range.end);
  if (line < start || line > end) return false;
  if (!side) return true;
  const first = range.side;
  const last = range.endSide ?? first;
  if (!first && !last) return true;
  if (!first || !last) return (first ?? last) === side;
  if (first === last) return first === side;
  if (line === start) return first === side;
  if (line === end) return last === side;
  return true;
}
export function isSingleLineSelection(range) {
  if (!range) return false;
  return range.start === range.end && (range.endSide == null || range.endSide === range.side);
}
export function toRange(source) {
  if (source instanceof Range) return source;
  const range = new Range();
  range.setStart(source.startContainer, source.startOffset);
  range.setEnd(source.endContainer, source.endOffset);
  return range;
}
export function restoreShadowTextSelection(root, range) {
  if (!root || !range) return;
  requestAnimationFrame(() => {
    const selection = root.getSelection?.() ?? window.getSelection();
    if (!selection) return;
    try {
      selection.removeAllRanges();
      selection.addRange(range);
    } catch {}
  });
}
export function createLineNumberSelectionBridge() {
  let mode = "none";
  let line;
  let moved = false;
  let pending = false;
  const clear = () => {
    mode = "none";
    line = undefined;
    moved = false;
  };
  return {
    begin(numberColumn, next) {
      if (!numberColumn) {
        mode = "text";
        return;
      }
      mode = "numbers";
      line = next;
      moved = false;
    },
    track(buttons, next) {
      if (mode !== "numbers") return false;
      if ((buttons & 1) === 0) {
        clear();
        return true;
      }
      if (next !== undefined && line !== undefined && next !== line) moved = true;
      return true;
    },
    finish() {
      const current = mode;
      pending = current === "numbers" && moved;
      clear();
      return current;
    },
    consume(range) {
      const result = pending && !isSingleLineSelection(range);
      pending = false;
      return result;
    },
    reset() {
      pending = false;
      clear();
    }
  };
}