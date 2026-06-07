import { template as _$template } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
import { memo as _$memo } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<div class="d-flex align-items-center justify-content-center">`),
  _tmpl$2 = /*#__PURE__*/_$template(`<div><div class="d-flex align-items-center gap-2"><span class=text-white></span><span class=text-white>`),
  _tmpl$3 = /*#__PURE__*/_$template(`<div class="d-flex align-items-center gap-2"><span class=text-white></span><span class=text-white>`),
  _tmpl$4 = /*#__PURE__*/_$template(`<div class="d-flex align-items-center gap-2"><span class=text-white>%</span><span class=text-white>`);
import { Match, Show, Switch, createMemo } from "solid-js";
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
  const circle = () => (() => {
    var _el$ = _tmpl$();
    _$insert(_el$, _$createComponent(ProgressCircle, {
      size: 16,
      strokeWidth: 2,
      get percentage() {
        return context()?.usage ?? 0;
      }
    }));
    return _el$;
  })();
  const tooltipValue = () => (() => {
    var _el$2 = _tmpl$2(),
      _el$3 = _el$2.firstChild,
      _el$4 = _el$3.firstChild,
      _el$5 = _el$4.nextSibling;
    _$insert(_el$2, _$createComponent(Show, {
      get when() {
        return context();
      },
      children: ctx => [(() => {
        var _el$6 = _tmpl$3(),
          _el$7 = _el$6.firstChild,
          _el$8 = _el$7.nextSibling;
        _$insert(_el$7, () => ctx().total.toLocaleString(language.intl()));
        _$insert(_el$8, () => language.t("context.usage.tokens"));
        return _el$6;
      })(), (() => {
        var _el$9 = _tmpl$4(),
          _el$0 = _el$9.firstChild,
          _el$1 = _el$0.firstChild,
          _el$10 = _el$0.nextSibling;
        _$insert(_el$0, () => ctx().usage ?? 0, _el$1);
        _$insert(_el$10, () => language.t("context.usage.usage"));
        return _el$9;
      })()]
    }), _el$3);
    _$insert(_el$4, cost);
    _$insert(_el$5, () => language.t("context.usage.cost"));
    return _el$2;
  })();
  return _$createComponent(Show, {
    get when() {
      return params.id;
    },
    get children() {
      return _$createComponent(Tooltip, {
        get value() {
          return tooltipValue();
        },
        get placement() {
          return props.placement ?? "top";
        },
        get children() {
          return _$createComponent(Switch, {
            get children() {
              return [_$createComponent(Match, {
                get when() {
                  return variant() === "indicator";
                },
                get children() {
                  return circle();
                }
              }), _$createComponent(Match, {
                when: true,
                get children() {
                  return _$createComponent(Button, {
                    type: "button",
                    variant: "ghost",
                    "class": "size-6",
                    onClick: openContext,
                    get ["aria-label"]() {
                      return language.t("context.usage.view");
                    },
                    get children() {
                      return circle();
                    }
                  });
                }
              })];
            }
          });
        }
      });
    }
  });
}