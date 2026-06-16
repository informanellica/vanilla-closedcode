/** @file In-file find ("Cmd/Ctrl+F") engine for the diff/file viewer: scans rendered code for matches, highlights them via CSS Custom Highlights (with an absolutely-positioned overlay fallback), and wires global keyboard shortcuts across registered viewer hosts. */
import { createEffect, createSignal, onCleanup, onMount } from "../../../lib/reactivity.js";
import { makeEventListener } from "../../../lib/primitives/event-listener.js";
import { createResizeObserver } from "../../../lib/primitives/resize-observer.js";
import { createStore } from "../../../lib/store.js";
const hosts = new Set();
let target;
let current;
let installed = false;
/**
 * Test whether a node is an editable/focusable element where find shortcuts should be suppressed.
 * @param {Node} node - The DOM node to test (typically an event target).
 * @returns {boolean} `true` if the node is content-editable, a form control, or marked with `data-prevent-autofocus`.
 */
function isEditable(node) {
  if (!(node instanceof HTMLElement)) return false;
  if (node.closest("[data-prevent-autofocus]")) return true;
  if (node.isContentEditable) return true;
  return /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(node.tagName);
}
/**
 * Find the registered find-host whose connected element contains the given node.
 * @param {Node} node - A DOM node to locate within a registered host.
 * @returns {Object} The owning host, or `undefined` if none contains the node.
 */
function hostForNode(node) {
  if (!(node instanceof Node)) return;
  for (const host of hosts) {
    const el = host.element();
    if (el && el.isConnected && el.contains(node)) return host;
  }
}
/**
 * Install the global capture-phase keydown listener for find shortcuts (once per window).
 * Cmd/Ctrl+F opens/focuses find on the relevant host; Cmd/Ctrl+G cycles to the next/previous match.
 * @returns {void}
 */
function installShortcuts() {
  if (installed) return;
  if (typeof window === "undefined") return;
  installed = true;
  window.addEventListener("keydown", event => {
    if (event.defaultPrevented) return;
    if (isEditable(event.target)) return;
    const mod = event.metaKey || event.ctrlKey;
    if (!mod) return;
    const key = event.key.toLowerCase();
    if (key === "g") {
      const host = current;
      if (!host || !host.isOpen()) return;
      event.preventDefault();
      event.stopPropagation();
      host.next(event.shiftKey ? -1 : 1);
      return;
    }
    if (key !== "f") return;
    const active = current;
    if (active && active.isOpen()) {
      event.preventDefault();
      event.stopPropagation();
      active.open();
      return;
    }
    const host = hostForNode(document.activeElement) ?? hostForNode(event.target) ?? target ?? Array.from(hosts)[0];
    if (!host) return;
    event.preventDefault();
    event.stopPropagation();
    host.open();
  }, {
    capture: true
  });
}
/**
 * Remove the find highlights from the CSS Custom Highlight registry.
 * @returns {void}
 */
function clearHighlightFind() {
  const api = globalThis.CSS?.highlights;
  if (!api) return;
  api.delete("closedcode-find");
  api.delete("closedcode-find-current");
}
/**
 * Detect whether the CSS Custom Highlight API is available in this environment.
 * @returns {boolean} `true` if `Highlight` and `CSS.highlights` are supported.
 */
function supportsHighlights() {
  const g = globalThis;
  return typeof g.Highlight === "function" && g.CSS?.highlights != null;
}
/**
 * Walk up the DOM to find the nearest vertically scrollable ancestor.
 * @param {HTMLElement} el - The element to start searching from.
 * @returns {HTMLElement} The nearest scrollable ancestor, or `undefined` if none found.
 */
