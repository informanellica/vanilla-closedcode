import {
  $TRACK,
  createComponent,
  createMemo,
  createRenderEffect,
  createRoot,
  createSignal,
  onCleanup,
  untrack
} from "solid-js";
import { AnimatedCountLabel } from "./tool-count-label.js";

// Normalize a component result into appendable DOM nodes (strings become text
// nodes, null/boolean are dropped) — mirrors the settings-general convention.
function toNodes(value) {
  const list = Array.isArray(value) ? value : [value];
  return list
    .filter(v => v != null && typeof v !== "boolean")
    .map(v => (v instanceof Node ? v : document.createTextNode(String(v))));
}

export function AnimatedCountList(props) {
  const visible = createMemo(() => props.items.filter(item => item.count > 0));
  const fallback = createMemo(() => props.fallback ?? "");
  const showEmpty = createMemo(() => visible().length === 0 && fallback().length > 0);

  const root = document.createElement("span");
  root.setAttribute("data-component", "tool-count-summary");

  const emptyEl = document.createElement("span");
  emptyEl.setAttribute("data-slot", "tool-count-summary-empty");
  const emptyInner = document.createElement("span");
  emptyInner.setAttribute("data-slot", "tool-count-summary-empty-inner");
  emptyEl.appendChild(emptyInner);
  root.appendChild(emptyEl);

  createRenderEffect(() => {
    emptyInner.textContent = fallback();
  });
  createRenderEffect(() => {
    emptyEl.setAttribute("data-active", showEmpty() ? "true" : "false");
  });
  // Mirror the compiled className(): null/undefined removes the attribute.
  createRenderEffect(() => {
    const cls = props.class;
    if (cls == null) root.removeAttribute("class");
    else root.className = cls;
  });

  // <Index> replacement: rows are keyed by index. Each row owns its
  // [prefix, item] node pair inside its own reactive root, and reads the item
  // through a per-index signal that only fires when the value at that index
  // changes (solid's indexArray semantics) — so unchanged rows keep their
  // nodes and the running count animations.
  const rows = [];
  onCleanup(() => {
    for (const row of rows) row.dispose();
    rows.length = 0;
  });

  function buildRow(index, initial) {
    return createRoot(dispose => {
      const [item, setItem] = createSignal(initial);
      const active = createMemo(() => item().count > 0);
      const hasPrev = createMemo(() => {
        for (let i = index - 1; i >= 0; i--) {
          if (props.items[i].count > 0) return true;
        }
        return false;
      });

      const prefixEl = document.createElement("span");
      prefixEl.setAttribute("data-slot", "tool-count-summary-prefix");
      prefixEl.textContent = ",";

      const itemEl = document.createElement("span");
      itemEl.setAttribute("data-slot", "tool-count-summary-item");
      const itemInner = document.createElement("span");
      itemInner.setAttribute("data-slot", "tool-count-summary-item-inner");
      itemEl.appendChild(itemInner);

      const label = createComponent(AnimatedCountLabel, {
        get one() {
          return item().one;
        },
        get other() {
          return item().other;
        },
        get count() {
          return Math.max(0, Math.round(item().count));
        }
      });
      // AnimatedCountLabel returns a real DOM node today. If a component ever
      // returns a function (fragment/Show-style), re-evaluate it inside a
      // render effect — calling it once and pasting the result would freeze
      // the UI at that instant (the "function children" trap). The effect is
      // owned by this row's createRoot, so it is disposed with the row.
      if (typeof label === "function") {
        createRenderEffect(() => itemInner.replaceChildren(...toNodes(label())));
      } else {
        itemInner.replaceChildren(...toNodes(label));
      }

      createRenderEffect(() => {
        prefixEl.setAttribute("data-active", active() && hasPrev() ? "true" : "false");
      });
      createRenderEffect(() => {
        itemEl.setAttribute("data-active", active() ? "true" : "false");
      });

      return { prefixEl, itemEl, setItem, dispose };
    });
  }

  // Row manager runs in the pure phase (memo, like Index's own memo) so that
  // on shrink the stale rows are disposed before their computations — which
  // read props.items[i] in hasPrev — could re-run against the shorter array.
  const rowNodes = createMemo(() => {
    const items = props.items || [];
    const len = items.length;
    items[$TRACK]; // top-level store tracking, same as solid's indexArray
    return untrack(() => {
      while (rows.length > len) rows.pop().dispose();
      // The signal setter's default === equality matches indexArray's
      // items[i] !== newItems[i] guard.
      for (let i = 0; i < rows.length; i++) rows[i].setItem(() => items[i]);
      for (let i = rows.length; i < len; i++) rows.push(buildRow(i, items[i]));
      return rows.flatMap(row => [row.prefixEl, row.itemEl]);
    });
  });

  // Attach/detach only the changed tail. Surviving nodes are never moved or
  // re-inserted, so their CSS transitions are not restarted.
  createRenderEffect(() => {
    const nodes = rowNodes();
    const keep = new Set(nodes);
    let child = emptyEl.nextSibling;
    while (child) {
      const next = child.nextSibling;
      if (!keep.has(child)) root.removeChild(child);
      child = next;
    }
    for (const node of nodes) {
      if (node.parentNode !== root) root.appendChild(node);
    }
  });

  return root;
}
