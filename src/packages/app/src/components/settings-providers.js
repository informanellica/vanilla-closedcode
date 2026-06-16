import { Button } from "@/bs/button.js";
import { IconButton } from "@/bs/icon-button.js";
import { useDialog } from "@/lib/dialog.js";
import { ProviderIcon } from "@/vendor/ui/components/provider-icon.js";
import { Tag } from "@/bs/tag.js";
import { showToast } from "@/lib/toast.js";
import { popularProviders, useProviders } from "@/hooks/use-providers.js";
import { createMemo, createSignal, createEffect, createComponent } from "../lib/reactivity.js";
import { useLanguage } from "@/context/language.js";
import { useProvidersController } from "@/controllers/providers.js";
import { DialogConnectProvider } from "./dialog-connect-provider.js";
import { DialogSelectProvider } from "./dialog-select-provider.js";
import { DialogCustomProvider } from "./dialog-custom-provider.js";
import { headerRow, modelRow } from "./dialog-custom-provider-form.js";
import { SettingsList } from "./settings-list.js";
import { SettingsModels } from "./settings-models.js";

/** @file Providers settings pane: lists connected LLM providers and hosts the inline add/edit (preset/URL) form. */

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
/**
 * Map a provider ID to its preset display label (Ollama / vLLM / ... or "カスタム").
 * @param {string} providerID - The configured provider ID (the preset root plus an optional -N suffix).
 * @returns {string} The preset label, or the custom fallback.
 */
const presetLabel = providerID => {
  const root = (providerID || "").replace(/-\d+$/, "");
  return PRESET_LABELS[root] || "カスタム";
};

/**
 * Build a detached element from an HTML string (trimmed, first child returned).
 * @param {string} html - Markup for a single root element.
 * @returns {Element} The constructed element.
 */
function template(html) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html.trim();
  return wrapper.firstElementChild;
}

