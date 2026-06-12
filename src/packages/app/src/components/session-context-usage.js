import { createComponent, createMemo, createRenderEffect } from "solid-js";
import { Tooltip } from "@/bs/tooltip.js";
import { ProgressCircle } from "@/vendor/ui/components/progress-circle.js";
import { Button } from "@/bs/button.js";
import { useFile } from "@/context/file.js";
import { useLayout } from "@/context/layout.js";
import { useSync } from "@/context/sync.js";
import { useLanguage } from "@/context/language.js";
import { useProviders } from "@/hooks/use-providers.js";
import { getSessionContextMetrics } from "@/components/session/session-context-metrics.js";
import { useSessionLayout } from "@/pages/session/session-layout.js";
import { createSessionTabs } from "@/pages/session/helpers.js";
function openSessionContext(args) {
  if (!args.view.reviewPanel.opened()) args.view.reviewPanel.open();
  if (args.layout.fileTree.opened() && args.layout.fileTree.tab() !== "all") args.layout.fileTree.setTab("all");
  void args.tabs.open("context");
  args.tabs.setActive("context");
}
export function SessionContextUsage(props) {
  const sync = useSync();
  const file = useFile();
  const layout = useLayout();
  const language = useLanguage();
  const providers = useProviders();
  const {
    params,
    tabs,
    view
  } = useSessionLayout();
  const variant = createMemo(() => props.variant ?? "button");
  const tabState = createSessionTabs({
    tabs,
    pathFromTab: file.pathFromTab,
    normalizeTab: tab => tab.startsWith("file://") ? file.tab(tab) : tab
  });
  const messages = createMemo(() => params.id ? sync.data?.message?.[params.id] ?? [] : []);
  const usd = () => {
    try {
      return new Intl.NumberFormat(language.intl?.() ?? "en-US", {
        style: "currency",
        currency: "USD"
      });
    } catch {
      return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
    }
  };
  const metrics = createMemo(() => {
    try { return getSessionContextMetrics(messages() ?? [], providers.all?.() ?? []); }
    catch { return { context: 0, totalCost: 0 }; }
  });
  const context = createMemo(() => metrics()?.context ?? 0);
  const cost = createMemo(() => {
    const total = metrics()?.totalCost ?? 0;
    try { return usd().format(total); } catch { return "$0.00"; }
  });
  const openContext = () => {
    if (!params.id) return;
    if (tabState.activeTab() === "context") {
      tabs().close("context");
      return;
    }
    openSessionContext({
      view: view(),
      layout,
      tabs: tabs()
    });
  };

  // Progress circle wrapper (_tmpl$). Rebuilt on each call (the tooltip/button
  // own the returned node); percentage is a live getter into context()?.usage.
  const circle = () => {
    const wrap = document.createElement("div");
    wrap.className = "d-flex align-items-center justify-content-center";
    wrap.appendChild(createComponent(ProgressCircle, {
      size: 16,
      strokeWidth: 2,
      get percentage() {
        return context()?.usage ?? 0;
      }
    }));
    return wrap;
  };

  // Tooltip content (_tmpl$2): an outer div containing an optional context-info
  // block (token total + usage %) followed by the cost row. Rebuilt per call so
  // the Tooltip can snapshot/clone the current values.
  const tooltipValue = () => {
    const outer = document.createElement("div");
    const costRow = document.createElement("div");
    costRow.className = "d-flex align-items-center gap-2";
    const costValue = document.createElement("span");
    costValue.className = "text-white";
    const costLabel = document.createElement("span");
    costLabel.className = "text-white";
    costRow.appendChild(costValue);
    costRow.appendChild(costLabel);

    // <Show when={context()}> inserted before the cost row.
    const ctx = context();
    if (ctx) {
      // Token total row (_tmpl$3): `<div><span>{total}</span><span>{label}</span></div>`.
      const tokenRow = document.createElement("div");
      tokenRow.className = "d-flex align-items-center gap-2";
      const tokenValue = document.createElement("span");
      tokenValue.className = "text-white";
      tokenValue.textContent = ctx.total.toLocaleString(language.intl());
      const tokenLabel = document.createElement("span");
      tokenLabel.className = "text-white";
      tokenLabel.textContent = language.t("context.usage.tokens");
      tokenRow.appendChild(tokenValue);
      tokenRow.appendChild(tokenLabel);
      outer.appendChild(tokenRow);

      // Usage row (_tmpl$4): `<div><span>{usage}%</span><span>{label}</span></div>`,
      // where the literal "%" follows the inserted usage value.
      const usageRow = document.createElement("div");
      usageRow.className = "d-flex align-items-center gap-2";
      const usageValueSpan = document.createElement("span");
      usageValueSpan.className = "text-white";
      const usageValue = document.createTextNode(String(ctx.usage ?? 0));
      usageValueSpan.appendChild(usageValue);
      usageValueSpan.appendChild(document.createTextNode("%"));
      const usageLabel = document.createElement("span");
      usageLabel.className = "text-white";
      usageLabel.textContent = language.t("context.usage.usage");
      usageRow.appendChild(usageValueSpan);
      usageRow.appendChild(usageLabel);
      outer.appendChild(usageRow);
    }

    outer.appendChild(costRow);
    costValue.textContent = cost();
    costLabel.textContent = language.t("context.usage.cost");
    return outer;
  };

  // Build the tooltip-wrapped control. <Switch>: the "indicator" variant renders
  // the bare progress circle, otherwise a ghost button wrapping the same circle.
  // The branch is resolved once per build (params.id flip remounts), matching
  // the compiled Switch evaluating its memos when the Show subtree mounts.
  const build = () => createComponent(Tooltip, {
    get value() {
      return tooltipValue();
    },
    get placement() {
      return props.placement ?? "top";
    },
    children: variant() === "indicator"
      ? circle()
      : createComponent(Button, {
          type: "button",
          variant: "ghost",
          class: "size-6",
          onClick: openContext,
          get ["aria-label"]() {
            return language.t("context.usage.view");
          },
          children: circle()
        })
  });

  // <Show when={params.id}>: render the control only when a session is active.
  // A display:contents anchor keeps the original layout (the compiled Show added
  // no wrapper element). params is a reactive store, so read it live here.
  const root = document.createElement("div");
  root.style.display = "contents";
  let shown = false;
  createRenderEffect(() => {
    const active = !!params.id;
    if (active === shown) return;
    shown = active;
    if (active) root.replaceChildren(build());
    else root.replaceChildren();
  });
  return root;
}
