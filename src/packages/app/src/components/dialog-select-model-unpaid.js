import { template as _$template } from "solid-js/web";
import { memo as _$memo } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<div class="px-1.5 pb-1.5"><div class="w-100 rounded-1 border bg-body-tertiary"><div class="w-100 d-flex flex-column align-items-start gap-4 px-1.5 pt-4 pb-4"><div class="px-2 fw-medium text-body"></div><div class=w-100>`),
  _tmpl$2 = /*#__PURE__*/_$template(`<div class="w-100 d-flex align-items-center gap-x-3"><span>`);
import { Button } from "@/bs/button.js";
import { useDialog } from "@/lib/dialog.js";
import { Dialog } from "@/bs/dialog.js";
import { List } from "@/bs/list.js";
import { ProviderIcon } from "@/vendor/ui/components/provider-icon.js";
import { Tag } from "@/bs/tag.js";
import { Show } from "solid-js";
import { useLocal } from "@/context/local.js";
import { useGlobalSync } from "@/context/global-sync.js";
import { popularProviders, useProviders } from "@/hooks/use-providers.js";
import { useLanguage } from "@/context/language.js";
import { localPresetMap, localPresets, presetToFormState } from "./local-llm-presets.js";
export const DialogSelectModelUnpaid = props => {
  // model state retained for API compatibility (unused now that the empty cloud free-models list was removed)
  void (props.model ?? useLocal().model);
  const dialog = useDialog();
  const providers = useProviders();
  const globalSync = useGlobalSync();
  const language = useLanguage();
  const activelyConfiguredIDs = () => {
    const disabled = new Set(globalSync.data.config.disabled_providers ?? []);
    const configured = Object.keys(globalSync.data.config.provider ?? {});
    return new Set(configured.filter(id => !disabled.has(id)));
  };
  const presetItems = () => localPresets.filter(p => !activelyConfiguredIDs().has(p.providerID)).map(p => ({
    id: p.id,
    name: p.name
  }));
  const items = () => {
    const presetIDs = new Set(localPresets.map(p => p.providerID));
    const configured = activelyConfiguredIDs();
    const catalog = providers.popular().filter(p => !presetIDs.has(p.id) || configured.has(p.id));
    return [...presetItems(), ...catalog];
  };
  const connect = provider => {
    void import("./dialog-connect-provider.js").then(x => {
      dialog.show(() => _$createComponent(x.DialogConnectProvider, {
        provider: provider
      }));
    });
  };
  const openPreset = presetID => {
    const preset = localPresetMap.get(presetID);
    if (!preset) return;
    void import("./dialog-custom-provider.js").then(x => {
      dialog.show(() => _$createComponent(x.DialogCustomProvider, {
        back: "close",
        get initial() {
          return presetToFormState(preset);
        }
      }));
    });
  };
  const all = () => {
    void import("./dialog-select-provider.js").then(x => {
      dialog.show(() => _$createComponent(x.DialogSelectProvider, {}));
    });
  };
  return _$createComponent(Dialog, {
    get title() {
      return language.t("dialog.model.select.title");
    },
    "class": "overflow-y-auto [&_[data-slot=dialog-body]]:overflow-visible [&_[data-slot=dialog-body]]:flex-none",
    get children() {
      var _el$ = _tmpl$(),
        _el$2 = _el$.firstChild,
        _el$3 = _el$2.firstChild,
        _el$4 = _el$3.firstChild,
        _el$5 = _el$4.nextSibling;
      _$insert(_el$4, () => language.t("dialog.model.unpaid.addMore.title"));
      _$insert(_el$5, _$createComponent(List, {
        "class": "w-100 px-0",
        key: x => x?.id,
        items: items,
        activeIcon: "plus-small",
        sortBy: (a, b) => {
          const aPreset = a.id.startsWith("_preset_");
          const bPreset = b.id.startsWith("_preset_");
          if (aPreset && !bPreset) return -1;
          if (bPreset && !aPreset) return 1;
          if (popularProviders.includes(a.id) && popularProviders.includes(b.id)) return popularProviders.indexOf(a.id) - popularProviders.indexOf(b.id);
          return a.name.localeCompare(b.name);
        },
        onSelect: x => {
          if (!x) return;
          if (x.id.startsWith("_preset_")) {
            openPreset(x.id);
            return;
          }
          connect(x.id);
        },
        children: i => {
          const preset = localPresetMap.get(i.id);
          return (() => {
            var _el$6 = _tmpl$2(),
              _el$7 = _el$6.firstChild;
            _$insert(_el$6, _$createComponent(ProviderIcon, {
              "data-slot": "list-item-extra-icon",
              get id() {
                return preset ? "synthetic" : i.id;
              }
            }), _el$7);
            _$insert(_el$7, () => i.name);
            _$insert(_el$6, _$createComponent(Show, {
              when: preset,
              get children() {
                return _$createComponent(Tag, {
                  children: "local"
                });
              }
            }), null);
            return _el$6;
          })();
        }
      }), null);
      _$insert(_el$5, _$createComponent(Button, {
        variant: "ghost",
        "class": "w-100 justify-content-start px-[11px] py-3.5 gap-4.5 fw-medium",
        icon: "dot-grid",
        onClick: all,
        get children() {
          return language.t("dialog.provider.viewAll");
        }
      }), null);
      return _el$;
    }
  });
};