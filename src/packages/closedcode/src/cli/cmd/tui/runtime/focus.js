/** @file Focus + key routing for the vanilla TUI runtime (Stage T2 widgets). */
//
// createKeyRouter() is a LAYER STACK: the base UI is layer 0; opening a dialog
// pushes a layer that captures all keys, and Escape closes only the TOP layer
// (fixing the desktop bug where a nested menu's Escape also closed its dialog).
// createFocusRing() is the within-layer focus model: Tab/Shift-Tab cycle the
// focusables and route keys to the focused one.
import { createSignal } from "./reactivity.js";

/**
 * Create a layered key router. Layers form a stack; the top layer receives keys
 * (capturing all input below it), and Escape on the top layer invokes its
 * onEscape so closing is scoped to that layer only. A global handler is
 * consulted before any layer for keys that must always work (e.g. Ctrl-C).
 * @returns {Object} Router with pushLayer, dispatch, setGlobal, and depth.
 */
export function createKeyRouter() {
  // layers: { handleKey(name,data)->bool, onEscape?() }
  const [layers, setLayers] = createSignal([]);
  // A global handler consulted BEFORE the top layer, for keys that must work even
  // while a dialog captures input (e.g. Ctrl-C to quit) — otherwise, since the top
  // layer captures everything and grabInput suppresses SIGINT, the dialog would
  // trap the user with no exit but Escape.
  let global = null;
  /**
   * Set (or clear) the global handler consulted before the top layer.
   * @param {Function} handler - Handler h(name, data) returning true if it consumed the key, or null to clear.
   * @returns {void}
   */
  function setGlobal(handler) { global = handler; }
  /**
   * Push a layer onto the stack, making it the new top (capturing) layer.
   * @param {Object} layer - Layer with handleKey(name, data) and optional onEscape().
   * @returns {Function} Disposer that removes this layer from the stack.
   */
  function pushLayer(layer) {
    setLayers(ls => [...ls, layer]);
    return () => setLayers(ls => ls.filter(l => l !== layer));
  }
  /**
   * Route a key to the global handler, then the top layer (Escape -> onEscape).
   * @param {string} name - Key name (e.g. "ENTER", "ESCAPE", a character).
   * @param {Object} data - terminal-kit key data (modifier flags, isCharacter, etc.).
   * @returns {boolean} True if the key was consumed.
   */
  function dispatch(name, data) {
    if (global && global(name, data)) return true;
    const ls = layers();
    const top = ls[ls.length - 1];
    if (!top) return false;
    if (name === "ESCAPE" && top.onEscape) { top.onEscape(); return true; }
    return top.handleKey?.(name, data) ?? false;
  }
  return { pushLayer, dispatch, setGlobal, depth: () => layers().length };
}

/**
 * Create a focus ring over an ordered list of focusables. Tab/Shift-Tab cycle
 * the index (wrapping); other keys are routed to the focused widget's handleKey.
 * @param {Array|Function} widgets - Focusables, or an accessor returning them (each may have handleKey(name, data)).
 * @param {Object} opts - Options; opts.initialIndex sets the starting focus index (default 0).
 * @returns {Object} Ring with index, setIndex, next, prev, handleKey, and isFocused(i).
 */
export function createFocusRing(widgets, opts = {}) {
  const get = typeof widgets === "function" ? widgets : () => widgets;
  const [index, setIndex] = createSignal(opts.initialIndex ?? 0);
  const len = () => get().length;
  const next = () => setIndex(i => (len() === 0 ? 0 : (i + 1) % len()));
  const prev = () => setIndex(i => (len() === 0 ? 0 : (i - 1 + len()) % len()));
  function handleKey(name, data) {
    // terminal-kit emits Shift-Tab as a DISTINCT key name "SHIFT_TAB" (not TAB
    // with data.shift — it only sets shift on mouse events). Handle both so the
    // back-cycle works against the real key source; keep the data.shift path for
    // callers/tests that synthesize it.
    if (name === "TAB" || name === "SHIFT_TAB") { (name === "SHIFT_TAB" || (data && data.shift) ? prev : next)(); return true; }
    const w = get()[index()];
    return w && w.handleKey ? w.handleKey(name, data) : false;
  }
  return { index, setIndex, next, prev, handleKey, isFocused: i => index() === i };
}