function scrollParent(el) {
  let parent = el.parentElement;
  while (parent) {
    const style = getComputedStyle(parent);
    if (style.overflowY === "auto" || style.overflowY === "scroll") return parent;
    parent = parent.parentElement;
  }
}
/**
 * Create an in-file find controller bound to a viewer's DOM.
 * Manages reactive open/query/index/count state, scans the rendered code for matches,
 * highlights them (CSS highlights or an overlay fallback), scrolls the active match into view,
 * registers itself as a global find host, and exposes input/keyboard event handlers.
 * @param {Object} opts - Wiring callbacks for the host viewer.
 * @param {Function} opts.wrapper - Returns the wrapper element used for positioning/focus and as the host element.
 * @param {Function} opts.overlay - Returns the overlay element used to draw highlight rectangles in fallback mode.
 * @param {Function} opts.getRoot - Returns the root element (e.g. shadow root) to scan and highlight within.
 * @returns {Object} A find controller exposing reactive accessors (`open`, `query`, `count`, `index`, `pos`) and methods (`setInput`, `setQuery`, `focus`, `close`, `next`, `refresh`, `onPointerDown`, `onFocus`, `onInputKeyDown`).
 */
export function createFileFind(opts) {
  let input;
  let overlayFrame;
  let mode = "overlay";
  let hits = [];
  const [overlayScroll, setOverlayScroll] = createSignal([]);
  const [state, setState] = createStore({
    open: false,
    query: "",
    index: 0,
    count: 0,
    pos: {
      top: 8,
      right: 8
    }
  });
  const open = () => state.open;
  const query = () => state.query;
  const index = () => state.index;
  const count = () => state.count;
  const pos = () => state.pos;
  const clearOverlayScroll = () => {
    setOverlayScroll([]);
  };
  const clearOverlay = () => {
    const el = opts.overlay();
    if (!el) return;
    if (overlayFrame !== undefined) {
      cancelAnimationFrame(overlayFrame);
      overlayFrame = undefined;
    }
    el.innerHTML = "";
  };
  /**
   * Draw highlight rectangles for every match into the overlay element (fallback mode),
   * positioning each rect relative to the wrapper and emphasizing the active match.
   * @returns {void}
   */
  const renderOverlay = () => {
    if (mode !== "overlay") {
      clearOverlay();
      return;
    }
    const wrapper = opts.wrapper();
    const overlay = opts.overlay();
    if (!wrapper || !overlay) return;
    clearOverlay();
    if (hits.length === 0) return;
    const base = wrapper.getBoundingClientRect();
    const currentIndex = index();
    const frag = document.createDocumentFragment();
    for (let i = 0; i < hits.length; i++) {
      const range = hits[i];
      const active = i === currentIndex;
      for (const rect of Array.from(range.getClientRects())) {
        if (!rect.width || !rect.height) continue;
        const mark = document.createElement("div");
        mark.style.position = "absolute";
        mark.style.left = `${Math.round(rect.left - base.left)}px`;
        mark.style.top = `${Math.round(rect.top - base.top)}px`;
        mark.style.width = `${Math.round(rect.width)}px`;
        mark.style.height = `${Math.round(rect.height)}px`;
        mark.style.borderRadius = "2px";
        mark.style.backgroundColor = active ? "var(--surface-warning-strong)" : "var(--surface-warning-base)";
        mark.style.opacity = active ? "0.55" : "0.35";
        if (active) mark.style.boxShadow = "inset 0 0 0 1px var(--border-warning-base)";
        frag.appendChild(mark);
      }
    }
    overlay.appendChild(frag);
  };
  function scheduleOverlay() {
    if (mode !== "overlay") return;
    if (!open()) return;
    if (overlayFrame !== undefined) return;
    overlayFrame = requestAnimationFrame(() => {
      overlayFrame = undefined;
      renderOverlay();
    });
  }
  const syncOverlayScroll = () => {
    if (mode !== "overlay") return;
    const root = opts.getRoot();
    const next = root ? Array.from(root.querySelectorAll("[data-code]")).filter(node => node instanceof HTMLElement) : [];
    const current = overlayScroll();
    if (next.length === current.length && next.every((el, i) => el === current[i])) return;
    clearOverlayScroll();
    setOverlayScroll(next);
  };
  const clearFind = () => {
    clearHighlightFind();
    clearOverlay();
    clearOverlayScroll();
    hits = [];
    setState("count", 0);
    setState("index", 0);
  };
  const positionBar = () => {
    if (typeof window === "undefined") return;
    const wrapper = opts.wrapper();
    if (!wrapper) return;
    const root = scrollParent(wrapper) ?? wrapper;
    const rect = root.getBoundingClientRect();
    const title = parseFloat(getComputedStyle(root).getPropertyValue("--session-title-height"));
    const header = Number.isNaN(title) ? 0 : title;
    setState("pos", {
      top: Math.round(rect.top) + header - 4,
      right: Math.round(window.innerWidth - rect.right) + 8
    });
  };
  /**
   * Scan the rendered code columns for case-insensitive matches of a search string,
   * building a DOM Range for each occurrence (walking text nodes to map character offsets).
   * @param {HTMLElement} root - The viewer root to scan.
   * @param {string} value - The search string to match.
   * @returns {Array} An array of Range objects, one per match.
   */
  const scan = (root, value) => {
    const needle = value.toLowerCase();
    const ranges = [];
    const cols = Array.from(root.querySelectorAll("[data-content] [data-line], [data-column-content]")).filter(node => node instanceof HTMLElement);
    for (const col of cols) {
      const text = col.textContent;
      if (!text) continue;
      const hay = text.toLowerCase();
      let at = hay.indexOf(needle);
      if (at === -1) continue;
      const nodes = [];
      const ends = [];
      const walker = document.createTreeWalker(col, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode();
      let pos = 0;
      while (node) {
        if (node instanceof Text) {
          pos += node.data.length;
          nodes.push(node);
          ends.push(pos);
        }
        node = walker.nextNode();
      }
      if (nodes.length === 0) continue;
      const locate = offset => {
        let lo = 0;
        let hi = ends.length - 1;
        while (lo < hi) {
          const mid = lo + hi >> 1;
          if (ends[mid] >= offset) hi = mid;else lo = mid + 1;
        }
        const prev = lo === 0 ? 0 : ends[lo - 1];
        return {
          node: nodes[lo],
          offset: offset - prev
        };
      };
      while (at !== -1) {
        const start = locate(at);
        const end = locate(at + value.length);
        const range = document.createRange();
        range.setStart(start.node, start.offset);
        range.setEnd(end.node, end.offset);
        ranges.push(range);
        at = hay.indexOf(needle, at + value.length);
      }
    }
    return ranges;
  };
  const scrollToRange = range => {
    const start = range.startContainer;
    const el = start instanceof Element ? start : start.parentElement;
    el?.scrollIntoView({
      block: "center",
      inline: "center"
    });
  };
  /**
   * Register match ranges with the CSS Custom Highlight registry, styling the active match separately.
   * @param {Array} ranges - All match ranges.
   * @param {number} currentIndex - Index of the active match within `ranges`.
   * @returns {boolean} `true` if highlights were applied, `false` if the API is unavailable.
   */
  const setHighlights = (ranges, currentIndex) => {
    const api = globalThis.CSS?.highlights;
    const Highlight = globalThis.Highlight;
    if (!api || typeof Highlight !== "function") return false;
    api.delete("closedcode-find");
    api.delete("closedcode-find-current");
    const active = ranges[currentIndex];
    if (active) api.set("closedcode-find-current", new Highlight(active));
    const rest = ranges.filter((_, i) => i !== currentIndex);
    if (rest.length > 0) api.set("closedcode-find", new Highlight(...rest));
    return true;
  };
  /**
   * Re-run the search for the current query, update match count/index, and render highlights.
   * Chooses CSS-highlight or overlay mode based on capability and falls back gracefully.
   * @param {Object} args - Options controlling this pass.
   * @param {boolean} args.reset - When truthy, reset the active match index to 0.
   * @param {boolean} args.scroll - When truthy, scroll the active match into view.
   * @returns {void}
   */
  const apply = args => {
    if (!open()) return;
    const value = query().trim();
    if (!value) {
      clearFind();
      return;
    }
    const root = opts.getRoot();
    if (!root) return;
    mode = supportsHighlights() ? "highlights" : "overlay";
    const ranges = scan(root, value);
    const total = ranges.length;
    const desired = args?.reset ? 0 : index();
    const currentIndex = total ? Math.min(desired, total - 1) : 0;
    hits = ranges;
    setState("count", total);
    setState("index", currentIndex);
    const active = ranges[currentIndex];
    if (mode === "highlights") {
      clearOverlay();
      clearOverlayScroll();
      if (!setHighlights(ranges, currentIndex)) {
        mode = "overlay";
        clearHighlightFind();
        syncOverlayScroll();
        scheduleOverlay();
      }
      if (args?.scroll && active) scrollToRange(active);
      return;
    }
    clearHighlightFind();
    syncOverlayScroll();
    if (args?.scroll && active) scrollToRange(active);
    scheduleOverlay();
  };
  const close = () => {
    setState("open", false);
    setState("query", "");
    clearFind();
    if (current === host) current = undefined;
  };
  /**
   * Open and focus this find host (closing any other open host) and run an initial search.
   * @returns {void}
   */
  const focus = () => {
    if (current && current !== host) current.close();
    current = host;
    target = host;
    if (!open()) setState("open", true);
    requestAnimationFrame(() => {
      apply({
        scroll: true
      });
      input?.focus();
      input?.select();
    });
  };
  /**
   * Advance the active match by a direction, wrapping around, and scroll/highlight it.
   * @param {number} dir - Step direction: `1` for next, `-1` for previous.
   * @returns {void}
   */
  const next = dir => {
    if (!open()) return;
    const total = count();
    if (total <= 0) return;
    const currentIndex = (index() + dir + total) % total;
    setState("index", currentIndex);
    const active = hits[currentIndex];
    if (!active) return;
    if (mode === "highlights") {
      if (!setHighlights(hits, currentIndex)) {
        mode = "overlay";
        apply({
          reset: true,
          scroll: true
        });
        return;
      }
      scrollToRange(active);
      return;
    }
    clearHighlightFind();
    syncOverlayScroll();
    scrollToRange(active);
    scheduleOverlay();
  };
  const host = {
    element: opts.wrapper,
    isOpen: () => open(),
    next,
    open: focus,
    close
  };
  createEffect(() => {
    for (const el of overlayScroll()) makeEventListener(el, "scroll", scheduleOverlay, {
      passive: true
    });
  });
  onMount(() => {
    mode = supportsHighlights() ? "highlights" : "overlay";
    installShortcuts();
    hosts.add(host);
    if (!target) target = host;
    onCleanup(() => {
      hosts.delete(host);
      if (current === host) {
        current = undefined;
        clearHighlightFind();
      }
      if (target === host) target = undefined;
    });
  });
  createEffect(() => {
    if (!open()) return;
    const update = () => positionBar();
    requestAnimationFrame(update);
    makeEventListener(window, "resize", update, {
      passive: true
    });
    const wrapper = opts.wrapper();
    if (!wrapper) return;
    const root = scrollParent(wrapper) ?? wrapper;
    createResizeObserver(root, update);
  });
  onCleanup(() => {
    clearOverlayScroll();
    clearOverlay();
    if (current === host) {
      current = undefined;
      clearHighlightFind();
    }
  });
  return {
    open,
    query,
    count,
    index,
    pos,
    setInput: el => {
      input = el;
    },
    setQuery: value => {
      setState("query", value);
      setState("index", 0);
      apply({
        reset: true,
        scroll: true
      });
    },
    focus,
    close,
    next,
    refresh: args => apply(args),
    onPointerDown: () => {
      target = host;
      opts.wrapper()?.focus({
        preventScroll: true
      });
    },
    onFocus: () => {
      target = host;
    },
    onInputKeyDown: event => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Enter") return;
      event.preventDefault();
      next(event.shiftKey ? -1 : 1);
    }
  };
}