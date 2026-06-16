/** @file Local, self-contained replacement for ui/hooks: useFilteredList (fuzzy-filtered, grouped, keyboard-navigable list) and createAutoScroll (follow-bottom scrolling for streaming content). */
// Local, self-contained replacement for ui/hooks.
// Faithful port of packages/ui/src/hooks/{use-filtered-list,create-auto-scroll}.js
// (which re-export via packages/ui/src/hooks/index.js). No ui imports.
import fuzzysort from "fuzzysort";
import { entries, flatMap, groupBy, map, pipe } from "remeda";
import { createEffect, createMemo, createResource, on, onCleanup } from "./reactivity.js";
import { createStore } from "./store.js";
import { createList } from "./primitives/solid-list.js";
import { createEventListener } from "./primitives/event-listener.js";
import { createResizeObserver } from "./primitives/resize-observer.js";

/**
 * Manage a fuzzy-filtered, grouped, keyboard-navigable list. Resolves items
 * (static or a function of the filter), fuzzy-matches against the filter,
 * groups/sorts them, and tracks the active (highlighted) entry with looping
 * arrow / Ctrl+N/P navigation and Enter selection.
 * @param {Object} props - Configuration: `items` (array or function of filter),
 *   `filterKeys`, `groupBy`, `sortBy`, `sortGroupsBy`, `key` (item to id),
 *   `current`, `noInitialSelection`, and `onSelect` (item, index).
 * @returns {Object} `{ grouped, filter, flat, reset, refetch, clear, onKeyDown,
 *   onInput, active, setActive }`.
 */
export function useFilteredList(props) {
  const [store, setStore] = createStore({
    filter: ""
  });
  const empty = [];
  const [grouped, {
    refetch
  }] = createResource(() => ({
    filter: store.filter,
    items: typeof props.items === "function" ? props.items(store.filter) : props.items
  }), async ({
    filter,
    items
  }) => {
    const query = filter ?? "";
    const needle = query.toLowerCase();
    const all = (await Promise.resolve(items)) || [];
    const result = pipe(all, x => {
      if (!needle) return x;
      if (!props.filterKeys && Array.isArray(x) && x.every(e => typeof e === "string")) {
        return fuzzysort.go(needle, x).map(x => x.target);
      }
      return fuzzysort.go(needle, x, {
        keys: props.filterKeys
      }).map(x => x.obj);
    }, groupBy(x => props.groupBy ? props.groupBy(x) : ""), entries(), map(([k, v]) => ({
      category: k,
      items: props.sortBy ? v.sort(props.sortBy) : v
    })), groups => props.sortGroupsBy ? groups.sort(props.sortGroupsBy) : groups);
    return result;
  }, {
    initialValue: empty
  });
  const flat = createMemo(() => {
    return pipe(grouped.latest || [], flatMap(x => x.items));
  });
  /**
   * The id that should be active on first render: none when noInitialSelection,
   * else the `current` item's id, else the first flat item's id.
   * @returns {string} The initial active id (or "").
   */
  function initialActive() {
    if (props.noInitialSelection) return "";
    if (props.current) return props.key(props.current);
    const items = flat();
    if (items.length === 0) return "";
    return props.key(items[0]);
  }
  const list = createList({
    items: () => flat().map(props.key),
    initialActive: initialActive(),
    loop: true
  });
  /** Reset the active entry to the first item (or none when noInitialSelection). */
  const reset = () => {
    if (props.noInitialSelection) {
      list.setActive("");
      return;
    }
    const all = flat();
    if (all.length === 0) return;
    list.setActive(props.key(all[0]));
  };
  /**
   * Keyboard handler: Enter selects the active item; Ctrl+N/P map to down/up;
   * other keys feed list navigation (skipping text-editing modifier combos).
   * @param {KeyboardEvent} event - The keydown event.
   */
  const onKeyDown = event => {
    if (event.key === "Enter" && !event.isComposing) {
      event.preventDefault();
      const selectedIndex = flat().findIndex(x => props.key(x) === list.active());
      const selected = flat()[selectedIndex];
      if (selected) props.onSelect?.(selected, selectedIndex);
    } else if (event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
      if (event.key === "n" || event.key === "p") {
        event.preventDefault();
        const navEvent = new KeyboardEvent("keydown", {
          key: event.key === "n" ? "ArrowDown" : "ArrowUp",
          bubbles: true
        });
        list.onKeyDown(navEvent);
      }
    } else {
      // Skip list navigation for text editing shortcuts (e.g., Option+Arrow, Option+Backspace on macOS)
      if (event.altKey || event.metaKey) return;
      list.onKeyDown(event);
    }
  };
  createEffect(on(grouped, () => {
    reset();
  }));
  /**
   * Update the active filter string (re-triggers the grouped resource).
   * @param {string} value - The new filter value.
   */
  const onInput = value => {
    setStore("filter", value);
  };
  return {
    grouped,
    filter: () => store.filter,
    flat,
    reset,
    refetch,
    clear: () => setStore("filter", ""),
    onKeyDown,
    onInput,
    active: list.active,
    setActive: list.setActive
  };
}

