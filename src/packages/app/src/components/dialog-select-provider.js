import { template as _$template } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { memo as _$memo } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<div class="px-1.25 w-100 d-flex align-items-center gap-x-3"><span>`),
  _tmpl$2 = /*#__PURE__*/_$template(`<div class="text-secondary">`);
import { Show } from "solid-js";
import { useDialog } from "@/lib/dialog.js";
import { popularProviders, useProviders } from "@/hooks/use-providers.js";
import { Dialog } from "@/bs/dialog.js";
import { List } from "@/bs/list.js";
import { Tag } from "@/bs/tag.js";
import { ProviderIcon } from "@/vendor/ui/components/provider-icon.js";
import { DialogConnectProvider } from "./dialog-connect-provider.js";
import { useLanguage } from "@/context/language.js";
import { useGlobalSync } from "@/context/global-sync.js";
import { DialogCustomProvider } from "./dialog-custom-provider.js";
import { localPresetMap, localPresets, presetToFormState } from "./local-llm-presets.js";
const CUSTOM_ID = "_custom";
export const DialogSelectProvider = () => {
  const dialog = useDialog();
  const providers = useProviders();
  const globalSync = useGlobalSync();
  const language = useLanguage();
  const popularGroup = () => language.t("dialog.provider.group.popular");
  const otherGroup = () => language.t("dialog.provider.group.other");
  const customLabel = () => language.t("settings.providers.tag.custom");
  const note = _id => undefined;
  const activelyConfiguredIDs = () => {
    const disabled = new Set(globalSync.data.config.disabled_providers ?? []);
    const configured = Object.keys(globalSync.data.config.provider ?? {});
    return new Set(configured.filter(id => !disabled.has(id)));
  };
  const presetProviderIDs = () => new Set(localPresets.map(p => p.providerID));
  const presetItems = () => localPresets.filter(p => !activelyConfiguredIDs().has(p.providerID)).map(p => ({
    id: p.id,
    name: p.name
  }));
  return _$createComponent(Dialog, {
    get title() {
      return language.t("command.provider.connect");
    },
    transition: true,
    get children() {
      return _$createComponent(List, {
        get search() {
          return {
            placeholder: language.t("dialog.provider.search.placeholder"),
            autofocus: true
          };
        },
        get emptyMessage() {
          return language.t("dialog.provider.empty");
        },
        activeIcon: "plus-small",
        key: x => x?.id,
        items: () => {
          language.locale();
          const presetIDs = presetProviderIDs();
          const configured = activelyConfiguredIDs();
          const catalog = providers.all().filter(p => !presetIDs.has(p.id) || configured.has(p.id));
          return [{
            id: CUSTOM_ID,
            name: customLabel()
          }, ...presetItems(), ...catalog];
        },
        filterKeys: ["id", "name"],
        groupBy: x => x.id === CUSTOM_ID || x.id.startsWith("_preset_") || popularProviders.includes(x.id) ? popularGroup() : otherGroup(),
        sortBy: (a, b) => {
          if (a.id === CUSTOM_ID) return -1;
          if (b.id === CUSTOM_ID) return 1;
          const aPreset = a.id.startsWith("_preset_");
          const bPreset = b.id.startsWith("_preset_");
          if (aPreset && !bPreset) return -1;
          if (bPreset && !aPreset) return 1;
          if (popularProviders.includes(a.id) && popularProviders.includes(b.id)) return popularProviders.indexOf(a.id) - popularProviders.indexOf(b.id);
          return a.name.localeCompare(b.name);
        },
        sortGroupsBy: (a, b) => {
          const popular = popularGroup();
          if (a.category === popular && b.category !== popular) return -1;
          if (b.category === popular && a.category !== popular) return 1;
          return 0;
        },
        onSelect: x => {
          if (!x) return;
          if (x.id === CUSTOM_ID) {
            dialog.show(() => _$createComponent(DialogCustomProvider, {
              back: "providers"
            }));
            return;
          }
          const preset = localPresetMap.get(x.id);
          if (preset) {
            dialog.show(() => _$createComponent(DialogCustomProvider, {
              back: "providers",
              get initial() {
                return presetToFormState(preset);
              }
            }));
            return;
          }
          dialog.show(() => _$createComponent(DialogConnectProvider, {
            get provider() {
              return x.id;
            }
          }));
        },
        children: i => {
          const preset = localPresetMap.get(i.id);
          return (() => {
            var _el$ = _tmpl$(),
              _el$2 = _el$.firstChild;
            _$insert(_el$, _$createComponent(ProviderIcon, {
              "data-slot": "list-item-extra-icon",
              get id() {
                return preset ? "synthetic" : i.id;
              }
            }), _el$2);
            _$insert(_el$2, () => i.name);
            _$insert(_el$, _$createComponent(Show, {
              when: preset,
              children: p => (() => {
                var _el$3 = _tmpl$2();
                _$insert(_el$3, () => p().description);
                return _el$3;
              })()
            }), null);
            _$insert(_el$, _$createComponent(Show, {
              get when() {
                return i.id === CUSTOM_ID;
              },
              get children() {
                return _$createComponent(Tag, {
                  get children() {
                    return language.t("settings.providers.tag.custom");
                  }
                });
              }
            }), null);
            _$insert(_el$, _$createComponent(Show, {
              when: preset,
              get children() {
                return _$createComponent(Tag, {
                  children: "local"
                });
              }
            }), null);
            _$insert(_el$, _$createComponent(Show, {
              get when() {
                return note(i.id);
              },
              children: value => (() => {
                var _el$4 = _tmpl$2();
                _$insert(_el$4, value);
                return _el$4;
              })()
            }), null);
            return _el$;
          })();
        }
      });
    }
  });
};