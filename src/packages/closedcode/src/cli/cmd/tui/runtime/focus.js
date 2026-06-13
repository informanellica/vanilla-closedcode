// Focus + key routing for the vanilla TUI runtime (Stage T2 widgets).
//
// createKeyRouter() is a LAYER STACK: the base UI is layer 0; opening a dialog
// pushes a layer that captures all keys, and Escape closes only the TOP layer
// (fixing the desktop bug where a nested menu's Escape also closed its dialog).
// createFocusRing() is the within-layer focus model: Tab/Shift-Tab cycle the
// focusables and route keys to the focused one.
import { createSignal } from "./reactivity.js";

export function createKeyRouter() {
  // layers: { handleKey(name,data)->bool, onEscape?() }
  const [layers, setLayers] = createSignal([]);
  // A global handler consulted BEFORE the top layer, for keys that must work even
  // while a dialog captures input (e.g. Ctrl-C to quit) — otherwise, since the top
  // layer captures everything and grabInput suppresses SIGINT, the dialog would
  // trap the user with no exit but Escape.
  let global = null;
  function setGlobal(handler) { global = handler; }
  function pushLayer(layer) {
    setLayers(ls => [...ls, layer]);
    return () => setLayers(ls => ls.filter(l => l !== layer));
  }
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

// A focus ring over an ordered list of focusables. `widgets` is an accessor (so
// it can change reactively) returning items with an optional handleKey(name,data).
export function createFocusRing(widgets, opts = {}) {
  const get = typeof widgets === "function" ? widgets : () => widgets;
  const [index, setIndex] = createSignal(opts.initialIndex ?? 0);
  const len = () => get().length;
  const next = () => setIndex(i => (len() === 0 ? 0 : (i + 1) % len()));
  const prev = () => setIndex(i => (len() === 0 ? 0 : (i - 1 + len()) % len()));
  function handleKey(name, data) {
    if (name === "TAB") { (data && data.shift ? prev : next)(); return true; }
    const w = get()[index()];
    return w && w.handleKey ? w.handleKey(name, data) : false;
  }
  return { index, setIndex, next, prev, handleKey, isFocused: i => index() === i };
}
