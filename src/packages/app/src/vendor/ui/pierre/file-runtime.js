/** @file Runtime helpers for the shadow-DOM diff viewer: locating the viewer host/shadow root, syncing its color scheme to the document, and signaling when the viewer's shadow content is ready. */

/**
 * Create the mutable state object used to track ready-watcher generations and observers.
 * @returns {Object} A fresh watcher state holding a monotonically increasing `token`.
 */
export function createReadyWatcher() {
  return {
    token: 0
  };
}
/**
 * Disconnect and clear any active MutationObserver held by a ready-watcher state.
 * @param {Object} state - The watcher state created by createReadyWatcher.
 * @returns {void}
 */
export function clearReadyWatcher(state) {
  state.observer?.disconnect();
  state.observer = undefined;
}
/**
 * Locate the `<diffs-container>` viewer host element within a container.
 * @param {HTMLElement} container - The container element to search within.
 * @returns {HTMLElement} The viewer host element, or `undefined` if not present.
 */
export function getViewerHost(container) {
  if (!container) return;
  const host = container.querySelector("diffs-container");
  if (!(host instanceof HTMLElement)) return;
  return host;
}
/**
 * Get the shadow root of the viewer host within a container.
 * @param {HTMLElement} container - The container element to search within.
 * @returns {ShadowRoot} The viewer host's shadow root, or `undefined` if unavailable.
 */
export function getViewerRoot(container) {
  return getViewerHost(container)?.shadowRoot ?? undefined;
}
/**
 * Mirror the document's `data-color-scheme` onto the viewer host (dark/light), or remove it.
 * @param {HTMLElement} host - The viewer host element to update.
 * @returns {void}
 */
export function applyViewerScheme(host) {
  if (!host) return;
  if (typeof document === "undefined") return;
  const scheme = document.documentElement.dataset.colorScheme;
  if (scheme === "dark" || scheme === "light") {
    host.dataset.colorScheme = scheme;
    return;
  }
  host.removeAttribute("data-color-scheme");
}
/**
 * Keep the viewer host's color scheme in sync with the document via a MutationObserver.
 * Applies the scheme immediately and re-applies whenever the document's `data-color-scheme` changes.
 * @param {Function} getHost - Returns the current viewer host element to update.
 * @returns {Function} A disposer that disconnects the observer (a no-op when document/MutationObserver are unavailable).
 */
export function observeViewerScheme(getHost) {
  if (typeof document === "undefined") return () => {};
  applyViewerScheme(getHost());
  if (typeof MutationObserver === "undefined") return () => {};
  const root = document.documentElement;
  const monitor = new MutationObserver(() => applyViewerScheme(getHost()));
  monitor.observe(root, {
    attributes: true,
    attributeFilter: ["data-color-scheme"]
  });
  return () => monitor.disconnect();
}
/**
 * Invoke a readiness callback once the viewer's shadow content is ready, optionally after a settle delay.
 * Uses the watcher's token to ignore stale callbacks, observes the root (and container, if the root is not yet
 * present) with MutationObservers until `opts.isReady` returns true, then waits `settleFrames` animation frames
 * before calling `opts.onReady`.
 * @param {Object} opts - Configuration object.
 * @param {Object} opts.state - The ready-watcher state created by createReadyWatcher.
 * @param {Function} opts.getRoot - Returns the shadow root to observe, or a falsy value if not yet available.
 * @param {HTMLElement} opts.container - The container to observe while waiting for the root to appear.
 * @param {Function} opts.isReady - Predicate receiving the root that returns whether the content is ready.
 * @param {Function} opts.onReady - Callback invoked once readiness (and the settle delay) is satisfied.
 * @param {number} opts.settleFrames - Number of additional animation frames to wait after readiness (defaults to 0).
 * @returns {void}
 */
export function notifyShadowReady(opts) {
  clearReadyWatcher(opts.state);
  opts.state.token += 1;
  const token = opts.state.token;
  const settle = Math.max(0, opts.settleFrames ?? 0);
  const runReady = () => {
    const step = left => {
      if (token !== opts.state.token) return;
      if (left <= 0) {
        opts.onReady();
        return;
      }
      requestAnimationFrame(() => step(left - 1));
    };
    requestAnimationFrame(() => step(settle));
  };
  const observeRoot = root => {
    if (opts.isReady(root)) {
      runReady();
      return;
    }
    if (typeof MutationObserver === "undefined") return;
    clearReadyWatcher(opts.state);
    opts.state.observer = new MutationObserver(() => {
      if (token !== opts.state.token) return;
      if (!opts.isReady(root)) return;
      clearReadyWatcher(opts.state);
      runReady();
    });
    opts.state.observer.observe(root, {
      childList: true,
      subtree: true
    });
  };
  const root = opts.getRoot();
  if (!root) {
    if (typeof MutationObserver === "undefined") return;
    opts.state.observer = new MutationObserver(() => {
      if (token !== opts.state.token) return;
      const next = opts.getRoot();
      if (!next) return;
      observeRoot(next);
    });
    opts.state.observer.observe(opts.container, {
      childList: true,
      subtree: true
    });
    return;
  }
  observeRoot(root);
}