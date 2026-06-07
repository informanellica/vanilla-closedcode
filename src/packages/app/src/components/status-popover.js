import { template as _$template } from "solid-js/web";
import { classList as _$classList } from "solid-js/web";
import { effect as _$effect } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { memo as _$memo } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<div class="relative size-4"><div class="badge-mask-tight size-4 d-flex align-items-center justify-content-center"></div><div>`),
  _tmpl$2 = /*#__PURE__*/_$template(`<div class="w-[360px] h-14 rounded-3 bg-body shadow-[var(--shadow-lg-border-base)]">`);
import { Button } from "@/bs/button.js";
import { Icon } from "@/bs/icon.js";
import { Popover } from "@/vendor/ui/components/popover.js";
import { Suspense, createMemo, createSignal, lazy, Show } from "solid-js";
import { useLanguage } from "@/context/language.js";
import { useServer } from "@/context/server.js";
import { useSync } from "@/context/sync.js";
const Body = lazy(() => import("./status-popover-body.js").then(x => ({
  default: x.StatusPopoverBody
})));
export function StatusPopover() {
  const language = useLanguage();
  const server = useServer();
  const sync = useSync();
  const [shown, setShown] = createSignal(false);
  const ready = createMemo(() => server.healthy() === false || sync.data?.mcp_ready);
  const healthy = createMemo(() => {
    const serverHealthy = server.healthy() === true;
    const mcp = Object.values(sync.data?.mcp ?? {});
    const issue = mcp.some(item => item.status !== "connected" && item.status !== "disabled");
    return serverHealthy && !issue;
  });
  return _$createComponent(Popover, {
    get open() {
      return shown();
    },
    onOpenChange: setShown,
    triggerAs: Button,
    get triggerProps() {
      return {
        variant: "ghost",
        class: "titlebar-icon w-8 h-6 p-0 box-border",
        "aria-label": language.t("status.popover.trigger"),
        style: {
          scale: 1
        }
      };
    },
    get trigger() {
      return (() => {
        var _el$ = _tmpl$(),
          _el$2 = _el$.firstChild,
          _el$3 = _el$2.nextSibling;
        _$insert(_el$2, _$createComponent(Icon, {
          get name() {
            return shown() ? "status-active" : "status";
          },
          size: "small"
        }));
        _$effect(_$p => _$classList(_el$3, {
          "absolute -top-px -right-px size-1.5 rounded-circle": true,
          "bg-success": ready() && healthy(),
          "bg-danger": server.healthy() === false || ready() && !healthy(),
          "bg-secondary": server.healthy() === undefined || !ready()
        }, _$p));
        return _el$;
      })();
    },
    "class": "[&_[data-slot=popover-body]]:p-0 w-[360px] max-w-[calc(100vw-40px)] bg-transparent border-0 shadow-none rounded-3",
    gutter: 4,
    placement: "bottom-end",
    shift: -168,
    get children() {
      return _$createComponent(Show, {
        get when() {
          return shown();
        },
        get children() {
          return _$createComponent(Suspense, {
            get fallback() {
              return _tmpl$2();
            },
            get children() {
              return _$createComponent(Body, {
                shown: shown
              });
            }
          });
        }
      });
    }
  });
}