import { template as _$template } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<div class="d-flex align-items-center justify-content-between gap-4 min-h-16 border-b last:border-none flex-wrap py-3"data-component=custom-provider-section><div class="d-flex flex-column min-w-0"><div class="d-flex flex-wrap align-items-center gap-x-3 gap-y-1"><span class="fw-medium text-body-emphasis"></span></div><span class="small fw-normal text-secondary pl-8">`),
  _tmpl$2 = /*#__PURE__*/_$template(`<div class="d-flex flex-column h-full overflow-y-auto no-scrollbar px-4 pb-10 sm:px-10 sm:pb-10"><div class="sticky top-0 z-10 bg-[linear-gradient(to_bottom,var(--surface-stronger-non-alpha)_calc(100%_-_24px),transparent)]"><div class="d-flex flex-column gap-1 pt-6 pb-8 max-w-[720px]"><h2 class="fs-6 fw-medium text-body-emphasis"></h2></div></div><div class="d-flex flex-column gap-8 max-w-[720px]"><div class="d-flex flex-column gap-1"data-component=connected-providers-section><h3 class="fw-medium text-body-emphasis pb-2"></h3></div><div class="d-flex flex-column gap-1"><h3 class="fw-medium text-body-emphasis pb-2">`),
  _tmpl$3 = /*#__PURE__*/_$template(`<div class="py-4 fw-normal text-secondary">`),
  _tmpl$4 = /*#__PURE__*/_$template(`<div class="group d-flex flex-wrap align-items-center justify-content-between gap-4 min-h-16 py-3 px-4 bg-body-tertiary rounded-3"><div class="d-flex align-items-center gap-3 min-w-0"><span class="fw-medium text-body-emphasis truncate">`),
  _tmpl$5 = /*#__PURE__*/_$template(`<span class="fw-normal text-body opacity-0 group-hover:opacity-100 transition-opacity duration-200 pr-3 cursor-default">`),
  _tmpl$6 = /*#__PURE__*/_$template(`<div class="d-flex flex-wrap align-items-center justify-content-between gap-4 min-h-16 py-3 border-b last:border-none"><div class="d-flex flex-column min-w-0"><div class="d-flex align-items-center gap-x-3"><span class="fw-medium text-body-emphasis">`),
  _tmpl$7 = /*#__PURE__*/_$template(`<span class="small fw-normal text-secondary pl-8">`);
import { Button } from "@/bs/button.js";
import { IconButton } from "@/bs/icon-button.js";
import { useDialog } from "@/lib/dialog.js";
import { ProviderIcon } from "@/vendor/ui/components/provider-icon.js";
import { Tag } from "@/bs/tag.js";
import { showToast } from "@/lib/toast.js";
import { popularProviders, useProviders } from "@/hooks/use-providers.js";
import { createMemo, createSignal, createEffect, For, Show } from "solid-js";
import { useLanguage } from "@/context/language.js";
import { useProvidersController } from "@/controllers/providers.js";
import { DialogConnectProvider } from "./dialog-connect-provider.js";
import { DialogSelectProvider } from "./dialog-select-provider.js";
import { DialogCustomProvider } from "./dialog-custom-provider.js";
import { headerRow, modelRow } from "./dialog-custom-provider-form.js";
import { SettingsList } from "./settings-list.js";
import { SettingsModels } from "./settings-models.js";
const PROVIDER_NOTES = [];
// Which preset a configured provider came from, shown as a small tag next to the
// (free-form) profile name. The providerID root encodes the chosen preset
// (deriveProviderID in dialog-custom-provider); anything else is "カスタム".
const PRESET_LABELS = {
  ollama: "Ollama",
  lmstudio: "LM Studio",
  llamacpp: "llama.cpp",
  vllm: "vLLM",
  jan: "Jan"
};
const presetLabel = providerID => {
  const root = (providerID || "").replace(/-\d+$/, "");
  return PRESET_LABELS[root] || "カスタム";
};
export const SettingsProviders = () => {
  const dialog = useDialog();
  const language = useLanguage();
  const providers = useProviders();
  const controller = useProvidersController();
  // Inline add/edit form state. null = show the list; otherwise { initial }.
  const [editor, setEditor] = createSignal(null);
  const connected = createMemo(() => {
    return providers.connected().filter(p => p.id !== "opencode" || Object.values(p.models).find(m => m.cost?.input));
  });
  // Popular cloud providers are not shown (local-LLM focus); only the connected
  // list + the custom (preset/URL) add form remain.
  const popular = createMemo(() => []);
  const source = item => {
    if (!("source" in item)) return;
    const value = item.source;
    if (value === "env" || value === "api" || value === "config" || value === "custom") return value;
    return;
  };
  const type = item => {
    const current = source(item);
    if (current === "env") return language.t("settings.providers.tag.environment");
    if (current === "api") return language.t("provider.connect.method.apiKey");
    if (current === "config") {
      if (isConfigCustom(item.id)) return language.t("settings.providers.tag.custom");
      return language.t("settings.providers.tag.config");
    }
    if (current === "custom") return language.t("settings.providers.tag.custom");
    return language.t("settings.providers.tag.other");
  };
  const canDisconnect = item => source(item) !== "env";
  // Re-open the custom-provider dialog pre-filled, so a configured LLM server
  // (URL / models) can be edited later.
  const editCustom = providerID => {
    const cfg = controller.getCustom(providerID);
    if (!cfg) return;
    const models = Object.entries(cfg.models || {}).map(([id, m]) => ({ ...modelRow(), id, name: m && m.name ? m.name : id, origId: id, origName: m && m.name ? m.name : id }));
    const headers = Object.entries(cfg.options?.headers || {}).map(([k, v]) => ({ ...headerRow(), key: k, value: String(v) }));
    setEditor({
      initial: {
        providerID,
        name: cfg.name || providerID,
        baseURL: cfg.options?.baseURL || "",
        apiKey: "",
        models: models.length ? models : [modelRow()],
        headers: headers.length ? headers : [headerRow()],
        err: {}
      }
    });
  };
  const note = id => PROVIDER_NOTES.find(item => item.match(id))?.key;
  const isConfigCustom = providerID => controller.isConfigCustom(providerID);
  // Confirm via a toast (切断する / キャンセル) before disconnecting a provider.
  const confirmDisconnect = (providerID, name) => {
    showToast({
      variant: "warning",
      title: "プロバイダを切断しますか？",
      description: `「${name}」を切断します。`,
      persistent: true,
      actions: [{ label: "切断する", variant: "danger", onClick: () => void disconnect(providerID, name) }, { label: "キャンセル", variant: "secondary", onClick: () => {} }]
    });
  };
  const disconnect = async (providerID, name) => {
    try {
      await controller.removeProvider(providerID);
      showToast({
        variant: "success",
        icon: "circle-check",
        title: language.t("provider.disconnect.toast.disconnected.title", {
          provider: name
        }),
        description: language.t("provider.disconnect.toast.disconnected.description", {
          provider: name
        })
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      showToast({
        title: language.t("common.requestFailed"),
        description: message
      });
    }
  };
  const renderList = () => {
    var _el$ = _tmpl$2(),
      _el$2 = _el$.firstChild,
      _el$3 = _el$2.firstChild,
      _el$4 = _el$3.firstChild,
      _el$5 = _el$2.nextSibling,
      _el$6 = _el$5.firstChild,
      _el$7 = _el$6.firstChild,
      _el$8 = _el$6.nextSibling,
      _el$9 = _el$8.firstChild;
    _$insert(_el$4, () => language.t("settings.providers.title"));
    _$insert(_el$7, () => language.t("settings.providers.section.connected"));
    // Each connected provider is its own card, stacked with a gap (no single
    // container / divider lines).
    var _list = document.createElement("div");
    _list.className = "d-flex flex-column gap-2";
    _$insert(_list, _$createComponent(Show, {
          get when() {
            return connected().length > 0;
          },
          get fallback() {
            return (() => {
              var _el$13 = _tmpl$3();
              _$insert(_el$13, () => language.t("settings.providers.connected.empty"));
              return _el$13;
            })();
          },
          get children() {
            return _$createComponent(For, {
              get each() {
                return connected();
              },
              children: item => (() => {
                var _el$14 = _tmpl$4(),
                  _el$15 = _el$14.firstChild,
                  _el$16 = _el$15.firstChild;
                _$insert(_el$15, _$createComponent(ProviderIcon, {
                  get id() {
                    return item.id;
                  },
                  "class": "size-5 shrink-0 text-secondary"
                }), _el$16);
                _$insert(_el$16, () => item.name);
                // Tag: which preset this profile was created from (Ollama / カスタム…).
                _$insert(_el$15, _$createComponent(Tag, {
                  get children() {
                    return presetLabel(item.id);
                  }
                }), null);
                // Server URL (where this provider points), next to the name.
                _$insert(_el$15, (() => {
                  const meta = document.createElement("span");
                  meta.className = "small fw-normal text-secondary text-truncate";
                  meta.style.maxWidth = "460px";
                  const cfg = controller.getCustom(item.id);
                  meta.textContent = (cfg && cfg.options && cfg.options.baseURL) || "";
                  return meta;
                })(), null);
                var _actions = document.createElement("div");
                _actions.className = "d-flex align-items-center gap-1 flex-shrink-0";
                _$insert(_actions, _$createComponent(Show, {
                  get when() {
                    return isConfigCustom(item.id);
                  },
                  get children() {
                    return _$createComponent(IconButton, {
                      icon: "pencil-line",
                      variant: "ghost",
                      get title() {
                        return language.t("common.edit");
                      },
                      get ["aria-label"]() {
                        return language.t("common.edit");
                      },
                      onClick: () => editCustom(item.id)
                    });
                  }
                }), null);
                _$insert(_actions, _$createComponent(Show, {
                  get when() {
                    return canDisconnect(item);
                  },
                  get fallback() {
                    return (() => {
                      var _el$17 = _tmpl$5();
                      _$insert(_el$17, () => language.t("settings.providers.connected.environmentDescription"));
                      return _el$17;
                    })();
                  },
                  get children() {
                    return _$createComponent(IconButton, {
                      icon: "trash",
                      variant: "ghost",
                      get title() {
                        return language.t("common.disconnect");
                      },
                      get ["aria-label"]() {
                        return language.t("common.disconnect");
                      },
                      onClick: () => confirmDisconnect(item.id, item.name)
                    });
                  }
                }), null);
                _$insert(_el$14, _actions, null);
                return _el$14;
              })()
            });
          }
        }));
    _$insert(_el$6, _list, null);
    _$insert(_el$9, () => "プロバイダを追加");
    // A single, clear "追加" button — picking a preset / entering a URL all
    // happens in the inline form (no separate modal, no descriptive card).
    _$insert(_el$8, _$createComponent(Button, {
      size: "large",
      variant: "secondary",
      icon: "plus-small",
      "class": "self-start",
      onClick: () => setEditor({}),
      get children() {
        return "追加";
      }
    }), null);
    // Per-provider model list + pull live inside each provider's edit form
    // (behind the pencil), not here in the list view.
    return _el$;
  };
  // List view, or the inline add/edit form when one is open. Inline keeps the
  // surrounding デスクトップ/LLM nav in place (no modal switch).
  return _$createComponent(Show, {
    get when() {
      return editor();
    },
    keyed: true,
    get fallback() {
      return renderList();
    },
    children: ed => _$createComponent(DialogCustomProvider, {
      inline: true,
      get initial() {
        return ed.initial;
      },
      onClose: () => setEditor(null),
      onDone: () => setEditor(null)
    })
  });
};