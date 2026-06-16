/** @file Selectable list controller for the vanilla TUI runtime (Stage T2 widgets). */
// Roving focus (Up/Down/Home/End), Enter to select, and typeahead. Items can be
// a static array or an accessor; each item is a string or { label, value }. The
// view scrolls to keep the active row visible. State (active index) is a signal.
import { createSignal } from "./reactivity.js";
import { fit, truncate } from "./text.js";

/**
 * Derive the display label for a list item.
 * @param {*} it - A string item, or an object { label, value } (label falls back to String(value)).
 * @returns {string} The item's display label.
 */
const labelOf = it => (it && typeof it === "object" ? (it.label ?? String(it.value)) : String(it));

/**
 * Create a selectable list controller backed by a reactive active-index signal.
 * @param {Array|Function} items - Items, or an accessor returning them (string or { label, value }).
 * @param {Object} opts - Options: initialIndex (number), onSelect(item, index), now() injectable clock for typeahead timing.
 * @returns {Object} Controller with active, setActive, handleKey, draw, and value().
 */
export function createSelectList(items, opts = {}) {
  const getItems = typeof items === "function" ? items : () => items;
  const [active, setActive] = createSignal(opts.initialIndex ?? 0);
  let typeahead = "";
  let typeaheadAt = 0;
  // Injectable clock (tests pass a stub). Defaults to a real clock so the 800ms
  // typeahead window actually elapses — a constant 0 would keep it open forever,
  // so separate searches would concatenate instead of resetting.
  const now = opts.now ?? (() => Date.now());

  /**
   * Clamp an index into the valid range of the current item count.
   * @param {number} i - Candidate index.
   * @returns {number} The index clamped to [0, count - 1] (or 0 when empty).
   */
  const clamp = i => { const n = getItems().length; return n === 0 ? 0 : Math.max(0, Math.min(i, n - 1)); };

  /**
   * Advance the typeahead buffer with a typed character and move the active row
   * to the next item whose label starts with the accumulated query. The buffer
   * resets after an 800ms idle window so consecutive searches don't concatenate.
   * @param {string} ch - The typed character.
   * @returns {boolean} Always true (the key is consumed as typeahead).
   */
  function typeaheadMatch(ch) {
    const t = now();
    if (t - typeaheadAt > 800) typeahead = "";
    typeaheadAt = t;
    typeahead += ch.toLowerCase();
    const its = getItems();
    const from = active();
    for (let k = 0; k < its.length; k++) {
      const idx = (from + (typeahead.length === 1 ? k + 1 : k)) % its.length;
      if (labelOf(its[idx]).toLowerCase().startsWith(typeahead)) { setActive(idx); return true; }
    }
    return true;
  }

  /**
   * Apply a key: move the active row (Up/Down/Home/End), select it (Enter), or
   * feed a printable character to typeahead.
   * @param {string} name - Key name or character.
   * @param {Object} data - terminal-kit key data; data.isCharacter marks printable input.
   * @returns {boolean} True if the key was handled.
   */
  function handleKey(name, data) {
    const n = getItems().length;
    switch (name) {
      case "UP": setActive(a => clamp(a - 1)); return true;
      case "DOWN": setActive(a => clamp(a + 1)); return true;
      case "HOME": setActive(0); return true;
      case "END": setActive(clamp(n - 1)); return true;
      case "ENTER": { const it = getItems()[active()]; if (it !== undefined) opts.onSelect?.(it, active()); return true; }
      default:
        if (data && data.isCharacter && name.length === 1) return typeaheadMatch(name);
        return false;
    }
  }

  /**
   * Compute the first visible item index so the active row stays within a
   * viewport `height` rows tall.
   * @param {number} height - Viewport height in rows.
   * @returns {number} The index of the first item to render.
   */
  function windowStart(height) {
    const a = active();
    if (a < height) return 0;
    return a - height + 1;
  }

  /**
   * Render the visible window of items into a Region, marking the active row.
   * @param {Object} region - Target Region; its height bounds the visible rows.
   * @param {Object} opts - Draw options: attr (inactive row attributes), activeAttr (active row attributes, default inverse), marker (prefix for the active row, default "› ").
   * @returns {void}
   */
  function draw(region, { attr, activeAttr, marker = "› " } = {}) {
    const its = getItems();
    const h = region.height;
    const start = windowStart(h);
    const pad = " ".repeat(marker.length);
    for (let i = 0; i < h && start + i < its.length; i++) {
      const idx = start + i;
      const isActive = idx === active();
      const label = (isActive ? marker : pad) + labelOf(its[idx]);
      region.line(i, label, isActive ? (activeAttr ?? { inverse: true }) : attr);
    }
  }

  return { active, setActive, handleKey, draw, value: () => getItems()[active()] };
}
