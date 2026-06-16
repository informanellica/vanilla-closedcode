/** @file Line-selection model helpers for the diff/file viewer: formatting labels, previewing, comparing line ranges, and bridging line-number drag selections. */
/**
 * Format a human-readable label for a selected line range using the provided translator.
 * @param {Object} range - A line range with `start` and `end` numbers (order-independent).
 * @param {Function} t - Translation function taking a key and interpolation values.
 * @returns {string} A single-line label when start equals end, otherwise a line-range label.
 */
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
/**
 * Produce a short preview (up to two lines) of the source text covered by a selected line range.
 * @param {string} source - The full source text, newline-separated.
 * @param {Object} range - A line range with 1-based `start` and `end` numbers (order-independent).
 * @returns {string} The first up-to-two selected lines joined by newlines, or undefined when the range is empty.
 */
export function previewSelectedLines(source, range) {
  const start = Math.max(1, Math.min(range.start, range.end));
  const end = Math.max(range.start, range.end);
  const lines = source.split("\n").slice(start - 1, end);
  if (lines.length === 0) return;
  return lines.slice(0, 2).join("\n");
}
/**
 * Create a shallow copy of a selected line range, preserving optional `side` and `endSide` fields.
 * @param {Object} range - A line range with `start`, `end`, and optional `side`/`endSide`.
 * @returns {Object} A new range object with the same fields.
 */
export function cloneSelectedLineRange(range) {
  const next = {
    start: range.start,
    end: range.end
  };
  if (range.side) next.side = range.side;
  if (range.endSide) next.endSide = range.endSide;
  return next;
}
/**
 * Test whether a given line (and optional diff side) falls within a selected range, honoring per-endpoint sides.
 * @param {Object} range - A line range with `start`, `end`, and optional `side`/`endSide`.
 * @param {number} line - The line number to test.
 * @param {string} side - Optional diff side ("additions"/"deletions") to match against the range endpoints.
 * @returns {boolean} True when the line (and side, if provided) is inside the selection.
 */
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
/**
 * Determine whether a range selects exactly one line on a single diff side.
 * @param {Object} range - A line range with `start`, `end`, and optional `side`/`endSide`.
 * @returns {boolean} True when start equals end and the endSide matches (or is unset).
 */
export function isSingleLineSelection(range) {
  if (!range) return false;
  return range.start === range.end && (range.endSide == null || range.endSide === range.side);
}
/**
 * Coerce a Range or range-like descriptor into a live DOM Range.
 * @param {Range|Object} source - A DOM Range, or an object with startContainer/startOffset/endContainer/endOffset.
 * @returns {Range} The source when already a Range, otherwise a new Range built from the descriptor.
 */
export function toRange(source) {
  if (source instanceof Range) return source;
  const range = new Range();
  range.setStart(source.startContainer, source.startOffset);
  range.setEnd(source.endContainer, source.endOffset);
  return range;
}
/**
 * Restore a previously captured text selection inside a shadow root on the next animation frame.
 * @param {Object} root - The shadow root (or document-like object) exposing getSelection.
 * @param {Range} range - The DOM Range to re-apply.
 * @returns {void}
 */
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
/**
 * Create a stateful bridge that tracks line-number-gutter drag selections versus ordinary text selections.
 * It distinguishes a click/drag that started in the line-number column ("numbers" mode) from a text selection
 * ("text" mode) and exposes whether a multi-line gutter drag should be consumed as a line selection.
 * @returns {Object} A bridge with `begin`, `track`, `finish`, `consume`, and `reset` methods (see each method's docs).
 */
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
    /**
     * Begin tracking a pointer-down: enter "numbers" mode when starting in the gutter, otherwise "text" mode.
     * @param {boolean} numberColumn - True when the pointer-down occurred on a line-number column.
     * @param {number} next - The line number under the pointer at start (used as the drag origin).
     * @returns {void}
     */
    begin(numberColumn, next) {
      if (!numberColumn) {
        mode = "text";
        return;
      }
      mode = "numbers";
      line = next;
      moved = false;
    },
    /**
     * Update tracking during pointer-move; only active in "numbers" mode. Clears state when the primary button is released.
     * @param {number} buttons - The pointer event's `buttons` bitmask (bit 0 is the primary button).
     * @param {number} next - The line number currently under the pointer; marks the drag as moved when it differs from the origin.
     * @returns {boolean} True when in "numbers" mode (move was handled), false otherwise.
     */
    track(buttons, next) {
      if (mode !== "numbers") return false;
      if ((buttons & 1) === 0) {
        clear();
        return true;
      }
      if (next !== undefined && line !== undefined && next !== line) moved = true;
      return true;
    },
    /**
     * End the current interaction, recording whether a multi-line gutter drag is pending consumption, then reset state.
     * @returns {string} The mode that was active at finish time ("none", "text", or "numbers").
     */
    finish() {
      const current = mode;
      pending = current === "numbers" && moved;
      clear();
      return current;
    },
    /**
     * Consume a pending gutter drag as a line-range selection, clearing the pending flag.
     * @param {Object} range - The resulting line range, used to reject single-line selections.
     * @returns {boolean} True when a multi-line gutter drag was pending; false otherwise.
     */
    consume(range) {
      const result = pending && !isSingleLineSelection(range);
      pending = false;
      return result;
    },
    /**
     * Reset all bridge state, discarding any pending gutter drag.
     * @returns {void}
     */
    reset() {
      pending = false;
      clear();
    }
  };
}