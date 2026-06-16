/** @file DOM helpers for the contenteditable prompt editor: text-to-fragment conversion and caret-position math that treats pills/BRs as single units and ignores zero-width spaces. */

/**
 * Cap on newline-to-BR conversions before falling back to a single trailing break, guarding against pathological input.
 * @type {number}
 */
const MAX_BREAKS = 200;

/**
 * Convert a plain-text string into a document fragment, turning newlines into BR elements.
 * @param {string} content - The text to convert.
 * @returns {DocumentFragment} A fragment of text nodes and BR elements.
 */
export function createTextFragment(content) {
  const fragment = document.createDocumentFragment();
  let breaks = 0;
  for (const char of content) {
    if (char !== "\n") continue;
    breaks += 1;
    if (breaks > MAX_BREAKS) {
      const tail = content.endsWith("\n");
      const text = tail ? content.slice(0, -1) : content;
      if (text) fragment.appendChild(document.createTextNode(text));
      if (tail) fragment.appendChild(document.createElement("br"));
      return fragment;
    }
  }
  const segments = content.split("\n");
  segments.forEach((segment, index) => {
    if (segment) {
      fragment.appendChild(document.createTextNode(segment));
    }
    if (index < segments.length - 1) {
      fragment.appendChild(document.createElement("br"));
    }
  });
  return fragment;
}
/**
 * Compute the caret length of a single node: 1 for a BR, otherwise its text length excluding zero-width spaces.
 * @param {Node} node - The node to measure (text node, BR, or pill element).
 * @returns {number} The caret length contributed by the node.
 */
export function getNodeLength(node) {
  if (node.nodeType === Node.ELEMENT_NODE && node.tagName === "BR") return 1;
  return (node.textContent ?? "").replace(/\u200B/g, "").length;
}

/**
 * Recursively compute the caret length of a node and all its descendants (BRs count as 1, zero-width spaces ignored).
 * @param {Node} node - The root node to measure.
 * @returns {number} The total caret length.
 */
export function getTextLength(node) {
  if (node.nodeType === Node.TEXT_NODE) return (node.textContent ?? "").replace(/\u200B/g, "").length;
  if (node.nodeType === Node.ELEMENT_NODE && node.tagName === "BR") return 1;
  let length = 0;
  for (const child of Array.from(node.childNodes)) {
    length += getTextLength(child);
  }
  return length;
}
/**
 * Get the current caret offset within an editor element, measured in caret length from the start.
 * @param {Node} parent - The editor element containing the selection.
 * @returns {number} The caret position, or 0 when there is no selection inside the parent.
 */
export function getCursorPosition(parent) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return 0;
  const range = selection.getRangeAt(0);
  if (!parent.contains(range.startContainer)) return 0;
  const preCaretRange = range.cloneRange();
  preCaretRange.selectNodeContents(parent);
  preCaretRange.setEnd(range.startContainer, range.startOffset);
  return getTextLength(preCaretRange.cloneContents());
}
/**
 * Place the caret at a given offset within an editor element, walking nodes while accounting for pills and BRs, with a sensible fallback at the end.
 * @param {Node} parent - The editor element to set the selection in.
 * @param {number} position - The target caret offset.
 * @returns {void}
 */
export function setCursorPosition(parent, position) {
  let remaining = position;
  let node = parent.firstChild;
  while (node) {
    const length = getNodeLength(node);
    const isText = node.nodeType === Node.TEXT_NODE;
    const isPill = node.nodeType === Node.ELEMENT_NODE && (node.dataset.type === "file" || node.dataset.type === "agent");
    const isBreak = node.nodeType === Node.ELEMENT_NODE && node.tagName === "BR";
    if (isText && remaining <= length) {
      const range = document.createRange();
      const selection = window.getSelection();
      range.setStart(node, remaining);
      range.collapse(true);
      selection?.removeAllRanges();
      selection?.addRange(range);
      return;
    }
    if ((isPill || isBreak) && remaining <= length) {
      const range = document.createRange();
      const selection = window.getSelection();
      if (remaining === 0) {
        range.setStartBefore(node);
      }
      if (remaining > 0 && isPill) {
        range.setStartAfter(node);
      }
      if (remaining > 0 && isBreak) {
        const next = node.nextSibling;
        if (next && next.nodeType === Node.TEXT_NODE) {
          range.setStart(next, 0);
        }
        if (!next || next.nodeType !== Node.TEXT_NODE) {
          range.setStartAfter(node);
        }
      }
      range.collapse(true);
      selection?.removeAllRanges();
      selection?.addRange(range);
      return;
    }
    remaining -= length;
    node = node.nextSibling;
  }
  const fallbackRange = document.createRange();
  const fallbackSelection = window.getSelection();
  const last = parent.lastChild;
  if (last && last.nodeType === Node.TEXT_NODE) {
    const len = last.textContent ? last.textContent.length : 0;
    fallbackRange.setStart(last, len);
  }
  if (!last || last.nodeType !== Node.TEXT_NODE) {
    fallbackRange.selectNodeContents(parent);
  }
  fallbackRange.collapse(false);
  fallbackSelection?.removeAllRanges();
  fallbackSelection?.addRange(fallbackRange);
}
/**
 * Move one edge (start or end) of a Range to a given caret offset within an editor element, treating pills/BRs as atomic units.
 * @param {Node} parent - The editor element whose children are walked.
 * @param {Range} range - The range whose edge is adjusted.
 * @param {string} edge - Which edge to move: "start" or "end".
 * @param {number} offset - The target caret offset for the edge.
 * @returns {void}
 */
export function setRangeEdge(parent, range, edge, offset) {
  let remaining = offset;
  const nodes = Array.from(parent.childNodes);
  for (const node of nodes) {
    const length = getNodeLength(node);
    const isText = node.nodeType === Node.TEXT_NODE;
    const isPill = node.nodeType === Node.ELEMENT_NODE && (node.dataset.type === "file" || node.dataset.type === "agent");
    const isBreak = node.nodeType === Node.ELEMENT_NODE && node.tagName === "BR";
    if (isText && remaining <= length) {
      if (edge === "start") range.setStart(node, remaining);
      if (edge === "end") range.setEnd(node, remaining);
      return;
    }
    if ((isPill || isBreak) && remaining <= length) {
      if (edge === "start" && remaining === 0) range.setStartBefore(node);
      if (edge === "start" && remaining > 0) range.setStartAfter(node);
      if (edge === "end" && remaining === 0) range.setEndBefore(node);
      if (edge === "end" && remaining > 0) range.setEndAfter(node);
      return;
    }
    remaining -= length;
  }
}