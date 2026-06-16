/** @file Helpers for file-view selection types (normalizing a line range into a full-line selection). */
/**
 * Build a normalized full-line selection from a (possibly reversed) line range.
 * Orders start/end ascending and zeroes the character offsets to select whole lines.
 * @param {Object} range - Line range `{start, end}` (either order).
 * @returns {Object} Selection `{startLine, endLine, startChar, endChar}` with character offsets at 0.
 */
export function selectionFromLines(range) {
  const startLine = Math.min(range.start, range.end);
  const endLine = Math.max(range.start, range.end);
  return {
    startLine,
    endLine,
    startChar: 0,
    endChar: 0
  };
}