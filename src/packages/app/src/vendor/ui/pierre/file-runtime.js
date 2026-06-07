export function createReadyWatcher() {
  return {
    token: 0
  };
}
export function clearReadyWatcher(state) {
  state.observer?.disconnect();
  state.observer = undefined;
}
export function getViewerHost(container) {
  if (!container) return;
  const host = container.querySelector("diffs-container");
  if (!(host instanceof HTMLElement)) return;
  return host;
}
export function getViewerRoot(container) {
  return getViewerHost(container)?.shadowRoot ?? undefined;
}
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