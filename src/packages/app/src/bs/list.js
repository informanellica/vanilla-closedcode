import { insert as _solidInsert } from "solid-js/web";
import fuzzysort from "fuzzysort";
import { entries, flatMap, groupBy, map, pipe } from "remeda";
import { Icon } from "@/bs/icon.js";
import { IconButton } from "@/bs/icon-button.js";
import { TextField } from "@/bs/text-field.js";

const FALLBACK_MESSAGES = {
  empty: "No results",
  loading: "Loading...",
  emptyPrefix: "No results for ",
  emptySuffix: "",
  clearFilter: "Clear search"
};

function template(html) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html.trim();
  return wrapper.firstElementChild;
}

function appendChildren(parent, children) {
  if (children == null || children === false) return;
  if (Array.isArray(children)) {
    for (const child of children) appendChildren(parent, child);
    return;
  }
  if (children instanceof Node) {
    parent.appendChild(children);
    return;
  }
  if (typeof children === "function") {
    // Reactive child (Solid Show/For/components return accessors): let
    // solid-js/web insert() track it so updates re-render instead of freezing.
    _solidInsert(parent, children);
    return;
  }
  parent.appendChild(document.createTextNode(String(children)));
}

function clearNode(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

function normalizeClassName(value) {
  return String(value || "")
    .split(/\s+/)
    .filter(Boolean);
}

function findByKey(container, key) {
  const nodes = container.querySelectorAll('[data-slot="list-item"][data-key]');
  for (const node of nodes) {
    if (node.getAttribute("data-key") === key) return node;
  }
  return null;
}

function scrollIntoView(container, node, block) {
  const containerRect = container.getBoundingClientRect();
  const nodeRect = node.getBoundingClientRect();
  const top = nodeRect.top - containerRect.top + container.scrollTop;
  const bottom = top + nodeRect.height;
  const viewTop = container.scrollTop;
  const viewBottom = viewTop + container.clientHeight;
  const target =
    block === "center"
      ? top - container.clientHeight / 2 + nodeRect.height / 2
      : top < viewTop
        ? top
        : bottom > viewBottom
          ? bottom - container.clientHeight
          : viewTop;
  const max = Math.max(0, container.scrollHeight - container.clientHeight);
  container.scrollTop = Math.max(0, Math.min(target, max));
}

function resolveChildren(children, value, index) {
  if (typeof children === "function") return children(value, index);
  return children;
}

function createFilteredListState(props) {
  const state = {
    filter: "",
    grouped: [],
    flat: [],
    loading: false,
    active: "",
    mouseActive: false
  };
  let requestId = 0;

  const getItems = async filter => {
    const source = typeof props.items === "function" ? props.items(filter) : props.items;
    return (await Promise.resolve(source)) || [];
  };

  const compute = async () => {
    const currentRequest = ++requestId;
    state.loading = true;
    render();
    const query = state.filter ?? "";
    const needle = query.toLowerCase();
    const all = await getItems(query);
    if (currentRequest !== requestId) return;

    const filtered = pipe(
      all,
      items => {
        if (!needle) return items;
        if (!props.filterKeys && Array.isArray(items) && items.every(item => typeof item === "string")) {
          return fuzzysort.go(needle, items).map(item => item.target);
        }
        return fuzzysort.go(needle, items, { keys: props.filterKeys }).map(item => item.obj);
      },
      groupBy(item => (props.groupBy ? props.groupBy(item) : "")),
      entries(),
      map(([category, items]) => ({
        category,
        items: props.sortBy ? [...items].sort(props.sortBy) : items
      })),
      groups => (props.sortGroupsBy ? [...groups].sort(props.sortGroupsBy) : groups)
    );

    state.grouped = filtered;
    state.flat = pipe(filtered, flatMap(group => group.items));
    state.loading = false;

    if (props.noInitialSelection) {
      if (state.active === undefined || state.active === null) state.active = "";
    } else if (props.current) {
      state.active = props.key(props.current);
    } else if (!state.active || !state.flat.some(item => props.key(item) === state.active)) {
      state.active = state.flat.length > 0 ? props.key(state.flat[0]) : "";
    }

    props.onMove?.(state.flat.find(item => props.key(item) === state.active));
    render();
  };

  const reset = () => {
    if (props.noInitialSelection) {
      state.active = "";
      syncSelection();
      return;
    }
    const all = state.flat;
    if (all.length === 0) return;
    state.active = props.key(all[0]);
    syncSelection();
  };

  const moveActive = delta => {
    const all = state.flat;
    if (all.length === 0) return;
    const currentIndex = all.findIndex(item => props.key(item) === state.active);
    const nextIndex =
      currentIndex < 0
        ? delta > 0
          ? 0
          : all.length - 1
        : (currentIndex + delta + all.length) % all.length;
    state.active = props.key(all[nextIndex]);
    syncSelection();
  };

  const onKeyDown = event => {
    if (event.key === "Enter" && !event.isComposing) {
      event.preventDefault();
      const selectedIndex = state.flat.findIndex(item => props.key(item) === state.active);
      const selected = state.flat[selectedIndex];
      if (selected) props.onSelect?.(selected, selectedIndex);
      return;
    }

    if (event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
      if (event.key === "n" || event.key === "p") {
        event.preventDefault();
        moveActive(event.key === "n" ? 1 : -1);
        return;
      }
    }

    if (event.altKey || event.metaKey) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveActive(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveActive(-1);
    }
  };

  const setFilter = value => {
    state.filter = value;
    props.onFilter?.(value);
    void compute();
  };

  const applyExternalFilter = value => {
    if (value === state.filter) {
      void compute();
      return;
    }
    state.filter = value;
    void compute();
  };

  const syncSelection = () => {
    for (const entry of itemNodes.values()) {
      const isActive = entry.key === state.active;
      const isSelected = entry.item === props.current;
      entry.node.dataset.active = String(isActive);
      entry.node.dataset.selected = String(isSelected);
      entry.node.classList.toggle("active", isActive);
    }

    if (!state.mouseActive && scrollRef && state.active) {
      const current = findByKey(scrollRef, state.active);
      if (current) scrollIntoView(scrollRef, current, "center");
    }

    props.onMove?.(state.flat.find(item => props.key(item) === state.active));
  };

  const itemNodes = new Map();
  let scrollRef = null;
  let render = () => {};

  return {
    state,
    itemNodes,
    compute,
    reset,
    setFilter,
    applyExternalFilter,
    onKeyDown,
    syncSelection,
    setScrollRef: el => {
      scrollRef = el;
    },
    getScrollRef: () => scrollRef,
    setActive: value => {
      state.active = value ?? "";
      syncSelection();
    },
    active: () => state.active,
    setRender: fn => {
      render = fn;
    }
  };
}

export function List(props) {
  const list = createFilteredListState(props);
  let inputRef = null;
  let internalFilter = props.filter ?? "";
  const searchProps = () => (typeof props.search === "object" ? props.search : {});
  const addProps = () => props.add;
  const showAdd = () => !!addProps();
  const searchAction = () => searchProps().action;
  const rootEl = template(`<div data-component=list class="d-flex flex-column h-100 overflow-hidden"><div data-slot=list-search-root></div><div data-slot=list-scroll class="flex-grow-1 overflow-auto">`);
  const searchHost = rootEl.firstElementChild;
  const scrollEl = searchHost.nextElementSibling;
  const cleanup = [];

  const handleSelect = (item, index) => {
    props.onSelect?.(item, index);
  };

  const handleKey = event => {
    list.state.mouseActive = false;
    if (event.key === "Escape") return;
    const selected = list.state.flat.find(item => props.key(item) === list.state.active);
    const index = selected ? list.state.flat.indexOf(selected) : -1;
    props.onKeyEvent?.(event, selected);
    if (event.defaultPrevented) return;
    if (event.key === "Enter" && !event.isComposing) {
      event.preventDefault();
      if (selected) handleSelect(selected, index);
      return;
    }
    if (props.search) {
      if (event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey && (event.key === "n" || event.key === "p")) {
        list.onKeyDown(event);
        return;
      }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        list.onKeyDown(event);
      }
      return;
    }
    list.onKeyDown(event);
  };

  const applyFilter = (value, options) => {
    const prev = internalFilter;
    internalFilter = value;
    if (inputRef) inputRef.value = value;
    list.setFilter(value);
    if (!options?.ref) return;
    if (prev === value) {
      void list.compute();
      return;
    }
    queueMicrotask(() => list.compute());
  };

  const renderAdd = () => {
    const add = addProps();
    if (!add) return null;
    const addEl = template(`<div data-slot=list-item-add>`);
    appendChildren(addEl, add.render());
    if (add.class) addEl.classList.add(...normalizeClassName(add.class));
    return addEl;
  };

  const updateHeaderStuck = header => {
    const scroll = list.getScrollRef();
    if (!scroll || !header) return;
    const rect = header.getBoundingClientRect();
    const scrollRect = scroll.getBoundingClientRect();
    header.dataset.stuck = String(rect.top <= scrollRect.top + 1 && scroll.scrollTop > 0);
  };

  const render = () => {
    clearNode(scrollEl);
    clearNode(searchHost);
    for (const fn of cleanup.splice(0)) fn();
    list.itemNodes.clear();

    if (props.search) {
      const searchWrapper = template(`<div data-slot=list-search-wrapper class="px-2 pt-2 pb-1"><div data-slot=list-search class="input-group input-group-sm"><div data-slot=list-search-container class="d-flex align-items-center gap-1 flex-grow-1">`);
      const searchContainer = searchWrapper.firstElementChild;
      const searchInputHost = searchContainer.firstElementChild;
      searchWrapper.addEventListener("pointerdown", event => {
        const container = event.currentTarget;
        if (!(container instanceof HTMLElement)) return;
        const node = container.querySelector("input, textarea");
        const input = node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement ? node : inputRef;
        input?.focus();
        event.stopPropagation();
      });

      if (!searchProps().hideIcon) {
        appendChildren(searchInputHost, Icon({ name: "magnifying-glass" }));
      }

      const textField = TextField({
        autofocus: searchProps().autofocus,
        variant: "ghost",
        "data-slot": "list-search-input",
        type: "text",
        ref: el => {
          inputRef = el;
          if (inputRef) inputRef.value = internalFilter;
        },
        value: internalFilter,
        onChange: value => applyFilter(value),
        onKeyDown: handleKey,
        placeholder: searchProps().placeholder,
        spellcheck: false,
        autocorrect: "off",
        autocomplete: "off",
        autocapitalize: "off"
      });
      appendChildren(searchInputHost, textField);

      if (internalFilter) {
        const clearButton = IconButton({
          icon: "close",
          variant: "ghost",
          onClick: () => {
            internalFilter = "";
            applyFilter("");
            queueMicrotask(() => inputRef?.focus());
          },
          "aria-label": FALLBACK_MESSAGES.clearFilter
        });
        appendChildren(searchContainer, clearButton);
      }

      appendChildren(searchContainer, searchAction());
      if (searchProps().class) searchContainer.classList.add(...normalizeClassName(searchProps().class));
      searchHost.appendChild(searchWrapper);
    }

    const hasItems = list.state.flat.length > 0 || showAdd();
    if (!hasItems) {
      const emptyState = template(`<div data-slot=list-empty-state class="text-center text-secondary small py-4"><div data-slot=list-message>`);
      const message = emptyState.firstElementChild;
      const query = list.state.filter;
      if (list.state.loading) {
        appendChildren(message, props.loadingMessage ?? FALLBACK_MESSAGES.loading);
      } else if (props.emptyMessage) {
        appendChildren(message, props.emptyMessage);
      } else if (!query) {
        appendChildren(message, FALLBACK_MESSAGES.empty);
      } else {
        appendChildren(message, FALLBACK_MESSAGES.emptyPrefix);
        appendChildren(message, query);
        if (FALLBACK_MESSAGES.emptySuffix) {
          appendChildren(message, FALLBACK_MESSAGES.emptySuffix);
        }
      }
      scrollEl.appendChild(emptyState);
      return;
    }

    const grouped = list.state.grouped || [];
    grouped.forEach((group, groupIndex) => {
      const groupHost = template(`<div data-slot=list-group><div data-slot=list-items class="list-group list-group-flush">`);
      const itemsHost = groupHost.firstElementChild;
      const isLastGroup = () => groupIndex === grouped.length - 1;

      if (group.category) {
        const header = template(`<div data-slot=list-header class="text-uppercase small fw-semibold text-secondary px-3 pt-2 pb-1">`);
        appendChildren(header, props.groupHeader?.(group.category) ?? group.category);
        const onScroll = () => updateHeaderStuck(header);
        scrollEl.addEventListener("scroll", onScroll, { passive: true });
        cleanup.push(() => scrollEl.removeEventListener("scroll", onScroll));
        updateHeaderStuck(header);
        groupHost.insertBefore(header, itemsHost);
      }

      group.items.forEach((item, itemIndex) => {
        const node = template(`<button data-slot=list-item type=button class="list-group-item list-group-item-action d-flex align-items-center gap-2 text-start border-0">`);
        node.addEventListener("mouseleave", () => {
          if (!list.state.mouseActive) return;
          list.setActive("");
        });
        node.addEventListener("mousemove", event => {
          if (event.movementX === 0 && event.movementY === 0) return;
          list.state.mouseActive = true;
          list.setActive(props.key(item));
        });
        node.addEventListener("keydown", handleKey);
        node.addEventListener("click", () => handleSelect(item, itemIndex));
        node.dataset.key = props.key(item);
        node.dataset.active = String(props.key(item) === list.state.active);
        node.dataset.selected = String(item === props.current);
        node.classList.toggle("active", props.key(item) === list.state.active);
        appendChildren(node, resolveChildren(props.children, item, itemIndex));

        const selectedIcon = template(`<span data-slot=list-item-selected-icon class="ms-auto text-primary">`);
        appendChildren(selectedIcon, Icon({ name: "check-small" }));
        if (item === props.current) node.appendChild(selectedIcon);

        if (props.activeIcon) {
          const activeIcon = template(`<span data-slot=list-item-active-icon class="ms-auto text-secondary">`);
          appendChildren(activeIcon, Icon({ name: typeof props.activeIcon === "function" ? props.activeIcon() : props.activeIcon }));
          node.appendChild(activeIcon);
        }

        if (props.divider && (itemIndex !== group.items.length - 1 || (showAdd() && isLastGroup()))) {
          node.appendChild(template(`<span data-slot=list-item-divider class="border-bottom d-block">`));
        }

        list.itemNodes.set(node.dataset.key, { node, item, key: node.dataset.key });
        if (props.itemWrapper) {
          const wrapped = props.itemWrapper(item, node);
          if (wrapped instanceof Node) {
            if (!wrapped.contains(node)) wrapped.appendChild(node);
            itemsHost.appendChild(wrapped);
          } else {
            itemsHost.appendChild(node);
          }
        } else {
          itemsHost.appendChild(node);
        }
      });

      if (showAdd() && isLastGroup()) {
        const addNode = renderAdd();
        if (addNode) itemsHost.appendChild(addNode);
      }

      scrollEl.appendChild(groupHost);
    });

    if (grouped.length === 0 && showAdd()) {
      const groupHost = template(`<div data-slot=list-group><div data-slot=list-items class="list-group list-group-flush">`);
      const itemsHost = groupHost.firstElementChild;
      const addNode = renderAdd();
      if (addNode) itemsHost.appendChild(addNode);
      scrollEl.appendChild(groupHost);
    }

    syncSelection();
  };

  list.setRender(render);

  const syncSelection = () => {
    for (const entry of list.itemNodes.values()) {
      const isActive = entry.key === list.state.active;
      const isSelected = entry.item === props.current;
      entry.node.dataset.active = String(isActive);
      entry.node.dataset.selected = String(isSelected);
      entry.node.classList.toggle("active", isActive);
    }

    if (list.state.mouseActive || list.state.flat.length === 0) return;
    const scroll = list.getScrollRef();
    if (!scroll) return;
    if (list.state.active === props.key(list.state.flat[0])) {
      scroll.scrollTo(0, 0);
      return;
    }
    const activeNode = findByKey(scroll, list.state.active);
    if (activeNode) scrollIntoView(scroll, activeNode, "center");
  };

  list.syncSelection = syncSelection;

  const attachScrollRef = el => {
    list.setScrollRef(el);
  };

  if (props.ref) {
    props.ref({
      onKeyDown: handleKey,
      setScrollRef: attachScrollRef,
      setFilter: value => applyFilter(value, { ref: true })
    });
  }

  list.compute();
  attachScrollRef(scrollEl);
  render();

  return rootEl;
}
