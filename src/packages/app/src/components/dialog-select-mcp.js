import { template as _$template } from "solid-js/web";
import { delegateEvents as _$delegateEvents } from "solid-js/web";
import { memo as _$memo } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<span class="small fw-normal text-body-secondary">`),
  _tmpl$2 = /*#__PURE__*/_$template(`<span class="small fw-normal text-secondary">`),
  _tmpl$3 = /*#__PURE__*/_$template(`<span class="small fw-normal text-body-secondary truncate">`),
  _tmpl$4 = /*#__PURE__*/_$template(`<div class="w-100 d-flex align-items-center justify-content-between gap-x-3"><div class="d-flex flex-column gap-0.5 min-w-0"><div class="d-flex align-items-center gap-2"><span class=truncate></span></div></div><div>`);
import { createMemo, Show } from "solid-js";
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
  return _$createComponent(Dialog, {
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
      return _$createComponent(List, {
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
        children: i => {
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
          return (() => {
            var _el$ = _tmpl$4(),
              _el$2 = _el$.firstChild,
              _el$3 = _el$2.firstChild,
              _el$4 = _el$3.firstChild,
              _el$8 = _el$2.nextSibling;
            _$insert(_el$4, () => i.name);
            _$insert(_el$3, _$createComponent(Show, {
              get when() {
                return statusLabel();
              },
              get children() {
                var _el$5 = _tmpl$();
                _$insert(_el$5, statusLabel);
                return _el$5;
              }
            }), null);
            _$insert(_el$3, _$createComponent(Show, {
              get when() {
                return _$memo(() => !!mcp.isPending)() && mcp.pendingName === i.name;
              },
              get children() {
                var _el$6 = _tmpl$2();
                _$insert(_el$6, () => language.t("common.loading.ellipsis"));
                return _el$6;
              }
            }), null);
            _$insert(_el$2, _$createComponent(Show, {
              get when() {
                return error();
              },
              get children() {
                var _el$7 = _tmpl$3();
                _$insert(_el$7, error);
                return _el$7;
              }
            }), null);
            _el$8.$$click = e => e.stopPropagation();
            _$insert(_el$8, _$createComponent(Switch, {
              get checked() {
                return enabled();
              },
              get disabled() {
                return _$memo(() => !!mcp.isPending)() && mcp.pendingName === i.name;
              },
              onChange: () => {
                mcp.toggle(i.name);
              }
            }));
            return _el$;
          })();
        }
      });
    }
  });
};
_$delegateEvents(["click"]);