/**
 * Providers settings view. Renders the connected-provider list (icon, name, preset
 * tag, server URL, edit/disconnect actions) and an "追加" button; opening the inline
 * add/edit form swaps the list for DialogCustomProvider in place.
 * @returns {Node} The pass-through (display:contents) container hosting the list or the editor.
 */
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
  /**
   * Read a provider item's recognized connection source.
   * @param {Object} item - A provider record.
   * @returns {string} One of "env" | "api" | "config" | "custom", or undefined when unset/unknown.
   */
  const source = item => {
    if (!("source" in item)) return;
    const value = item.source;
    if (value === "env" || value === "api" || value === "config" || value === "custom") return value;
    return;
  };
  /**
   * Localized tag text describing how a provider was configured (environment / API key / config / custom).
   * @param {Object} item - A provider record.
   * @returns {string} The translated tag label.
   */
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
  /**
   * Whether a provider may be disconnected (environment-provided ones may not).
   * @param {Object} item - A provider record.
   * @returns {boolean} True when the provider can be removed by the user.
   */
  const canDisconnect = item => source(item) !== "env";
  // Re-open the custom-provider dialog pre-filled, so a configured LLM server
  // (URL / models) can be edited later.
  /**
   * Open the inline editor pre-filled from a saved custom provider's config
   * (name, base URL, models and headers).
   * @param {string} providerID - The custom provider's ID.
   * @returns {void}
   */
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
  /**
   * Look up the i18n note key for a provider, if any preset note matches.
   * @param {string} id - The provider ID.
   * @returns {string} The translation key, or undefined.
   */
  const note = id => PROVIDER_NOTES.find(item => item.match(id))?.key;
  /**
   * Whether a config-sourced provider is actually a user custom provider.
   * @param {string} providerID - The provider ID.
   * @returns {boolean} True when it is a config-defined custom provider.
   */
  const isConfigCustom = providerID => controller.isConfigCustom(providerID);
  // Confirm via a toast (切断する / キャンセル) before disconnecting a provider.
  /**
   * Show a persistent confirmation toast before disconnecting a provider.
   * @param {string} providerID - The provider to disconnect.
   * @param {string} name - The provider's display name (shown in the prompt).
   * @returns {void}
   */
  const confirmDisconnect = (providerID, name) => {
    showToast({
      variant: "warning",
      title: "プロバイダを切断しますか？",
      description: `「${name}」を切断します。`,
      persistent: true,
      actions: [{ label: "切断する", variant: "danger", onClick: () => void disconnect(providerID, name) }, { label: "キャンセル", variant: "secondary", onClick: () => {} }]
    });
  };
  /**
   * Remove a provider and surface a success/error toast.
   * @param {string} providerID - The provider to remove.
   * @param {string} name - The provider's display name (shown in the toast).
   * @returns {Promise<void>} Resolves once removal and toast have run.
   */
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

  // One connected-provider card (icon, name, preset tag, server URL, actions).
  /**
   * Build one connected-provider card element (icon, name, preset tag, server URL,
   * and edit/disconnect actions or an environment-managed note).
   * @param {Object} item - A connected provider record.
   * @returns {Element} The card element.
   */
  const buildCard = item => {
    const card = template(`
      <div class="group d-flex flex-wrap align-items-center justify-content-between gap-4 min-h-16 py-3 px-4 bg-body-tertiary rounded-3">
        <div class="d-flex align-items-center gap-3 min-w-0" data-slot="info">
          <span class="fw-medium text-body-emphasis truncate" data-slot="name"></span>
        </div>
        <div class="d-flex align-items-center gap-1 flex-shrink-0" data-slot="actions"></div>
      </div>`);
    const info = card.querySelector('[data-slot="info"]');
    const nameEl = card.querySelector('[data-slot="name"]');
    const actions = card.querySelector('[data-slot="actions"]');

    info.insertBefore(createComponent(ProviderIcon, {
      get id() { return item.id; },
      class: "size-5 shrink-0 text-secondary"
    }), nameEl);
    nameEl.textContent = item.name;
    // Tag: which preset this profile was created from (Ollama / カスタム…).
    info.appendChild(createComponent(Tag, {
      get children() { return presetLabel(item.id); }
    }));
    // Server URL (where this provider points), next to the name.
    const meta = document.createElement("span");
    meta.className = "small fw-normal text-secondary text-truncate";
    meta.style.maxWidth = "460px";
    const cfg = controller.getCustom(item.id);
    meta.textContent = (cfg && cfg.options && cfg.options.baseURL) || "";
    info.appendChild(meta);

    if (isConfigCustom(item.id)) {
      actions.appendChild(createComponent(IconButton, {
        icon: "pencil-line",
        variant: "ghost",
        get title() { return language.t("common.edit"); },
        get ["aria-label"]() { return language.t("common.edit"); },
        onClick: () => editCustom(item.id)
      }));
    }
    if (canDisconnect(item)) {
      actions.appendChild(createComponent(IconButton, {
        icon: "trash",
        variant: "ghost",
        get title() { return language.t("common.disconnect"); },
        get ["aria-label"]() { return language.t("common.disconnect"); },
        onClick: () => confirmDisconnect(item.id, item.name)
      }));
    } else {
      const env = document.createElement("span");
      env.className = "fw-normal text-body opacity-0 group-hover:opacity-100 transition-opacity duration-200 pr-3 cursor-default";
      env.textContent = language.t("settings.providers.connected.environmentDescription");
      actions.appendChild(env);
    }
    return card;
  };

  /**
   * Build the list view: title, the connected-providers section (cards or an empty
   * state, kept live via effects) and the "追加" button that opens the inline form.
   * @returns {Element} The list-view root element.
   */
  const renderList = () => {
    const root = template(`
      <div class="d-flex flex-column h-full overflow-y-auto no-scrollbar px-4 pb-10 sm:px-10 sm:pb-10">
        <div class="sticky top-0 z-10 bg-[linear-gradient(to_bottom,var(--surface-stronger-non-alpha)_calc(100%_-_24px),transparent)]">
          <div class="d-flex flex-column gap-1 pt-6 pb-8 max-w-[720px]">
            <h2 class="fs-6 fw-medium text-body-emphasis" data-slot="title"></h2>
          </div>
        </div>
        <div class="d-flex flex-column gap-8 max-w-[720px]">
          <div class="d-flex flex-column gap-1" data-component="connected-providers-section">
            <h3 class="fw-medium text-body-emphasis pb-2" data-slot="connected-title"></h3>
            <div class="d-flex flex-column gap-2" data-slot="connected-list"></div>
          </div>
          <div class="d-flex flex-column gap-1" data-slot="add-section">
            <h3 class="fw-medium text-body-emphasis pb-2" data-slot="add-title"></h3>
          </div>
        </div>
      </div>`);
    const title = root.querySelector('[data-slot="title"]');
    const connectedTitle = root.querySelector('[data-slot="connected-title"]');
    const list = root.querySelector('[data-slot="connected-list"]');
    const addSection = root.querySelector('[data-slot="add-section"]');
    const addTitle = root.querySelector('[data-slot="add-title"]');

    createEffect(() => { title.textContent = language.t("settings.providers.title"); });
    createEffect(() => { connectedTitle.textContent = language.t("settings.providers.section.connected"); });
    addTitle.textContent = "プロバイダを追加";

    // Each connected provider is its own card, stacked with a gap (no single
    // container / divider lines). Rebuilt when the list or the locale changes.
    createEffect(() => {
      const items = connected();
      if (items.length === 0) {
        const empty = template(`<div class="py-4 fw-normal text-secondary"></div>`);
        empty.textContent = language.t("settings.providers.connected.empty");
        list.replaceChildren(empty);
        return;
      }
      list.replaceChildren(...items.map(buildCard));
    });

    // A single, clear "追加" button — picking a preset / entering a URL all
    // happens in the inline form (no separate modal, no descriptive card).
    addSection.appendChild(createComponent(Button, {
      size: "large",
      variant: "secondary",
      icon: "plus-small",
      class: "self-start",
      onClick: () => setEditor({}),
      get children() { return "追加"; }
    }));
    // Per-provider model list + pull live inside each provider's edit form
    // (behind the pencil), not here in the list view.
    return root;
  };

  // List view, or the inline add/edit form when one is open (Show keyed
  // semantics: the form remounts whenever the editor payload changes). Inline
  // keeps the surrounding デスクトップ/LLM nav in place (no modal switch).
  const container = document.createElement("div");
  // Pass-through wrapper: the original returned the view root directly, so
  // this must not introduce a layout box of its own.
  container.style.display = "contents";
  createEffect(() => {
    const ed = editor();
    if (ed) {
      container.replaceChildren(createComponent(DialogCustomProvider, {
        inline: true,
        get initial() { return ed.initial; },
        onClose: () => setEditor(null),
        onDone: () => setEditor(null)
      }));
    } else {
      container.replaceChildren(renderList());
    }
  });
  return container;
};
