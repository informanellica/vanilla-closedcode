/** @file Pure helpers for interpreting wheel/scroll gestures at the timeline's scroll boundary. */

/**
 * Normalizes a wheel event's deltaY into pixels, accounting for line/page delta modes.
 * @param {Object} input - Wheel gesture descriptor with `deltaY`, `deltaMode`, and `rootHeight`.
 * @returns {number} The scroll delta in pixels.
 */
export const normalizeWheelDelta = input => {
  if (input.deltaMode === 1) return input.deltaY * 40;
  if (input.deltaMode === 2) return input.deltaY * input.rootHeight;
  return input.deltaY;
};
/**
 * Decides whether a scroll delta crosses the scrollable element's edge (top or bottom),
 * which marks the start of a boundary scroll gesture.
 * @param {Object} input - Descriptor with `scrollHeight`, `clientHeight`, `scrollTop`, and signed `delta`.
 * @returns {boolean} True when the gesture reaches or exceeds the scroll boundary.
 */
export const shouldMarkBoundaryGesture = input => {
  const max = input.scrollHeight - input.clientHeight;
  if (max <= 1) return true;
  if (!input.delta) return false;
  if (input.delta < 0) return input.scrollTop + input.delta <= 0;
  const remaining = max - input.scrollTop;
  return input.delta > remaining;
};