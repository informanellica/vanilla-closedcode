import { createComponent, createEffect, createMemo, createRenderEffect, createRoot, onCleanup } from "solid-js";
import { createStore } from "solid-js/store";
import { Button } from "@/bs/button.js";
import { DockTray } from "@/vendor/ui/components/dock-surface.js";
import { IconButton } from "@/bs/icon-button.js";
import { useLanguage } from "@/context/language.js";

// Build a detached element from static markup. Only static skeletons go
// through here; translated/user strings are assigned via textContent.
function template(html) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html.trim();
  return wrapper.firstElementChild;
}

export function SessionRevertDock(props) {
  const language = useLanguage();
  const [store, setStore] = createStore({
    collapsed: true
  });
  createEffect(() => {
    props.items.length;
    props.items[0]?.id;
    setStore("collapsed", true);
  });
  const toggle = () => setStore("collapsed", value => !value);
  const total = createMemo(() => props.items.length);
  const label = createMemo(() => language.t(total() === 1 ? "session.revertDock.summary.one" : "session.revertDock.summary.other", {
    count: total()
  }));
  const preview = createMemo(() => props.items[0]?.text ?? "");

  // Header row: built once. Click / Enter / Space anywhere on it toggles; the
  // chevron icon button stops propagation so its own click toggles only once.
  const header = template(`<div class="pl-3 pr-2 py-2 d-flex align-items-center gap-2" role="button" tabindex="0"><span class="shrink-0 text-body-emphasis cursor-default" data-slot="revert-summary"></span><div class="ml-auto shrink-0" data-slot="revert-toggle"></div></div>`);
  const summaryEl = header.querySelector('[data-slot="revert-summary"]');
  const toggleEl = header.querySelector('[data-slot="revert-toggle"]');
  header.addEventListener("click", toggle);
  header.addEventListener("keydown", event => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    toggle();
  });
  createRenderEffect(() => {
    summaryEl.textContent = label();
  });

  // First-item preview (Show equivalent): mounted only while collapsed and a
  // preview exists; the text updates in place so a truthy-to-truthy change
  // never remounts the span.
  const previewEl = template(`<span class="min-w-0 flex-1 truncate text-body cursor-default"></span>`);
  createRenderEffect(() => {
    previewEl.textContent = preview();
  });
  createRenderEffect(() => {
    const show = !!(store.collapsed && preview());
    const mounted = previewEl.parentNode === header;
    if (show && !mounted) header.insertBefore(previewEl, toggleEl);
    else if (!show && mounted) previewEl.remove();
  });

  toggleEl.appendChild(createComponent(IconButton, {
    get ["data-collapsed"]() {
      return store.collapsed ? "true" : "false";
    },
    icon: "chevron-down",
    size: "normal",
    variant: "ghost",
    get style() {
      return {
        transform: `rotate(${store.collapsed ? 180 : 0}deg)`
      };
    },
    onMouseDown: event => {
      event.preventDefault();
      event.stopPropagation();
    },
    onClick: event => {
      event.stopPropagation();
      toggle();
    },
    get ["aria-label"]() {
      return store.collapsed ? language.t("session.revertDock.expand") : language.t("session.revertDock.collapse");
    }
  }));

  // Collapsed spacer (Show equivalent): a static, stateless element, so the
  // same node is simply re-attached on each collapse.
  const spacer = template(`<div class="h-5" aria-hidden="true"></div>`);

  // One expanded-list row. Created untracked inside a per-item root (For
  // equivalent), so the row's reactive bindings (item text, Button disabled)
  // survive list reconciliations and are disposed when the item is dropped.
  const buildRow = item => {
    const row = template(`<div class="d-flex align-items-center gap-2 min-w-0 py-1"><span class="min-w-0 flex-1 truncate fw-normal text-body-emphasis"></span></div>`);
    const textEl = row.firstChild;
    createRenderEffect(() => {
      textEl.textContent = item.text;
    });
    row.appendChild(createComponent(Button, {
      size: "small",
      variant: "secondary",
      "class": "shrink-0",
      get disabled() {
        return props.disabled || !!props.restoring;
      },
      onClick: () => props.onRestore(item.id),
      get children() {
        return language.t("session.revertDock.restore");
      }
    }));
    return row;
  };

  // Expanded list (Show + For equivalent): a fresh container per expansion —
  // like the compiled Show — so scroll position resets on re-expand. Rows are
  // keyed by item reference in a nested effect, so the scroll container stays
  // mounted across item updates while expanded.
  const buildList = () => {
    const box = template(`<div class="px-3 pb-7 d-flex flex-column gap-1.5 max-h-42 overflow-y-auto no-scrollbar"></div>`);
    let cache = new Map();
    onCleanup(() => {
      for (const entry of cache.values()) entry.dispose();
    });
    createRenderEffect(() => {
      const next = new Map();
      const rows = [];
      for (const item of props.items) {
        const entry = cache.get(item) ?? createRoot(dispose => ({
          row: buildRow(item),
          dispose
        }));
        next.set(item, entry);
        rows.push(entry.row);
      }
      for (const [item, entry] of cache) {
        if (!next.has(item)) entry.dispose();
      }
      cache = next;
      const unchanged = box.childNodes.length === rows.length && rows.every((row, index) => box.childNodes[index] === row);
      if (!unchanged) box.replaceChildren(...rows);
    });
    return box;
  };

  // The two slot functions become live, comment-anchored regions inside the
  // vanilla DockTray (insertChildren handles function children).
  return createComponent(DockTray, {
    "data-component": "session-revert-dock",
    get children() {
      return [header, () => store.collapsed ? spacer : null, () => store.collapsed ? null : buildList()];
    }
  });
}
