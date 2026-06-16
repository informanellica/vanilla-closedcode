/** @file Marks diff and file rows (and their annotations) as commented by toggling the `data-comment-selected` attribute for the given line ranges. */
import { diffLineIndex, diffRowIndex } from "./diff-selection.js";
/**
 * Extracts the line number stored in a node's `data-line-annotation` attribute.
 * @param {HTMLElement} node - Element carrying a `data-line-annotation` dataset value of the form "x,line".
 * @returns {number} The parsed line number, or undefined when missing or not numeric.
 */
function annotationIndex(node) {
  const value = node.dataset.lineAnnotation?.split(",")[1];
  if (!value) return;
  const line = parseInt(value, 10);
  if (Number.isNaN(line)) return;
  return line;
}
/**
 * Removes the `data-comment-selected` attribute from every marked element under root.
 * @param {HTMLElement} root - Subtree to clear of comment-selection markers.
 * @returns {void}
 */
function clear(root) {
  const marked = Array.from(root.querySelectorAll("[data-comment-selected]"));
  for (const node of marked) {
    if (!(node instanceof HTMLElement)) continue;
    node.removeAttribute("data-comment-selected");
  }
}
/**
 * Highlights commented lines within a diff view by marking matching rows and annotations.
 * Resolves each range's side-aware start/end to row indices and marks every row in between.
 * @param {HTMLElement} root - Root element containing the `[data-diff]` viewer.
 * @param {Array} ranges - Comment ranges; each has start, end, optional side and endSide.
 * @returns {void}
 */
export function markCommentedDiffLines(root, ranges) {
  clear(root);
  const diffs = root.querySelector("[data-diff]");
  if (!(diffs instanceof HTMLElement)) return;
  const split = diffs.dataset.diffType === "split";
  const rows = Array.from(diffs.querySelectorAll("[data-line-index]")).filter(node => node instanceof HTMLElement);
  if (rows.length === 0) return;
  const annotations = Array.from(diffs.querySelectorAll("[data-line-annotation]")).filter(node => node instanceof HTMLElement);
  for (const range of ranges) {
    const start = diffRowIndex(root, split, range.start, range.side);
    if (start === undefined) continue;
    const end = (() => {
      const same = range.end === range.start && (range.endSide == null || range.endSide === range.side);
      if (same) return start;
      return diffRowIndex(root, split, range.end, range.endSide ?? range.side);
    })();
    if (end === undefined) continue;
    const first = Math.min(start, end);
    const last = Math.max(start, end);
    for (const row of rows) {
      const idx = diffLineIndex(split, row);
      if (idx === undefined || idx < first || idx > last) continue;
      row.setAttribute("data-comment-selected", "");
    }
    for (const annotation of annotations) {
      const idx = annotationIndex(annotation);
      if (idx === undefined || idx < first || idx > last) continue;
      annotation.setAttribute("data-comment-selected", "");
    }
  }
}
/**
 * Highlights commented lines within a single-file (non-diff) view.
 * Marks each line element and number cell within the inclusive line ranges, plus matching annotations.
 * @param {HTMLElement} root - Root element containing the file's line markup.
 * @param {Array} ranges - Comment ranges; each has numeric start and end line numbers.
 * @returns {void}
 */
export function markCommentedFileLines(root, ranges) {
  clear(root);
  const annotations = Array.from(root.querySelectorAll("[data-line-annotation]")).filter(node => node instanceof HTMLElement);
  for (const range of ranges) {
    const start = Math.max(1, Math.min(range.start, range.end));
    const end = Math.max(range.start, range.end);
    for (let line = start; line <= end; line++) {
      const nodes = Array.from(root.querySelectorAll(`[data-line="${line}"], [data-column-number="${line}"]`));
      for (const node of nodes) {
        if (!(node instanceof HTMLElement)) continue;
        node.setAttribute("data-comment-selected", "");
      }
    }
    for (const annotation of annotations) {
      const line = annotationIndex(annotation);
      if (line === undefined || line < start || line > end) continue;
      annotation.setAttribute("data-comment-selected", "");
    }
  }
}