/** @file Helpers for normalizing text-selection ranges within a diff viewer (mapping DOM nodes to line indices and which side of the diff they belong to). */

/**
 * Determine which side of a diff a DOM node belongs to.
 * @param {Node} node - A DOM node within the diff viewer.
 * @returns {string} `"deletions"` if the node is on the deletion side, otherwise `"additions"`.
 */
export function findDiffSide(node) {
  const line = node.closest("[data-line], [data-alt-line]");
  if (line instanceof HTMLElement) {
    const type = line.dataset.lineType;
    if (type === "change-deletion") return "deletions";
    if (type === "change-addition" || type === "change-additions") return "additions";
  }
  const code = node.closest("[data-code]");
  if (!(code instanceof HTMLElement)) return "additions";
  return code.hasAttribute("data-deletions") ? "deletions" : "additions";
}
/**
 * Read the diff line index from a row element's `data-line-index` attribute.
 * @param {boolean} split - Whether the diff is rendered in split (two-column) mode.
 * @param {HTMLElement} node - The row element carrying a comma-separated `data-line-index`.
 * @returns {number} The resolved line index, or `undefined` when the attribute is missing or unparseable. In split mode with two values the second (right column) index is used.
 */
export function diffLineIndex(split, node) {
  const raw = node.dataset.lineIndex;
  if (!raw) return;
  const values = raw.split(",").map(x => parseInt(x, 10)).filter(x => !Number.isNaN(x));
  if (values.length === 0) return;
  if (!split) return values[0];
  if (values.length === 2) return values[1];
  return values[0];
}
/**
 * Resolve the line index for a given diff line number on a specific side.
 * @param {HTMLElement} root - The diff viewer root to query within.
 * @param {boolean} split - Whether the diff is rendered in split mode.
 * @param {number} line - The diff line number to locate.
 * @param {string} side - Preferred diff side (`"additions"` or `"deletions"`); defaults to `"additions"`.
 * @returns {number} The matching line index, or `undefined` if no matching row is found.
 */
export function diffRowIndex(root, split, line, side) {
  const rows = Array.from(root.querySelectorAll(`[data-line="${line}"], [data-alt-line="${line}"]`)).filter(node => node instanceof HTMLElement);
  if (rows.length === 0) return;
  const target = side ?? "additions";
  for (const row of rows) {
    if (findDiffSide(row) === target) return diffLineIndex(split, row);
    if (parseInt(row.dataset.altLine ?? "", 10) === line) return diffLineIndex(split, row);
  }
}
/**
 * Normalize a diff selection range, swapping start/end when the selection runs backwards.
 * @param {HTMLElement} root - The diff viewer root containing the diff DOM.
 * @param {Object} range - The selection range with `start`, `end`, and optional `side`/`endSide` fields.
 * @returns {Object} The original range if already forward-ordered, a swapped range if reversed, `null` if the range cannot be resolved against rendered lines, or `undefined` when there is no diff DOM to operate on.
 */
export function fixDiffSelection(root, range) {
  if (!range) return range;
  if (!root) return;
  const diffs = root.querySelector("[data-diff]");
  if (!(diffs instanceof HTMLElement)) return;
  const split = diffs.dataset.diffType === "split";
  const start = diffRowIndex(root, split, range.start, range.side);
  const end = diffRowIndex(root, split, range.end, range.endSide ?? range.side);
  if (start === undefined || end === undefined) {
    if (root.querySelector("[data-line], [data-alt-line]") == null) return;
    return null;
  }
  if (start <= end) return range;
  const side = range.endSide ?? range.side;
  const swapped = {
    start: range.end,
    end: range.start
  };
  if (side) swapped.side = side;
  if (range.endSide && range.side) swapped.endSide = range.side;
  return swapped;
}