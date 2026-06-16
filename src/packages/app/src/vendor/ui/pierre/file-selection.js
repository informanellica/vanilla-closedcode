/** @file Helpers for mapping DOM nodes within a diff/file viewer to logical line numbers, diff sides, and shadow-root text selections. */
import { toRange } from "./selection-bridge.js";
/**
 * Resolve a DOM node to its nearest HTMLElement.
 * @param {Node} node - The node to resolve (may be a text node or element).
 * @returns {HTMLElement} The node itself if it is an element, otherwise its parent element, or undefined when none.
 */
export function findElement(node) {
  if (!node) return;
  if (node instanceof HTMLElement) return node;
  return node.parentElement ?? undefined;
}
/**
 * Find the file line number associated with a node by walking up to the nearest [data-line] element.
 * @param {Node} node - The node to inspect.
 * @returns {number} The parsed line number, or undefined when no valid [data-line] ancestor exists.
 */
export function findFileLineNumber(node) {
  const el = findElement(node);
  if (!el) return;
  const line = el.closest("[data-line]");
  if (!(line instanceof HTMLElement)) return;
  const value = parseInt(line.dataset.line ?? "", 10);
  if (Number.isNaN(value)) return;
  return value;
}
/**
 * Find the diff line number for a node, preferring the primary [data-line] and falling back to [data-alt-line].
 * @param {Node} node - The node to inspect.
 * @returns {number} The primary line number if present, otherwise the alternate line number, or undefined.
 */
export function findDiffLineNumber(node) {
  const el = findElement(node);
  if (!el) return;
  const line = el.closest("[data-line], [data-alt-line]");
  if (!(line instanceof HTMLElement)) return;
  const primary = parseInt(line.dataset.line ?? "", 10);
  if (!Number.isNaN(primary)) return primary;
  const alt = parseInt(line.dataset.altLine ?? "", 10);
  if (!Number.isNaN(alt)) return alt;
}
/**
 * Determine which side of a diff a node belongs to by inspecting its nearest [data-code] ancestor.
 * @param {Node} node - The node to inspect.
 * @returns {string} "deletions" when the code element carries data-deletions, "additions" otherwise, or undefined when no [data-code] ancestor exists.
 */
export function findCodeSelectionSide(node) {
  const el = findElement(node);
  if (!el) return;
  const code = el.closest("[data-code]");
  if (!(code instanceof HTMLElement)) return;
  if (code.hasAttribute("data-deletions")) return "deletions";
  return "additions";
}
/**
 * Read the current text selection inside a shadow root and translate it into a line range (with optional diff sides).
 * Uses getComposedRanges where available to pierce the shadow boundary, falling back to the anchor/focus nodes.
 * @param {Object} opts - Options bag.
 * @param {Object} opts.root - The shadow root (or document-like object) whose selection is read; must implement getSelection and contains.
 * @param {Function} opts.lineForNode - Maps a node to its line number (returns undefined when not on a line).
 * @param {Function} opts.sideForNode - Optional; maps a node to its diff side ("additions"/"deletions").
 * @param {boolean} opts.preserveTextSelection - When true and a composed range exists, the cloned DOM range is returned for later restoration.
 * @returns {Object} An object with `range` (start, end, optional side/endSide) and optional `text` (cloned Range), or undefined when there is no valid in-root selection.
 */
export function readShadowLineSelection(opts) {
  const selection = opts.root.getSelection?.() ?? window.getSelection();
  if (!selection || selection.isCollapsed) return;
  const domRange = selection.getComposedRanges?.({
    shadowRoots: [opts.root]
  })?.[0] ?? (selection.rangeCount > 0 ? selection.getRangeAt(0) : undefined);
  const startNode = domRange?.startContainer ?? selection.anchorNode;
  const endNode = domRange?.endContainer ?? selection.focusNode;
  if (!startNode || !endNode) return;
  if (!opts.root.contains(startNode) || !opts.root.contains(endNode)) return;
  const start = opts.lineForNode(startNode);
  const end = opts.lineForNode(endNode);
  if (start === undefined || end === undefined) return;
  const startSide = opts.sideForNode?.(startNode);
  const endSide = opts.sideForNode?.(endNode);
  const side = startSide ?? endSide;
  const range = {
    start,
    end
  };
  if (side) range.side = side;
  if (endSide && side && endSide !== side) range.endSide = endSide;
  return {
    range,
    text: opts.preserveTextSelection && domRange ? toRange(domRange).cloneRange() : undefined
  };
}