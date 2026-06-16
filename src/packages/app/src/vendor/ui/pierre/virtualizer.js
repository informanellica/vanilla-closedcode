/** @file Shares ref-counted @pierre/diffs Virtualizer instances per scroll root for diff/log views. */
import { Virtualizer } from "@pierre/diffs";
const cache = new WeakMap();
/** Pixel metrics used by the diff virtualizer (line height, hunk separator height, file gap). */
export const virtualMetrics = {
  lineHeight: 24,
  hunkSeparatorHeight: 24,
  fileGap: 0
};
/**
 * Test whether a CSS overflow value produces a scrollable area.
 * @param {string} value - A computed `overflow-y` value.
 * @returns {boolean} True for "auto", "scroll", or "overlay".
 */
function scrollable(value) {
  return value === "auto" || value === "scroll" || value === "overlay";
}
/**
 * Walk up from a container to find the nearest scrollable ancestor element.
 * @param {HTMLElement} container - The starting element.
 * @returns {HTMLElement} The nearest ancestor with a scrollable overflow-y, or undefined if none.
 */
function scrollRoot(container) {
  let node = container.parentElement;
  while (node) {
    const style = getComputedStyle(node);
    if (scrollable(style.overflowY)) return node;
    node = node.parentElement;
  }
}
/**
 * Resolve the virtualizer target for a container: the cache key, the scroll root element,
 * and the content element. Handles the session-review layout specially, then falls back to
 * the nearest scroll root, then the document.
 * @param {HTMLElement} container - The diff/log container element.
 * @returns {Object} Object with `key`, `root`, and `content`, or undefined when there is no document.
 */
function target(container) {
  if (typeof document === "undefined") return;
  const review = container.closest("[data-component='session-review']");
  if (review instanceof HTMLElement) {
    const root = scrollRoot(container) ?? review;
    const content = review.querySelector("[data-slot='session-review-container']");
    return {
      key: review,
      root,
      content: content instanceof HTMLElement ? content : undefined
    };
  }
  const root = scrollRoot(container);
  if (root) {
    const content = root.querySelector("[role='log']");
    return {
      key: root,
      root,
      content: content instanceof HTMLElement ? content : undefined
    };
  }
  return {
    key: document,
    root: document,
    content: undefined
  };
}
/**
 * Acquire a shared, ref-counted Virtualizer for a container's scroll root, creating and
 * setting one up on first use. The returned handle's `release` decrements the ref count
 * and cleans up the virtualizer when the last reference is released.
 * @param {HTMLElement} container - The diff/log container element.
 * @returns {Object} Handle with `virtualizer` and a `release` function, or undefined when no target resolves.
 */
export function acquireVirtualizer(container) {
  const resolved = target(container);
  if (!resolved) return;
  let entry = cache.get(resolved.key);
  if (!entry) {
    const virtualizer = new Virtualizer();
    virtualizer.setup(resolved.root, resolved.content);
    entry = {
      virtualizer,
      refs: 0
    };
    cache.set(resolved.key, entry);
  }
  entry.refs += 1;
  let done = false;
  return {
    virtualizer: entry.virtualizer,
    release() {
      if (done) return;
      done = true;
      const current = cache.get(resolved.key);
      if (!current) return;
      current.refs -= 1;
      if (current.refs > 0) return;
      current.virtualizer.cleanUp();
      cache.delete(resolved.key);
    }
  };
}