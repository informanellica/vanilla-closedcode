import { createComponent, createMemo, createRenderEffect } from "solid-js";
import { useSync } from "@/context/sync.js";
import { Dialog } from "@/bs/dialog.js";
import { List } from "@/bs/list.js";
import { Switch } from "@/bs/switch.js";
import { useLanguage } from "@/context/language.js";
import { useMcpController } from "@/controllers/mcp.js";

const statusLabels = {
  connected: "mcp.status.connected",
  failed: "mcp.status.failed",
  needs_auth: "mcp.status.needs_auth",
  disabled: "mcp.status.disabled"
};

function template(html) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html.trim();
  return wrapper.firstElementChild;
}

export const DialogSelectMcp = () => {
  const sync = useSync();
  const language = useLanguage();
  const mcp = useMcpController();
  const items = createMemo(() => Object.entries(sync.data?.mcp ?? {}).map(([name, status]) => ({
    name,
    status: status.status
  })).sort((a, b) => a.name.localeCompare(b.name)));
  const enabledCount = createMemo(() => items().filter(i => i.status === "connected").length);
  const totalCount = createMemo(() => items().length);

  // One list row. `i` is a plain snapshot object from the items memo, so the
  // name is static; the status/loading/error pieces read the live sync store
  // (and the locale) through render effects, mirroring the original Show +
  // insert reactivity. The conditional spans stay in the DOM and toggle
  // display so the original element order is always preserved (display:none
  // spans create no flex item, hence no extra gap).
  const renderItem = i => {
    const mcpStatus = () => sync.data?.mcp?.[i.name];
    const status = () => mcpStatus()?.status;
    const statusLabel = () => {
      const key = status() ? statusLabels[status()] : undefined;
      if (!key) return;
      return language.t(key);
    };
    const error = () => {
      const s = mcpStatus();
      return s?.status === "failed" ? s.error : undefined;
    };
    const enabled = () => status() === "connected";
    const pending = () => !!mcp.isPending && mcp.pendingName === i.name;

    const root = template(`
      <div class="w-100 d-flex align-items-center justify-content-between gap-x-3">
        <div class="d-flex flex-column gap-0.5 min-w-0">
          <div class="d-flex align-items-center gap-2">
            <span class="truncate" data-slot="name"></span>
            <span class="small fw-normal text-body-secondary" data-slot="status" style="display: none"></span>
            <span class="small fw-normal text-secondary" data-slot="loading" style="display: none"></span>
          </div>
          <span class="small fw-normal text-body-secondary truncate" data-slot="error" style="display: none"></span>
        </div>
        <div data-slot="actions"></div>
      </div>`);
    const nameEl = root.querySelector('[data-slot="name"]');
    const statusEl = root.querySelector('[data-slot="status"]');
    const loadingEl = root.querySelector('[data-slot="loading"]');
    const errorEl = root.querySelector('[data-slot="error"]');
    const actionsEl = root.querySelector('[data-slot="actions"]');

    nameEl.textContent = i.name;

    createRenderEffect(() => {
      const label = statusLabel();
      statusEl.textContent = label ?? "";
      statusEl.style.display = label ? "" : "none";
    });

    createRenderEffect(() => {
      const isPending = pending();
      loadingEl.textContent = isPending ? language.t("common.loading.ellipsis") : "";
      loadingEl.style.display = isPending ? "" : "none";
    });

    createRenderEffect(() => {
      const message = error();
      errorEl.textContent = message ?? "";
      errorEl.style.display = message ? "" : "none";
    });

    // Keep switch clicks from also triggering the row's onSelect (the
    // compiled version used a delegated $$click stopPropagation for this).
    actionsEl.addEventListener("click", e => e.stopPropagation());
    actionsEl.appendChild(createComponent(Switch, {
      get checked() {
        return enabled();
      },
      get disabled() {
        return pending();
      },
      onChange: () => {
        mcp.toggle(i.name);
      }
    }));

    return root;
  };

  return createComponent(Dialog, {
    get title() {
      return language.t("dialog.mcp.title");
    },
    get description() {
      return language.t("dialog.mcp.description", {
        enabled: enabledCount(),
        total: totalCount()
      });
    },
    get children() {
      return createComponent(List, {
        get search() {
          return {
            placeholder: language.t("common.search.placeholder"),
            autofocus: true
          };
        },
        get emptyMessage() {
          return language.t("dialog.mcp.empty");
        },
        key: x => x?.name ?? "",
        items: items,
        filterKeys: ["name", "status"],
        sortBy: (a, b) => a.name.localeCompare(b.name),
        onSelect: x => {
          if (!x) return;
          mcp.toggle(x.name);
        },
        children: renderItem
      });
    }
  });
};
