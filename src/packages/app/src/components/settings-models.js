/** @file Models settings pane: a searchable list of provider models grouped by provider, each with a visibility toggle. */
import { useFilteredList } from "@/lib/hooks.js";
import { ProviderIcon } from "@/vendor/ui/components/provider-icon.js";
import { Switch } from "@/bs/switch.js";
import { Icon } from "@/bs/icon.js";
import { IconButton } from "@/bs/icon-button.js";
import { TextField } from "@/bs/text-field.js";
import { createComponent, createEffect } from "../lib/reactivity.js";
import { useLanguage } from "@/context/language.js";
import { useModels } from "@/context/models.js";
import { popularProviders } from "@/hooks/use-providers.js";
import { SettingsList } from "./settings-list.js";

/**
 * Build a detached DOM element from a static HTML string.
 * @param {string} html - The HTML markup (no untrusted interpolation).
 * @returns {HTMLElement} The first element child of the parsed markup.
 */
function template(html) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html.trim();
  return wrapper.firstElementChild;
}

/**
 * Build a centered status box with a single label (used for loading/empty states).
 * @param {string} text - The label text.
 * @returns {HTMLElement} The status box element.
 */
const listStateBox = text => {
  const el = template(`
    <div class="d-flex flex-column align-items-center justify-content-center py-12 text-center">
      <span class="fw-normal text-secondary" data-slot="label"></span>
    </div>`);
  el.querySelector('[data-slot="label"]').textContent = text;
  return el;
};

/**
 * Loading placeholder shown while the model list is fetching.
 * @param {Object} props - Props; props.label is the loading message.
 * @returns {HTMLElement} The loading status box.
 */
const ListLoadingState = ({ label }) => listStateBox(label);

/**
 * Empty-state placeholder shown when no models match; echoes the active filter if present.
 * @param {Object} props - Props; props.message is the empty message and props.filter is the current search text.
 * @returns {HTMLElement} The empty status box.
 */
const ListEmptyState = ({ message, filter }) => {
  const el = listStateBox(message);
  if (filter) {
    const quoted = document.createElement("span");
    quoted.className = "fw-normal text-body-emphasis mt-1";
    quoted.textContent = `"${filter}"`;
    el.appendChild(quoted);
  }
  return el;
};

/**
 * Models settings pane. Renders a search field and a list of models grouped by provider (providers
 * sorted by popularity then name), each row exposing a visibility toggle. When props.providerId is set,
 * only that provider's models are shown (used inside a provider's edit form).
 * @param {Object} props - Component props; optional props.providerId scopes the list to one provider.
 * @returns {HTMLElement} The settings pane root element.
 */
