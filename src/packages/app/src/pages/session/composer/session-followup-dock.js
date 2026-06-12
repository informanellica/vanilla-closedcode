import { createComponent, createEffect, createMemo } from "solid-js";
import { createStore } from "solid-js/store";
import { Button } from "@/bs/button.js";
import { DockTray } from "@/vendor/ui/components/dock-surface.js";
import { IconButton } from "@/bs/icon-button.js";
import { useLanguage } from "@/context/language.js";

// Build a detached element from compact HTML (no inter-element whitespace,
// matching the compiled Solid templates).
function template(html) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;
  return wrapper.firstElementChild;
}

export function SessionFollowupDock(props) {
  const language = useLanguage();
  const [store, setStore] = createStore({
    collapsed: false
  });
  const toggle = () => setStore("collapsed", value => !value);
  const total = createMemo(() => props.items.length);
  const label = createMemo(() => language.t(total() === 1 ? "session.followupDock.summary.one" : "session.followupDock.summary.other", {
    count: total()
  }));
  const preview = createMemo(() => props.items[0]?.text ?? "");

  // Header row: summary label, collapsed-only preview, expand/collapse button.
  const header = template(`<div class="pl-3 pr-2 py-2 d-flex align-items-center gap-2" role="button" tabindex="0"><span class="shrink-0 fw-medium text-body-emphasis cursor-default" data-slot="label"></span><div class="ml-auto shrink-0" data-slot="actions"></div></div>`);
  const labelEl = header.querySelector('[data-slot="label"]');
  const actionsEl = header.querySelector('[data-slot="actions"]');

  // The compiled version delegated click/keydown on document; direct listeners
  // are equivalent (the IconButton stops propagation before these fire).
  header.addEventListener("click", toggle);
  header.addEventListener("keydown", event => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    toggle();
  });

  createEffect(() => {
    labelEl.textContent = label();
  });

  // Show (collapsed && preview): one-line preview of the first queued item,
  // mounted between the label and the actions cluster. The span is reused so
  // preview-text updates never remount it (matching the compiled insert()).
  const previewEl = template(`<span class="min-w-0 flex-1 truncate fw-normal text-body cursor-default"></span>`);
  createEffect(() => {
    const text = preview();
    if (store.collapsed && text) {
      previewEl.textContent = text;
      if (previewEl.parentNode !== header) header.insertBefore(previewEl, actionsEl);
    } else {
      previewEl.remove();
      previewEl.textContent = "";
    }
  });

  actionsEl.appendChild(createComponent(IconButton, {
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
      return store.collapsed ? language.t("session.followupDock.expand") : language.t("session.followupDock.collapse");
    }
  }));

  // One queued-followup row: live item text plus the send/edit actions.
  // Labels come from the caller's effect so a locale change rebuilds rows
  // (the vanilla Button renders its children once).
  const buildRow = (item, sendLabel, editLabel) => {
    const row = template(`<div class="d-flex align-items-center gap-2 min-w-0 py-1"><span class="min-w-0 flex-1 truncate fw-normal text-body-emphasis" data-slot="text"></span></div>`);
    const textEl = row.querySelector('[data-slot="text"]');
    // item.text may be store-backed; keep the text live without a row rebuild.
    createEffect(() => {
      textEl.textContent = item.text;
    });
    row.appendChild(createComponent(Button, {
      size: "small",
      variant: "secondary",
      "class": "shrink-0",
      get disabled() {
        return !!props.sending;
      },
      onClick: () => props.onSend(item.id),
      children: sendLabel
    }));
    row.appendChild(createComponent(Button, {
      size: "small",
      variant: "ghost",
      "class": "shrink-0",
      get disabled() {
        return !!props.sending;
      },
      onClick: () => props.onEdit(item.id),
      children: editLabel
    }));
    return row;
  };

  // For-equivalent: the scroll container stays mounted while expanded; rows
  // are rebuilt when the items array or the locale changes. The sending flag
  // flows through the Button disabled getters without a rebuild.
  const buildList = () => {
    const list = template(`<div class="px-3 pb-7 d-flex flex-column gap-1.5 max-h-42 overflow-y-auto no-scrollbar"></div>`);
    createEffect(() => {
      const sendLabel = language.t("session.followupDock.sendNow");
      const editLabel = language.t("session.followupDock.edit");
      list.replaceChildren(...props.items.map(item => buildRow(item, sendLabel, editLabel)));
    });
    return list;
  };

  const buildSpacer = () => template(`<div class="h-5" aria-hidden="true"></div>`);

  return createComponent(DockTray, {
    "data-component": "session-followup-dock",
    style: {
      "margin-bottom": "-0.875rem",
      "border-bottom-left-radius": 0,
      "border-bottom-right-radius": 0
    },
    get children() {
      // Function items become live regions inside DockTray (its child
      // reconciliation keeps the stable header mounted across toggles),
      // mirroring the compiled [element, Show, Show] children array.
      return [
        header,
        // Show (collapsed): spacer keeping the tray bottom padding stable.
        () => (store.collapsed ? buildSpacer() : null),
        // Show (!collapsed): the queued-followups list, rebuilt per expand
        // exactly like the original non-keyed <Show>.
        () => (store.collapsed ? null : buildList())
      ];
    }
  });
}
