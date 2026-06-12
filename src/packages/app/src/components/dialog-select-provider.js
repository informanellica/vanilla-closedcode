import { createComponent } from "solid-js";
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

  // Row renderer for List items. Items are static snapshots (List re-renders
  // rows itself), so plain DOM construction is enough; user/provider strings
  // go through textContent, never into markup.
  const renderItem = i => {
    const preset = localPresetMap.get(i.id);
    const row = document.createElement("div");
    row.className = "px-1.25 w-100 d-flex align-items-center gap-x-3";

    row.appendChild(createComponent(ProviderIcon, {
      "data-slot": "list-item-extra-icon",
      id: preset ? "synthetic" : i.id
    }));

    const nameEl = document.createElement("span");
    nameEl.textContent = i.name ?? "";
    row.appendChild(nameEl);

    if (preset) {
      const descEl = document.createElement("div");
      descEl.className = "text-secondary";
      descEl.textContent = preset.description ?? "";
      row.appendChild(descEl);
    }

    if (i.id === CUSTOM_ID) {
      row.appendChild(createComponent(Tag, {
        get children() {
          return language.t("settings.providers.tag.custom");
        }
      }));
    }

    if (preset) {
      row.appendChild(createComponent(Tag, {
        children: "local"
      }));
    }

    const noteValue = note(i.id);
    if (noteValue) {
      const noteEl = document.createElement("div");
      noteEl.className = "text-secondary";
      noteEl.textContent = noteValue;
      row.appendChild(noteEl);
    }

    return row;
  };

  return createComponent(Dialog, {
    get title() {
      return language.t("command.provider.connect");
    },
    transition: true,
    get children() {
      return createComponent(List, {
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
            dialog.show(() => createComponent(DialogCustomProvider, {
              back: "providers"
            }));
            return;
          }
          const preset = localPresetMap.get(x.id);
          if (preset) {
            dialog.show(() => createComponent(DialogCustomProvider, {
              back: "providers",
              get initial() {
                return presetToFormState(preset);
              }
            }));
            return;
          }
          dialog.show(() => createComponent(DialogConnectProvider, {
            get provider() {
              return x.id;
            }
          }));
        },
        children: renderItem
      });
    }
  });
};
