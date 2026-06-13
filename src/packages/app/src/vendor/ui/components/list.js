import { useFilteredList } from "../hooks/index.js";
import { createComponent, createEffect, createMemo, createRenderEffect, on, untrack } from "../../../lib/reactivity.js";
import { createStore } from "../../../lib/store.js";
import { makeEventListener } from "../../../lib/primitives/event-listener.js";
import { useI18n } from "../context/i18n.js";
import { Icon } from "./icon.js";
import { IconButton } from "./icon-button.js";
import { TextField } from "./text-field.js";

// Vanilla port of the compiled Solid output. The static skeleton comes from
// template literals; every dynamic region (the compiled insert()/Show/For
// sites) is a render effect anchored at a comment marker, so updates stay as
// fine-grained as the original: the search bar never rebuilds while typing,
// groups rebuild only when the filtered resource resolves (the resource always
// produces fresh group objects, which is exactly when For re-mapped), and
// data-active/data-selected flips touch attributes only.

// Build a detached element from compact HTML (no inter-element whitespace,
// matching the compiled Solid templates). Built fresh per call: no cloneNode.
function template(html) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;
  return wrapper.firstElementChild;
}

// Resolve a possibly-reactive value the way solid-js/web's insert() does:
// call accessors (components may return memos/thunks) until a concrete value
// remains. Runs inside a render effect, so the reads stay tracked.
function resolveValue(value) {
  while (typeof value === "function") value = value();
  return value;
}

// Flatten an insert()-shaped value (nothing / node / string / array, possibly
// nested or holding accessors) into a list of concrete DOM nodes.
function flattenNodes(value, out) {
  if (value == null || typeof value === "boolean") return;
  if (Array.isArray(value)) {
    for (const entry of value) flattenNodes(resolveValue(entry), out);
    return;
  }
  if (value instanceof DocumentFragment) {
    out.push(...value.childNodes);
    return;
  }
  if (value instanceof Node) {
    out.push(value);
    return;
  }
  out.push(document.createTextNode(String(value)));
}

// Reactive region replacing solid-js/web insert(): keeps the accessor's
// rendered nodes anchored before `marker` (a comment appended at the call
// position when omitted, preserving sibling order for CSS child selectors).
// The effect is owned by the scope creating the region, so nested regions are
// disposed when an enclosing region rebuilds.
function renderRegion(parent, marker, accessor) {
  const anchor = marker ?? parent.appendChild(document.createComment(""));
  let current = [];
  createRenderEffect(() => {
    const nodes = [];
    flattenNodes(resolveValue(accessor), nodes);
    // Skip DOM work when nothing changed so a re-evaluated accessor that
    // yields the same nodes (e.g. a stable component root) keeps focus.
    if (nodes.length === current.length && nodes.every((node, i) => node === current[i])) return;
    for (const node of current) {
      if (!nodes.includes(node)) node.remove();
    }
    for (const node of nodes) parent.insertBefore(node, anchor);
    current = nodes;
  });
}

// Reactive single-class-string binding, mirroring the compiled classList
// effect `{ [cls ?? ""]: !!cls }`: previous tokens are removed, next tokens
// added, with falsy values toggling nothing.
function bindClassList(el, accessor) {
  createRenderEffect(prev => {
    const value = accessor();
    const next = value ? String(value) : "";
    if (next === prev) return prev;
    for (const token of prev.split(/\s+/)) {
      if (token) el.classList.remove(token);
    }
    for (const token of next.split(/\s+/)) {
      if (token) el.classList.add(token);
    }
    return next;
  }, "");
}

// Solid setAttribute semantics: nullish removes, anything else (including
// booleans) is stringified.
function setAttr(el, name, value) {
  if (value == null) el.removeAttribute(name);
  else el.setAttribute(name, value);
}