/**
 * Keep a scroll container pinned to the bottom while content streams in, while
 * respecting deliberate user scroll-up (which pauses auto-follow until the user
 * returns to the bottom). Distinguishes self-initiated scrolls from user scrolls
 * and manages CSS overflow-anchor.
 * @param {Object} options - `working` (accessor: content is streaming),
 *   `bottomThreshold`, `overflowAnchor` ("dynamic"/"none"/"auto"), and
 *   `onUserInteracted` callback.
 * @returns {Object} `{ scrollRef, contentRef, handleScroll, handleInteraction,
 *   pause, resume, scrollToBottom, forceScrollToBottom, userScrolled }`.
 */
export function createAutoScroll(options) {
  let settling = false;
  let settleTimer;
  let autoTimer;
  let auto;
  const threshold = () => options.bottomThreshold ?? 10;
  const [store, setStore] = createStore({
    contentRef: undefined,
    scrollRef: undefined,
    userScrolled: false
  });
  /**
   * Whether auto-follow is currently active (content streaming or settling).
   * @returns {boolean} True when following the bottom.
   */
  const active = () => options.working() || settling;
  /**
   * Pixels between the current scroll position and the bottom.
   * @param {HTMLElement} el - The scroll container.
   * @returns {number} The distance from the bottom.
   */
  const distanceFromBottom = el => {
    return el.scrollHeight - el.clientHeight - el.scrollTop;
  };
  /**
   * Whether the container has any overflow to scroll.
   * @param {HTMLElement} el - The scroll container.
   * @returns {boolean} True when scrollable.
   */
  const canScroll = el => {
    return el.scrollHeight - el.clientHeight > 1;
  };

  // Browsers can dispatch scroll events asynchronously. If new content arrives
  // between us calling `scrollTo()` and the subsequent `scroll` event firing,
  // the handler can see a non-zero `distanceFromBottom` and incorrectly assume
  // the user scrolled.
  /**
   * Record the position/time of a self-initiated scroll-to-bottom so the
   * subsequent (possibly async) scroll event is not mistaken for a user scroll.
   * @param {HTMLElement} el - The scroll container.
   */
  const markAuto = el => {
    auto = {
      top: Math.max(0, el.scrollHeight - el.clientHeight),
      time: Date.now()
    };
    if (autoTimer) clearTimeout(autoTimer);
    autoTimer = setTimeout(() => {
      auto = undefined;
      autoTimer = undefined;
    }, 1500);
  };
  /**
   * Whether the container's current position matches a recently marked
   * self-initiated scroll (so the scroll event can be ignored).
   * @param {HTMLElement} el - The scroll container.
   * @returns {boolean} True when the position is attributable to our own scroll.
   */
  const isAuto = el => {
    const a = auto;
    if (!a) return false;
    if (Date.now() - a.time > 1500) {
      auto = undefined;
      return false;
    }
    return Math.abs(el.scrollTop - a.top) < 2;
  };
  /**
   * Scroll the container to the bottom immediately, marking it as self-initiated.
   * @param {string} behavior - "smooth" or any other value for an instant jump.
   */
  const scrollToBottomNow = behavior => {
    const el = store.scrollRef;
    if (!el) return;
    markAuto(el);
    if (behavior === "smooth") {
      el.scrollTo({
        top: el.scrollHeight,
        behavior
      });
      return;
    }

    // `scrollTop` assignment bypasses any CSS `scroll-behavior: smooth`.
    el.scrollTop = el.scrollHeight;
  };
  /**
   * Scroll to the bottom when appropriate. Without `force`, only follows when
   * active and the user has not scrolled away; `force` overrides both and clears
   * the user-scrolled flag.
   * @param {boolean} force - Force an immediate scroll regardless of state.
   */
  const scrollToBottom = force => {
    if (!force && !active()) return;
    if (force && store.userScrolled) setStore("userScrolled", false);
    const el = store.scrollRef;
    if (!el) return;
    if (!force && store.userScrolled) return;
    const distance = distanceFromBottom(el);
    if (distance < 2) {
      markAuto(el);
      return;
    }

    // For auto-following content we prefer immediate updates to avoid
    // visible "catch up" animations while content is still settling.
    scrollToBottomNow("auto");
  };
  /**
   * Pause auto-follow because the user deliberately scrolled away (marks
   * userScrolled and notifies via onUserInteracted).
   */
  const stop = () => {
    const el = store.scrollRef;
    if (!el) return;
    if (!canScroll(el)) {
      if (store.userScrolled) setStore("userScrolled", false);
      return;
    }
    if (store.userScrolled) return;
    setStore("userScrolled", true);
    options.onUserInteracted?.();
  };
  /**
   * Wheel handler: upward wheel outside a nested scrollable region pauses
   * auto-follow.
   * @param {WheelEvent} e - The wheel event.
   */
  const handleWheel = e => {
    if (e.deltaY >= 0) return;
    // If the user is scrolling within a nested scrollable region (tool output,
    // code block, etc), don't treat it as leaving the "follow bottom" mode.
    // Those regions opt in via `data-scrollable`.
    const el = store.scrollRef;
    const target = e.target instanceof Element ? e.target : undefined;
    const nested = target?.closest("[data-scrollable]");
    if (el && nested && nested !== el) return;
    stop();
  };
  /**
   * Scroll handler: re-enable following when back near the bottom, ignore our
   * own programmatic scrolls, otherwise treat as a user scroll-away.
   */
  const handleScroll = () => {
    const el = store.scrollRef;
    if (!el) return;
    if (!canScroll(el)) {
      if (store.userScrolled) setStore("userScrolled", false);
      return;
    }
    if (distanceFromBottom(el) < threshold()) {
      if (store.userScrolled) setStore("userScrolled", false);
      return;
    }

    // Ignore scroll events triggered by our own scrollToBottom calls.
    if (!store.userScrolled && isAuto(el)) {
      scrollToBottom(false);
      return;
    }
    stop();
  };
  /**
   * Interaction handler: pause auto-follow when the user has an active text
   * selection (so streaming content does not yank it away).
   */
  const handleInteraction = () => {
    if (!active()) return;
    const selection = window.getSelection();
    if (selection && selection.toString().length > 0) {
      stop();
    }
  };
  /**
   * Apply the configured overflow-anchor mode to the scroll container ("dynamic"
   * toggles based on whether the user scrolled away).
   * @param {HTMLElement} el - The scroll container.
   */
  const updateOverflowAnchor = el => {
    const mode = options.overflowAnchor ?? "dynamic";
    if (mode === "none") {
      el.style.overflowAnchor = "none";
      return;
    }
    if (mode === "auto") {
      el.style.overflowAnchor = "auto";
      return;
    }
    el.style.overflowAnchor = store.userScrolled ? "auto" : "none";
  };
  createResizeObserver(() => store.contentRef, () => {
    const el = store.scrollRef;
    if (el && !canScroll(el)) {
      if (store.userScrolled) setStore("userScrolled", false);
      return;
    }
    if (!active()) return;
    if (store.userScrolled) return;
    // ResizeObserver fires after layout, before paint.
    // Keep the bottom locked in the same frame to avoid visible
    // "jump up then catch up" artifacts while streaming content.
    scrollToBottom(false);
  });
  createEffect(on(options.working, working => {
    settling = false;
    if (settleTimer) clearTimeout(settleTimer);
    settleTimer = undefined;
    if (working) {
      if (!store.userScrolled) scrollToBottom(true);
      return;
    }
    settling = true;
    settleTimer = setTimeout(() => {
      settling = false;
    }, 300);
  }));
  createEffect(() => {
    // Track `userScrolled` even before `scrollRef` is attached, so we can
    // update overflow anchoring once the element exists.
    store.userScrolled;
    const el = store.scrollRef;
    if (!el) return;
    updateOverflowAnchor(el);
  });
  createEventListener(() => store.scrollRef, "wheel", handleWheel, {
    passive: true
  });
  onCleanup(() => {
    if (settleTimer) clearTimeout(settleTimer);
    if (autoTimer) clearTimeout(autoTimer);
  });
  return {
    scrollRef: el => setStore("scrollRef", el),
    contentRef: el => setStore("contentRef", el),
    handleScroll,
    handleInteraction,
    pause: stop,
    resume: () => {
      if (store.userScrolled) setStore("userScrolled", false);
      scrollToBottom(true);
    },
    scrollToBottom: () => scrollToBottom(false),
    forceScrollToBottom: () => scrollToBottom(true),
    userScrolled: () => store.userScrolled
  };
}
