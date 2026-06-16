/** @file Hook providing a fuzzy-filterable, groupable, keyboard-navigable list with active-item selection. */
import fuzzysort from "fuzzysort";
import { entries, flatMap, groupBy, map, pipe } from "remeda";
import { createEffect, createMemo, createResource, on } from "../../../lib/reactivity.js";
import { createStore } from "../../../lib/store.js";
import { createList } from "../../../lib/primitives/solid-list.js";
/**
 * Creates a reactive filtered list: applies fuzzy search over the items, groups and sorts the
 * results, and wires up keyboard navigation (arrows, Ctrl+n/p, Enter to select).
 * @param {Object} props - Configuration.
 * @param {Array|Function} props.items - The source items, or a function of the filter string returning items (possibly a Promise).
 * @param {Array} props.filterKeys - Keys to fuzzy-match against for object items; omit for plain string arrays.
 * @param {Function} props.groupBy - Optional function mapping an item to its group/category key.
 * @param {Function} props.sortBy - Optional comparator for sorting items within a group.
 * @param {Function} props.sortGroupsBy - Optional comparator for sorting the groups.
 * @param {Function} props.key - Function returning a unique string key for an item.
 * @param {*} props.current - Optional currently-selected item used to seed the initial active key.
 * @param {boolean} props.noInitialSelection - When true, no item is active initially.
 * @param {Function} props.onSelect - Callback invoked with (item, index) when an item is chosen via Enter.
 * @returns {Object} List API: grouped/flat accessors, filter accessor, reset, refetch, clear, onKeyDown, onInput, active, and setActive.
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
   * Computes the key of the item that should be active when the list first renders.
   * @returns {string} The initial active key, or "" when there is no initial selection.
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
  const reset = () => {
    if (props.noInitialSelection) {
      list.setActive("");
      return;
    }
    const all = flat();
    if (all.length === 0) return;
    list.setActive(props.key(all[0]));
  };
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