function findByKey(container, key) {
  const nodes = container.querySelectorAll('[data-slot="list-item"][data-key]');
  for (const node of nodes) {
    if (node.getAttribute("data-key") === key) return node;
  }
}
export function List(props) {
  const i18n = useI18n();
  let inputRef;
  const [store, setStore] = createStore({
    mouseActive: false,
    scrollRef: undefined,
    internalFilter: ""
  });
  const scrollRef = () => store.scrollRef;
  const setScrollRef = el => setStore("scrollRef", el);
  const internalFilter = () => store.internalFilter;
  const setInternalFilter = value => setStore("internalFilter", value);
  const scrollIntoView = (container, node, block) => {
    const containerRect = container.getBoundingClientRect();
    const nodeRect = node.getBoundingClientRect();
    const top = nodeRect.top - containerRect.top + container.scrollTop;
    const bottom = top + nodeRect.height;
    const viewTop = container.scrollTop;
    const viewBottom = viewTop + container.clientHeight;
    const target = block === "center" ? top - container.clientHeight / 2 + nodeRect.height / 2 : top < viewTop ? top : bottom > viewBottom ? bottom - container.clientHeight : viewTop;
    const max = Math.max(0, container.scrollHeight - container.clientHeight);
    container.scrollTop = Math.max(0, Math.min(target, max));
  };
  const {
    filter,
    grouped,
    flat,
    active,
    setActive,
    onKeyDown,
    onInput,
    refetch
  } = useFilteredList(props);
  const searchProps = () => typeof props.search === "object" ? props.search : {};
  const searchAction = () => searchProps().action;
  const addProps = () => props.add;
  const showAdd = () => !!addProps();
  const moved = event => event.movementX !== 0 || event.movementY !== 0;
  const applyFilter = (value, options) => {
    const prev = filter();
    setInternalFilter(value);
    onInput(value);
    props.onFilter?.(value);
    if (!options?.ref) return;

    // Force a refetch even if the value is unchanged.
    // This is important for programmatic changes like Tab completion.
    if (prev === value) {
      void refetch();
      return;
    }
    queueMicrotask(() => refetch());
  };
  createEffect(() => {
    if (props.filter === undefined) return;
    if (props.filter === internalFilter()) return;
    setInternalFilter(props.filter);
    onInput(props.filter);
  });
  createEffect(on(filter, () => {
    scrollRef()?.scrollTo(0, 0);
  }, {
    defer: true
  }));
  createEffect(() => {
    const scroll = scrollRef();
    if (!scroll) return;
    if (!props.current) return;
    const key = props.key(props.current);
    requestAnimationFrame(() => {
      const element = findByKey(scroll, key);
      if (!element) return;
      scrollIntoView(scroll, element, "center");
    });
  });
  createEffect(() => {
    const all = flat();
    if (store.mouseActive || all.length === 0) return;
    const scroll = scrollRef();
    if (!scroll) return;
    if (active() === props.key(all[0])) {
      scroll.scrollTo(0, 0);
      return;
    }
    const key = active();
    if (!key) return;
    const element = findByKey(scroll, key);
    if (!element) return;
    scrollIntoView(scroll, element, "center");
  });
  createEffect(() => {
    const all = flat();
    const current = active();
    const item = all.find(x => props.key(x) === current);
    props.onMove?.(item);
  });
  const handleSelect = (item, index) => {
    props.onSelect?.(item, index);
  };
  const handleKey = e => {
    setStore("mouseActive", false);
    if (e.key === "Escape") return;
    const all = flat();
    const selected = all.find(x => props.key(x) === active());
    const index = selected ? all.indexOf(selected) : -1;
    props.onKeyEvent?.(e, selected);
    if (e.defaultPrevented) return;
    if (e.key === "Enter" && !e.isComposing) {
      e.preventDefault();
      if (selected) handleSelect(selected, index);
    } else if (props.search) {
      if (e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && (e.key === "n" || e.key === "p")) {
        onKeyDown(e);
        return;
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        onKeyDown(e);
      }
    } else {
      onKeyDown(e);
    }
  };
  props.ref?.({
    onKeyDown: handleKey,
    setScrollRef,
    setFilter: value => applyFilter(value, {
      ref: true
    })
  });
  const renderAdd = () => {
    const add = addProps();
    if (!add) return null;
    const el = template(`<div data-slot=list-item-add></div>`);
    renderRegion(el, null, () => add.render());
    bindClassList(el, () => add.class);
    return el;
  };
  function GroupHeader(groupProps) {
    const [state, setState] = createStore({
      stuck: false,
      header: undefined
    });
    const header = template(`<div data-slot=list-header></div>`);
    setState("header", header);
    createEffect(() => {
      const scroll = scrollRef();
      const node = state.header;
      if (!scroll || !node) return;
      const handler = () => {
        const rect = node.getBoundingClientRect();
        const scrollRect = scroll.getBoundingClientRect();
        setState("stuck", rect.top <= scrollRect.top + 1 && scroll.scrollTop > 0);
      };
      makeEventListener(scroll, "scroll", handler, {
        passive: true
      });
      handler();
    });
    renderRegion(header, null, () => props.groupHeader?.(groupProps.group) ?? groupProps.group.category);
    createRenderEffect(() => setAttr(header, "data-stuck", state.stuck));
    return header;
  }
  const emptyMessage = () => {
    if (grouped.loading) return props.loadingMessage ?? i18n.t("ui.list.loading");
    if (props.emptyMessage) return props.emptyMessage;
    const query = filter();
    if (!query) return i18n.t("ui.list.empty");
    const suffix = i18n.t("ui.list.emptyWithFilter.suffix");
    const prefix = template(`<span></span>`);
    prefix.textContent = i18n.t("ui.list.emptyWithFilter.prefix");
    // The query is user input: append it as a text node between literal
    // quotes, never via markup.
    const match = template(`<span data-slot=list-filter></span>`);
    match.append('"', query, '"');
    const parts = [prefix, match];
    if (suffix) {
      const span = template(`<span></span>`);
      span.textContent = suffix;
      parts.push(span);
    }
    return parts;
  };
  const root = template(`<div data-component=list><div data-slot=list-scroll></div></div>`);
  const scrollEl = root.firstElementChild;

  // Search bar. Like the original non-keyed Show, the whole block is rebuilt
  // only when !!props.search flips; reactive details inside (icon visibility,
  // clear button, action node, class) update through their own regions.
  const hasSearch = createMemo(() => !!props.search);
  const buildSearch = () => {
    const wrapper = template(`<div data-slot=list-search-wrapper><div data-slot=list-search><div data-slot=list-search-container></div></div></div>`);
    const search = wrapper.firstElementChild;
    const container = search.firstElementChild;
    search.addEventListener("pointerdown", event => {
      const target = event.currentTarget;
      if (!(target instanceof HTMLElement)) return;
      const node = target.querySelector("input, textarea");
      const input = node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement ? node : inputRef;
      input?.focus();

      // Prevent global listeners (e.g. dnd sensors) from cancelling focus.
      event.stopPropagation();
    });
    const showIcon = createMemo(() => !searchProps().hideIcon);
    renderRegion(container, null, () => showIcon() ? createComponent(Icon, {
      name: "magnifying-glass"
    }) : null);
    renderRegion(container, null, createComponent(TextField, {
      get autofocus() {
        return searchProps().autofocus;
      },
      variant: "ghost",
      "data-slot": "list-search-input",
      type: "text",
      ref: el => {
        inputRef = el;
      },
      get value() {
        return internalFilter();
      },
      onChange: value => applyFilter(value),
      onKeyDown: handleKey,
      get placeholder() {
        return searchProps().placeholder;
      },
      spellcheck: false,
      autocorrect: "off",
      autocomplete: "off",
      autocapitalize: "off"
    }));
    const hasFilter = createMemo(() => !!internalFilter());
    renderRegion(search, null, () => {
      if (!hasFilter()) return null;
      // The vanilla IconButton reads its props once at creation (createComponent
      // untracks the component body), so a getter prop would freeze. Read the
      // label here, in the tracked region scope, so a locale change re-runs the
      // region and rebuilds the button with a fresh aria-label.
      const clearLabel = i18n.t("ui.list.clearFilter");
      return createComponent(IconButton, {
        icon: "circle-x",
        variant: "ghost",
        onClick: () => {
          setInternalFilter("");
          queueMicrotask(() => inputRef?.focus());
        },
        "aria-label": clearLabel
      });
    });
    renderRegion(wrapper, null, searchAction);
    bindClassList(search, () => searchProps().class);
    return wrapper;
  };
  renderRegion(root, scrollEl, () => hasSearch() ? buildSearch() : null);
  setScrollRef(scrollEl);
  const showAddMemo = createMemo(() => !!showAdd());
  const buildItem = (group, item, index, isLast) => {
    const node = template(`<button data-slot=list-item type=button></button>`);
    node.addEventListener("mouseleave", () => {
      if (!store.mouseActive) return;
      setActive(null);
    });
    node.addEventListener("mousemove", event => {
      if (!moved(event)) return;
      setStore("mouseActive", true);
      setActive(props.key(item));
    });
    node.addEventListener("keydown", handleKey);
    node.addEventListener("click", () => handleSelect(item, index));
    renderRegion(node, null, () => props.children(item));
    const isSelected = createMemo(() => item === props.current);
    renderRegion(node, null, () => {
      if (!isSelected()) return null;
      const span = template(`<span data-slot=list-item-selected-icon></span>`);
      renderRegion(span, null, createComponent(Icon, {
        name: "check-small"
      }));
      return span;
    });
    renderRegion(node, null, () => {
      // Keyed like the original Show callback: track the icon *value* (not just
      // truthiness) so a changed name rebuilds the one-shot Icon, which reads
      // its props once at creation.
      const activeIcon = props.activeIcon;
      if (!activeIcon) return null;
      const span = template(`<span data-slot=list-item-active-icon></span>`);
      renderRegion(span, null, createComponent(Icon, {
        name: activeIcon
      }));
      return span;
    });
    const hasDivider = createMemo(() => !!(props.divider && (index !== group.items.length - 1 || showAdd() && isLast)));
    renderRegion(node, null, () => hasDivider() ? template(`<span data-slot=list-item-divider></span>`) : null);
    createRenderEffect(prev => {
      const keyValue = props.key(item);
      const activeValue = props.key(item) === active();
      const selectedValue = item === props.current;
      if (keyValue !== prev.key) setAttr(node, "data-key", prev.key = keyValue);
      if (activeValue !== prev.active) setAttr(node, "data-active", prev.active = activeValue);
      if (selectedValue !== prev.selected) setAttr(node, "data-selected", prev.selected = selectedValue);
      return prev;
    }, {
      key: undefined,
      active: undefined,
      selected: undefined
    });
    return node;
  };
  const buildGroup = (group, isLast) => {
    const groupEl = template(`<div data-slot=list-group><div data-slot=list-items></div></div>`);
    const itemsEl = groupEl.firstElementChild;
    if (group.category) groupEl.insertBefore(GroupHeader({
      group
    }), itemsEl);
    group.items.forEach((item, index) => {
      const node = buildItem(group, item, index, isLast);
      const rendered = props.itemWrapper ? props.itemWrapper(item, node) : node;
      renderRegion(itemsEl, null, () => rendered);
    });
    renderRegion(itemsEl, null, () => showAddMemo() && isLast ? renderAdd() : null);
    return groupEl;
  };
  const buildEmptyState = () => {
    const empty = template(`<div data-slot=list-empty-state><div data-slot=list-message></div></div>`);
    renderRegion(empty.firstElementChild, null, emptyMessage);
    return empty;
  };
  const groupedEmpty = createMemo(() => grouped.latest.length === 0);
  const addOnlyVisible = createMemo(() => groupedEmpty() && showAdd());
  const buildContent = () => {
    // display:contents hosts keep group/add updates independent without
    // changing the flex layout or the :last-child styling of list groups
    // (groups and the add-only group are mutually exclusive).
    const groupsHost = template(`<div style=display:contents></div>`);
    const addHost = template(`<div style=display:contents></div>`);
    createRenderEffect(() => {
      const groups = grouped.latest;
      // The mapping runs untracked like For's map function; per-item
      // reactivity lives in the regions and memos created inside.
      const nodes = untrack(() => groups.map((group, index) => buildGroup(group, index === groups.length - 1)));
      groupsHost.replaceChildren(...nodes);
    });
    createRenderEffect(() => {
      if (!addOnlyVisible()) {
        addHost.replaceChildren();
        return;
      }
      const groupEl = template(`<div data-slot=list-group><div data-slot=list-items></div></div>`);
      renderRegion(groupEl.firstElementChild, null, renderAdd);
      addHost.replaceChildren(groupEl);
    });
    return [groupsHost, addHost];
  };
  const hasContent = createMemo(() => flat().length > 0 || showAdd());
  renderRegion(scrollEl, null, () => hasContent() ? buildContent() : buildEmptyState());
  bindClassList(root, () => props.class);
  return root;
}
