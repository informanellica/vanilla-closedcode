/** @file Hover-intent ("aim") detector that delays submenu activation while the pointer travels toward a target edge. */
/**
 * Create a pointer "aim" tracker that decides when to activate a hovered item,
 * delaying activation while the cursor appears to be heading toward the active
 * element's edge (a submenu-style safe triangle).
 * @param {Object} props - Configuration and callbacks for the aim tracker.
 * @param {Function} props.enabled - Returns whether aim tracking is currently enabled.
 * @param {Function} props.active - Returns the id of the currently active item, if any.
 * @param {Function} props.el - Returns the reference element used as the aim target.
 * @param {Function} props.onActivate - Called with an id when an item should be activated.
 * @param {number} props.delay - Optional activation delay in ms while aiming (default 250).
 * @param {number} props.max - Optional number of recent pointer locations to retain (default 4).
 * @param {number} props.tolerance - Optional vertical tolerance for the safe triangle in px (default 80).
 * @param {number} props.edge - Optional distance from the right edge that forces a delay in px (default 18).
 * @returns {Object} An aim controller with move, enter, leave, activate, request, cancel and reset methods.
 */
export function createAim(props) {
  const state = {
    locs: [],
    timer: undefined,
    pending: undefined,
    over: undefined,
    last: undefined
  };
  const delay = props.delay ?? 250;
  const max = props.max ?? 4;
  const tolerance = props.tolerance ?? 80;
  const edge = props.edge ?? 18;
  /**
   * Clear any pending activation timer and pending id.
   * @returns {void}
   */
  const cancel = () => {
    if (state.timer !== undefined) clearTimeout(state.timer);
    state.timer = undefined;
    state.pending = undefined;
  };
  /**
   * Cancel pending work and clear all tracked state (over item, history, last location).
   * @returns {void}
   */
  const reset = () => {
    cancel();
    state.over = undefined;
    state.last = undefined;
    state.locs.length = 0;
  };
  /**
   * Record the pointer location from a mouse event when it is inside the target element.
   * @param {Object} event - A mouse event exposing clientX and clientY.
   * @returns {void}
   */
  const move = event => {
    if (!props.enabled()) return;
    const el = props.el();
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = event.clientX;
    const y = event.clientY;
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return;
    state.locs.push({
      x,
      y
    });
    if (state.locs.length > max) state.locs.shift();
  };
  /**
   * Compute how long activation should be delayed based on recent pointer motion;
   * returns the delay when the cursor is aiming toward the target's right edge.
   * @returns {number} The delay in ms before activating, or 0 to activate immediately.
   */
  const wait = () => {
    if (!props.enabled()) return 0;
    if (!props.active()) return 0;
    const el = props.el();
    if (!el) return 0;
    if (state.locs.length < 2) return 0;
    const rect = el.getBoundingClientRect();
    const loc = state.locs[state.locs.length - 1];
    if (!loc) return 0;
    const prev = state.locs[0] ?? loc;
    if (prev.x < rect.left || prev.x > rect.right || prev.y < rect.top || prev.y > rect.bottom) return 0;
    if (state.last && loc.x === state.last.x && loc.y === state.last.y) return 0;
    if (rect.right - loc.x <= edge) {
      state.last = loc;
      return delay;
    }
    const upper = {
      x: rect.right,
      y: rect.top - tolerance
    };
    const lower = {
      x: rect.right,
      y: rect.bottom + tolerance
    };
    /**
     * Slope of the line from point a to point b.
     * @param {Object} a - Start point with x and y.
     * @param {Object} b - End point with x and y.
     * @returns {number} The slope (rise over run) between the two points.
     */
    const slope = (a, b) => (b.y - a.y) / (b.x - a.x);
    const decreasing = slope(loc, upper);
    const increasing = slope(loc, lower);
    const prevDecreasing = slope(prev, upper);
    const prevIncreasing = slope(prev, lower);
    if (decreasing < prevDecreasing && increasing > prevIncreasing) {
      state.last = loc;
      return delay;
    }
    state.last = undefined;
    return 0;
  };
  /**
   * Immediately activate an item, cancelling any pending activation first.
   * @param {string} id - The id of the item to activate.
   * @returns {void}
   */
  const activate = id => {
    cancel();
    props.onActivate(id);
  };
  /**
   * Request activation of an item, activating now or scheduling it after the aim delay.
   * @param {string} id - The id of the item to request activation for.
   * @returns {void}
   */
  const request = id => {
    if (!id) return;
    if (props.active() === id) return;
    if (!props.active()) {
      activate(id);
      return;
    }
    const ms = wait();
    if (ms === 0) {
      activate(id);
      return;
    }
    cancel();
    state.pending = id;
    state.timer = window.setTimeout(() => {
      state.timer = undefined;
      if (state.pending !== id) return;
      state.pending = undefined;
      if (!props.enabled()) return;
      if (!props.active()) return;
      if (state.over !== id) return;
      props.onActivate(id);
    }, ms);
  };
  /**
   * Handle the pointer entering an item: mark it as hovered and request activation.
   * @param {string} id - The id of the entered item.
   * @param {Object} event - The mouse event used to record the current pointer location.
   * @returns {void}
   */
  const enter = (id, event) => {
    if (!props.enabled()) return;
    state.over = id;
    move(event);
    request(id);
  };
  /**
   * Handle the pointer leaving an item, clearing hover state and any pending activation for it.
   * @param {string} id - The id of the left item.
   * @returns {void}
   */
  const leave = id => {
    if (state.over === id) state.over = undefined;
    if (state.pending === id) cancel();
  };
  return {
    move,
    enter,
    leave,
    activate,
    request,
    cancel,
    reset
  };
}