import { Virtualizer } from "@pierre/diffs";
const cache = new WeakMap();
export const virtualMetrics = {
  lineHeight: 24,
  hunkSeparatorHeight: 24,
  fileGap: 0
};
function scrollable(value) {
  return value === "auto" || value === "scroll" || value === "overlay";
}
function scrollRoot(container) {
  let node = container.parentElement;
  while (node) {
    const style = getComputedStyle(node);
    if (scrollable(style.overflowY)) return node;
    node = node.parentElement;
  }
}
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