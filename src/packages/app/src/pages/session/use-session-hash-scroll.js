/** @file Session hook syncing the URL hash with scroll position and the active/pending message. */
import { useLocation, useNavigate } from "../../lib/router/index.js";
import { createEffect, createMemo, onCleanup, onMount } from "../../lib/reactivity.js";
import { messageIdFromHash } from "./message-id-from-hash.js";
/**
 * Session hook that keeps the URL hash and scroll position in sync with messages,
 * scrolling to the message referenced by the hash (or a pending message) and
 * updating the hash as the active message changes.
 * @param {Object} input - Accessors and callbacks bridging the session view to the router/scroller.
 * @param {Function} input.visibleUserMessages - Returns the array of currently visible user messages.
 * @param {Function} input.sessionID - Returns the current session id.
 * @param {Function} input.sessionKey - Returns a key identifying the current session/view.
 * @param {Function} input.messagesReady - Returns whether messages are loaded and ready.
 * @param {Function} input.currentMessageId - Returns the currently active message id.
 * @param {Function} input.setActiveMessage - Sets the active message.
 * @param {Function} input.anchor - Returns the DOM anchor id for a message id.
 * @param {Function} input.scroller - Returns the scroll container element.
 * @param {Function} input.turnStart - Returns the current turn-start index.
 * @param {Function} input.setTurnStart - Sets the turn-start index.
 * @param {Function} input.pendingMessage - Returns a pending target message id, if any.
 * @param {Function} input.setPendingMessage - Sets or clears the pending target message id.
 * @param {Function} input.consumePendingMessage - Consumes and returns a stored pending message id for a key.
 * @param {Object} input.autoScroll - Auto-scroll controller with pause and forceScrollToBottom.
 * @param {Function} input.scheduleScrollState - Schedules a scroll-state update for an element.
 * @param {Function} input.historyMore - Returns whether more history can be loaded.
 * @param {Function} input.historyLoading - Returns whether history is currently loading.
 * @param {Function} input.loadMore - Loads more history for a session id.
 * @returns {Object} Controls with clearMessageHash, scrollToMessage and applyHash.
 */