export const SettingsModels = props => {
  const language = useLanguage();
  const models = useModels();
  const list = useFilteredList({
    // When a providerId is given (per-provider model list inside that provider's
    // edit form), show only that provider's models.
    items: _filter => props?.providerId ? models.list().filter(m => m.provider.id === props.providerId) : models.list(),
    key: x => `${x.provider.id}:${x.id}`,
    filterKeys: ["provider.name", "name", "id"],
    sortBy: (a, b) => a.name.localeCompare(b.name),
    groupBy: x => x.provider.id,
    sortGroupsBy: (a, b) => {
      const aIndex = popularProviders.indexOf(a.category);
      const bIndex = popularProviders.indexOf(b.category);
      const aPopular = aIndex >= 0;
      const bPopular = bIndex >= 0;
      if (aPopular && !bPopular) return -1;
      if (!aPopular && bPopular) return 1;
      if (aPopular && bPopular) return aIndex - bIndex;
      const aName = a.items[0].provider.name;
      const bName = b.items[0].provider.name;
      return aName.localeCompare(bName);
    }
  });

  const root = template(`
    <div class="d-flex flex-column h-full overflow-y-auto no-scrollbar px-4 pb-10 sm:px-10 sm:pb-10">
      <div class="sticky top-0 z-10 bg-[linear-gradient(to_bottom,var(--surface-stronger-non-alpha)_calc(100%_-_24px),transparent)]">
        <div class="d-flex flex-column gap-4 pt-6 pb-6 max-w-[720px]">
          <h2 class="fs-6 fw-medium text-body-emphasis" data-slot="title"></h2>
          <div class="d-flex align-items-center gap-2 px-3 h-9 rounded-3 bg-body-tertiary" data-slot="search"></div>
        </div>
      </div>
      <div class="d-flex flex-column gap-8 max-w-[720px]" data-slot="content"></div>
    </div>`);
  const title = root.querySelector('[data-slot="title"]');
  const search = root.querySelector('[data-slot="search"]');
  const content = root.querySelector('[data-slot="content"]');

  createEffect(() => { title.textContent = language.t("settings.models.title"); });

  search.appendChild(createComponent(Icon, {
    name: "magnifying-glass",
    class: "text-secondary flex-shrink-0"
  }));
  search.appendChild(createComponent(TextField, {
    variant: "ghost",
    type: "text",
    get value() { return list.filter(); },
    get onChange() { return list.onInput; },
    get placeholder() { return language.t("dialog.model.search.placeholder"); },
    spellcheck: false,
    autocorrect: "off",
    autocomplete: "off",
    autocapitalize: "off",
    class: "flex-1"
  }));
  // The clear button only exists while a filter is set.
  const clearSlot = document.createElement("div");
  clearSlot.style.display = "contents";
  search.appendChild(clearSlot);
  createEffect(() => {
    if (list.filter()) {
      clearSlot.replaceChildren(createComponent(IconButton, {
        icon: "circle-x",
        variant: "ghost",
        get onClick() { return list.clear; }
      }));
    } else {
      clearSlot.replaceChildren();
    }
  });

  /**
   * Build a provider group section: a header (icon + provider name) and a SettingsList of model rows,
   * each row showing the model name and a visibility Switch bound to the models context.
   * @param {Object} group - A group {category (provider id), items (Array of model records)}.
   * @returns {HTMLElement} The group section element.
   */
  const buildGroup = group => {
    const section = template(`
      <div class="d-flex flex-column gap-1">
        <div class="d-flex align-items-center gap-2 pb-2" data-slot="head">
          <span class="fw-medium text-body-emphasis" data-slot="provider-name"></span>
        </div>
      </div>`);
    const head = section.querySelector('[data-slot="head"]');
    const nameEl = section.querySelector('[data-slot="provider-name"]');
    head.insertBefore(createComponent(ProviderIcon, {
      get id() { return group.category; },
      class: "size-5 shrink-0 text-secondary"
    }), nameEl);
    nameEl.textContent = group.items[0].provider.name;

    const rows = group.items.map(item => {
      const key = {
        providerID: item.provider.id,
        modelID: item.id
      };
      const row = template(`
        <div class="d-flex align-items-center justify-content-between gap-4 p-4 rounded-3 bg-body-tertiary">
          <div class="min-w-0"><span class="fw-normal text-body-emphasis truncate block" data-slot="name"></span></div>
          <div class="flex-shrink-0" data-slot="switch"></div>
        </div>`);
      row.querySelector('[data-slot="name"]').textContent = item.name;
      row.querySelector('[data-slot="switch"]').appendChild(createComponent(Switch, {
        get checked() { return models.visible(key); },
        onChange: checked => {
          models.setVisibility(key, checked);
        },
        hideLabel: true,
        get children() { return item.name; }
      }));
      return row;
    });
    section.appendChild(createComponent(SettingsList, { children: rows }));
    return section;
  };

  // Loading -> empty -> grouped list; rebuilt when the data, the filter or the
  // locale changes.
  createEffect(() => {
    if (list.grouped.loading) {
      content.replaceChildren(ListLoadingState({
        label: `${language.t("common.loading")}${language.t("common.loading.ellipsis")}`
      }));
      return;
    }
    if (list.flat().length === 0) {
      content.replaceChildren(ListEmptyState({
        message: language.t("dialog.model.empty"),
        filter: list.filter()
      }));
      return;
    }
    content.replaceChildren(...list.grouped.latest.map(buildGroup));
  });

  return root;
};
