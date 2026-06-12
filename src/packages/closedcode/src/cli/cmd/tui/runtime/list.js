// Selectable list controller for the vanilla TUI runtime (Stage T2 widgets).
// Roving focus (Up/Down/Home/End), Enter to select, and typeahead. Items can be
// a static array or an accessor; each item is a string or { label, value }. The
// view scrolls to keep the active row visible. State (active index) is a signal.
import { createSignal } from "./reactivity.js";
import { fit, truncate } from "./text.js";

const labelOf = it => (it && typeof it === "object" ? (it.label ?? String(it.value)) : String(it));

export function createSelectList(items, opts = {}) {
  const getItems = typeof items === "function" ? items : () => items;
  const [active, setActive] = createSignal(opts.initialIndex ?? 0);
  let typeahead = "";
  let typeaheadAt = 0;
  const now = () => (opts.now ? opts.now() : 0); // injectable clock (tests pass a stub)

  const clamp = i => { const n = getItems().length; return n === 0 ? 0 : Math.max(0, Math.min(i, n - 1)); };

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

  // scroll window so `active` is visible within `height` rows
  function windowStart(height) {
    const a = active();
    if (a < height) return 0;
    return a - height + 1;
  }

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