export const useSessionHashScroll = input => {
  const visibleUserMessages = createMemo(() => input.visibleUserMessages());
  const messageById = createMemo(() => new Map(visibleUserMessages().map(m => [m.id, m])));
  const messageIndex = createMemo(() => new Map(visibleUserMessages().map((m, i) => [m.id, i])));
  let pendingKey = "";
  let clearing = false;
  const location = useLocation();
  const navigate = useNavigate();
  const frames = new Set();
  /**
   * Schedule a callback on the next animation frame and track it for cancellation.
   * @param {Function} fn - The callback to run on the next frame.
   * @returns {void}
   */
  const queue = fn => {
    const id = requestAnimationFrame(() => {
      frames.delete(id);
      fn();
    });
    frames.add(id);
  };
  /**
   * Cancel all pending animation-frame callbacks scheduled via queue.
   * @returns {void}
   */
  const cancel = () => {
    for (const id of frames) cancelAnimationFrame(id);
    frames.clear();
  };
  /**
   * Clear any message hash from the URL and reset pending-message state.
   * @returns {void}
   */
  const clearMessageHash = () => {
    cancel();
    input.consumePendingMessage(input.sessionKey());
    if (input.pendingMessage()) input.setPendingMessage(undefined);
    if (!location.hash) return;
    clearing = true;
    navigate(location.pathname + location.search, {
      replace: true
    });
  };
  /**
   * Replace the URL hash with the anchor for a message id, without adding history.
   * @param {string} id - The message id whose anchor becomes the hash.
   * @returns {void}
   */
  const updateHash = id => {
    const hash = `#${input.anchor(id)}`;
    if (location.hash === hash) return;
    clearing = false;
    navigate(location.pathname + location.search + hash, {
      replace: true
    });
  };
  /**
   * Scroll the session container so the given element is at the top, accounting for the sticky title.
   * @param {HTMLElement} el - The target element to scroll into view.
   * @param {string} behavior - The scroll behavior ("smooth" or "auto").
   * @returns {boolean} True if scrolling was performed; false when no scroller exists.
   */
  const scrollToElement = (el, behavior) => {
    const root = input.scroller();
    if (!root) return false;
    const a = el.getBoundingClientRect();
    const b = root.getBoundingClientRect();
    const sticky = root.querySelector("[data-session-title]");
    const inset = sticky instanceof HTMLElement ? sticky.offsetHeight : 0;
    const top = Math.max(0, a.top - b.top + root.scrollTop - inset);
    root.scrollTo({
      top,
      behavior
    });
    return true;
  };
  /**
   * Try to scroll to a message's anchor element, retrying across frames until it mounts.
   * @param {string} id - The message id to scroll to.
   * @param {string} behavior - The scroll behavior ("smooth" or "auto").
   * @param {number} left - Remaining retry attempts (defaults to 4).
   * @returns {boolean} True if the element was found and scrolled this call.
   */
  const seek = (id, behavior, left = 4) => {
    const el = document.getElementById(input.anchor(id));
    if (el) return scrollToElement(el, behavior);
    if (left <= 0) return false;
    queue(() => {
      seek(id, behavior, left - 1);
    });
    return false;
  };
  /**
   * Make a message active, ensure its turn is loaded, scroll to it and update the hash.
   * @param {Object} message - The message to scroll to (must have an id).
   * @param {string} behavior - The scroll behavior, defaulting to "smooth".
   * @returns {void}
   */
  const scrollToMessage = (message, behavior = "smooth") => {
    cancel();
    if (input.currentMessageId() !== message.id) input.setActiveMessage(message);
    const index = messageIndex().get(message.id) ?? -1;
    if (index !== -1 && index < input.turnStart()) {
      input.setTurnStart(index);
      queue(() => {
        seek(message.id, behavior);
      });
      updateHash(message.id);
      return;
    }
    if (seek(message.id, behavior)) {
      updateHash(message.id);
      return;
    }
    updateHash(message.id);
  };
  /**
   * Apply the current URL hash: scroll to its message or element, or scroll to bottom when absent.
   * @param {string} behavior - The scroll behavior ("smooth" or "auto").
   * @returns {void}
   */
  const applyHash = behavior => {
    const hash = location.hash.slice(1);
    if (!hash) {
      input.autoScroll.forceScrollToBottom();
      const el = input.scroller();
      if (el) input.scheduleScrollState(el);
      return;
    }
    const messageId = messageIdFromHash(hash);
    if (messageId) {
      input.autoScroll.pause();
      const msg = messageById().get(messageId);
      if (msg) {
        scrollToMessage(msg, behavior);
        return;
      }
      return;
    }
    const target = document.getElementById(hash);
    if (target) {
      input.autoScroll.pause();
      scrollToElement(target, behavior);
      return;
    }
    input.autoScroll.forceScrollToBottom();
    const el = input.scroller();
    if (el) input.scheduleScrollState(el);
  };
  createEffect(() => {
    const hash = location.hash;
    if (!hash) clearing = false;
    if (!input.sessionID() || !input.messagesReady()) return;
    cancel();
    queue(() => applyHash("auto"));
  });
  createEffect(() => {
    if (!input.sessionID() || !input.messagesReady()) return;
    visibleUserMessages();
    input.turnStart();
    let targetId = input.pendingMessage();
    if (!targetId) {
      const key = input.sessionKey();
      if (pendingKey !== key) {
        pendingKey = key;
        const next = input.consumePendingMessage(key);
        if (next) {
          input.setPendingMessage(next);
          targetId = next;
        }
      }
    }
    if (!targetId && !clearing) targetId = messageIdFromHash(location.hash);
    if (!targetId) return;
    const pending = input.pendingMessage() === targetId;
    const msg = messageById().get(targetId);
    if (!msg) return;
    if (pending) input.setPendingMessage(undefined);
    if (input.currentMessageId() === targetId && !pending) return;
    input.autoScroll.pause();
    cancel();
    queue(() => scrollToMessage(msg, "auto"));
  });
  createEffect(() => {
    const sessionID = input.sessionID();
    if (!sessionID || !input.messagesReady()) return;
    visibleUserMessages();
    let targetId = input.pendingMessage();
    if (!targetId && !clearing) targetId = messageIdFromHash(location.hash);
    if (!targetId) return;
    if (messageById().has(targetId)) return;
    if (!input.historyMore() || input.historyLoading()) return;
    void input.loadMore(sessionID);
  });
  onMount(() => {
    if (typeof window !== "undefined" && "scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }
  });
  onCleanup(cancel);
  return {
    clearMessageHash,
    scrollToMessage,
    applyHash
  };
};