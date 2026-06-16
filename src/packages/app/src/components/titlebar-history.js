/** @file Pure navigation-history helpers backing the titlebar back/forward buttons (stack + index + last action). */

/** Maximum number of entries kept in the titlebar navigation stack. */
export const MAX_TITLEBAR_HISTORY = 100;
/**
 * Reconcile the history with the current route, seeding the stack, ignoring no-op
 * repeats and clearing the back/forward action flag, otherwise pushing a new entry.
 * @param {Object} state - Current history state ({stack, index, action}).
 * @param {string} current - The current route path.
 * @param {number} max - Maximum stack length to retain.
 * @returns {Object} The next history state (or the same object when unchanged).
 */
export function applyPath(state, current, max = MAX_TITLEBAR_HISTORY) {
  if (!state.stack.length) {
    const stack = current === "/" ? ["/"] : ["/", current];
    return {
      stack,
      index: stack.length - 1,
      action: undefined
    };
  }
  const active = state.stack[state.index];
  if (current === active) {
    if (!state.action) return state;
    return {
      ...state,
      action: undefined
    };
  }
  if (state.action) return {
    ...state,
    action: undefined
  };
  return pushPath(state, current, max);
}
/**
 * Push a new path onto the stack, truncating any forward entries past the current
 * index and trimming the oldest entries when the stack exceeds the max.
 * @param {Object} state - Current history state ({stack, index, action}).
 * @param {string} path - The path to append.
 * @param {number} max - Maximum stack length to retain.
 * @returns {Object} The next history state.
 */
export function pushPath(state, path, max = MAX_TITLEBAR_HISTORY) {
  const stack = state.stack.slice(0, state.index + 1).concat(path);
  const next = trimHistory(stack, stack.length - 1, max);
  return {
    ...state,
    ...next,
    action: undefined
  };
}
/**
 * Drop the oldest stack entries so the stack length stays within the max, adjusting
 * the active index to compensate for removed leading entries.
 * @param {Array} stack - The history stack.
 * @param {number} index - The active index into the stack.
 * @param {number} max - Maximum stack length to retain.
 * @returns {Object} An object with the trimmed {stack, index}.
 */
export function trimHistory(stack, index, max = MAX_TITLEBAR_HISTORY) {
  if (stack.length <= max) return {
    stack,
    index
  };
  const cut = stack.length - max;
  return {
    stack: stack.slice(cut),
    index: Math.max(0, index - cut)
  };
}
/**
 * Compute the state and target path for navigating back one entry.
 * @param {Object} state - Current history state ({stack, index, action}).
 * @returns {Object} An object with the next {state} (action "back") and {to} path, or undefined when already at the start.
 */
export function backPath(state) {
  if (state.index <= 0) return;
  const index = state.index - 1;
  const to = state.stack[index];
  if (!to) return;
  return {
    state: {
      ...state,
      index,
      action: "back"
    },
    to
  };
}
/**
 * Compute the state and target path for navigating forward one entry.
 * @param {Object} state - Current history state ({stack, index, action}).
 * @returns {Object} An object with the next {state} (action "forward") and {to} path, or undefined when already at the end.
 */
export function forwardPath(state) {
  if (state.index >= state.stack.length - 1) return;
  const index = state.index + 1;
  const to = state.stack[index];
  if (!to) return;
  return {
    state: {
      ...state,
      index,
      action: "forward"
    },
    to
  };
}