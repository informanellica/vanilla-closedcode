// Model-selection UI built on the vanilla Popover component, originally derived
// from an @kobalte/core Popover. Derivative of @kobalte/core (MIT License,
// Copyright (c) 2024 jer3m01 <jer3m01@jer3m01.com>). See THIRD-PARTY-NOTICES.md.
import { Popover } from "@/vendor/ui/components/popover.js";
import { createComponent, createMemo, createRoot, getOwner, runWithOwner } from "../lib/reactivity.js";
import { createStore } from "../lib/store.js";
import { useLocal } from "@/context/local.js";
import { useDialog } from "@/lib/dialog.js";
import { popularProviders } from "@/hooks/use-providers.js";
import { Button } from "@/bs/button.js";
import { IconButton } from "@/bs/icon-button.js";
import { Tag } from "@/bs/tag.js";
import { Dialog } from "@/bs/dialog.js";
import { List } from "@/bs/list.js";
import { Tooltip } from "@/bs/tooltip.js";
import { ModelTooltip } from "./model-tooltip.js";
import { useLanguage } from "@/context/language.js";
import { isLocalURL } from "@/utils/is-local-url.js";

/** @file Model-selection UI: a searchable, grouped list of configured local models, rendered both as a Popover (ModelSelectorPopover) and a Dialog (DialogSelectModel), with shortcuts to connect/manage providers. */

/**
 * Whether a model is free (cost-free opencode model).
 * @param {string} provider - The provider id.
 * @param {Object} cost - The model cost descriptor (may have an `input` price).
 * @returns {boolean} True if the model is treated as free.
 */
const isFree = (provider, cost) => provider === "opencode" && (!cost || cost.input === 0);
/**
 * Whether the provider points at a local endpoint (by its baseURL).
 * @param {Object} options - Provider options that may contain a `baseURL` string.
 * @returns {boolean} True if the baseURL is a local URL.
 */
function isLocalProvider(options) {
  const baseURL = options?.["baseURL"];
  if (typeof baseURL !== "string" || !baseURL) return false;
  return isLocalURL(baseURL);
}
/**
 * Searchable, provider-grouped list of locally-configured models with hover
 * tooltips and free/latest tags. Selecting a model sets it as current.
 * @param {Object} props - Component props.
 * @param {Object} props.model - Optional model store (defaults to the local model store).
 * @param {string} props.provider - Optional provider id to scope the list to.
 * @param {*} props.action - Optional action node(s) rendered in the search bar.
 * @param {string} props.class - Optional extra CSS classes for the list.
 * @param {Function} props.onSelect - Called after a model is selected.
 * @returns {Node} The List element.
 */
const ModelList = props => {
  const model = props.model ?? useLocal().model;
  const language = useLanguage();
  // Captured for the tooltip getter below: Tooltip reads `value` from its
  // hover handlers, where Solid's owner is null and ModelTooltip's
  // useLanguage() would throw.
  const owner = getOwner();
  // Local-only fork: list every configured model across all connected
  // providers — the visible() filter hid all but recently-used models, which
  // made the picker look broken / single-model. Provider scoping and the
  // local-endpoint guard stay.
  const models = createMemo(() => {
    // model.list() can contain the same model twice (config-declared entry +
    // API-discovered entry) — dedupe by provider/model id so the picker shows
    // each model once.
    const seen = new Set();
    return model.list().filter(m => {
      const key = `${m.provider.id}/${m.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).filter(m => props.provider ? m.provider.id === props.provider : true).filter(m => isLocalProvider(m.provider.options) || isLocalProvider({
      baseURL: m.api.url
    }));
  });
  return createComponent(List, {
    get ["class"]() {
      return `flex-1 min-h-0 [&_[data-slot=list-scroll]]:flex-1 [&_[data-slot=list-scroll]]:min-h-0 ${props.class ?? ""}`;
    },
    get search() {
      return {
        placeholder: language.t("dialog.model.search.placeholder"),
        autofocus: true,
        // Forward lazily: props.action builds DOM on every read and List
        // re-reads its `search` prop several times per render — an eager
        // read here would build and throw away the action buttons each time.
        get action() {
          return props.action;
        }
      };
    },
    get emptyMessage() {
      return language.t("dialog.model.empty");
    },
    key: x => `${x.provider.id}:${x.id}`,
    items: models,
    get current() {
      return model.current();
    },
    filterKeys: ["provider.name", "name", "id"],
    sortBy: (a, b) => a.name.localeCompare(b.name),
    groupBy: x => x.provider.name,
    sortGroupsBy: (a, b) => {
      const aProvider = a.items[0].provider.id;
      const bProvider = b.items[0].provider.id;
      if (popularProviders.includes(aProvider) && !popularProviders.includes(bProvider)) return -1;
      if (!popularProviders.includes(aProvider) && popularProviders.includes(bProvider)) return 1;
      return popularProviders.indexOf(aProvider) - popularProviders.indexOf(bProvider);
    },
    itemWrapper: (item, node) => createComponent(Tooltip, {
      "class": "w-full",
      placement: "right-start",
      gutter: 12,
      get value() {
        // Accessed from Tooltip's pointerenter path (no Solid owner): restore
        // ModelList's owner so useLanguage() inside ModelTooltip resolves its
        // context, and dispose the one-shot root immediately so the tooltip's
        // render effects (they read the i18n dict signal) don't accumulate as
        // ownerless subscriptions on every hover. Content is static per item
        // and Tooltip clones the node anyway.
        return runWithOwner(owner, () => createRoot(dispose => {
          const el = createComponent(ModelTooltip, {
            model: item,
            get latest() {
              return item.latest;
            },
            get free() {
              return isFree(item.provider.id, item.cost);
            }
          });
          dispose();
          return el;
        }));
      },
      children: node
    }),
    onSelect: x => {
      model.set(x ? {
        modelID: x.id,
        providerID: x.provider.id
      } : undefined, {
        recent: true
      });
      props.onSelect();
    },
    children: i => {
      // Compiled _tmpl$: a name span followed by optional free/latest tags.
      // List rebuilds rows on every render and items are plain memo copies,
      // so the name text and the Show conditions are static per row.
      const row = document.createElement("div");
      row.className = "w-100 d-flex align-items-center gap-x-2 fw-normal";
      const name = document.createElement("span");
      name.className = "truncate";
      // Model names are external strings — set via textContent, never markup.
      name.textContent = i.name;
      row.appendChild(name);
      if (isFree(i.provider.id, i.cost)) {
        row.appendChild(createComponent(Tag, {
          get children() {
            return language.t("model.tag.free");
          }
        }));
      }
      if (i.latest) {
        row.appendChild(createComponent(Tag, {
          get children() {
            return language.t("model.tag.latest");
          }
        }));
      }
      return row;
    }
  });
};
/**
 * Popover wrapper around ModelList: a click-toggle trigger that opens a panel
 * with the model picker and shortcuts to connect/manage providers in Settings.
 * @param {Object} props - Component props.
 * @param {*} props.children - The trigger content.
 * @param {string} props.provider - Optional provider id to scope the list.
 * @param {Object} props.model - Optional model store passed to ModelList.
 * @param {string} props.triggerAs - Optional element/component to render the trigger as (defaults to "div").
 * @param {Object} props.triggerProps - Optional props forwarded to the trigger.
 * @param {Function} props.onClose - Called with the dismiss reason ("escape"/"select").
 * @returns {Node} The Popover element.
 */
export function ModelSelectorPopover(props) {
  const [store, setStore] = createStore({
    open: false,
    dismiss: null
  });
  const dialog = useDialog();
  /**
   * Close the popover, recording the dismiss reason.
   * @param {string} dismiss - The dismiss reason.
   * @returns {void}
   */
  const close = dismiss => {
    setStore("dismiss", dismiss);
    setStore("open", false);
  };
  /**
   * Close the popover and open Settings on the connection (LLM) tab to manage models.
   * @returns {void}
   */
  const handleManage = () => {
    close("manage");
    // Model management lives in Settings → LLM → サーバー・プロバイダ now
    // (no separate "manage models" modal).
    void import("./dialog-settings.js").then(x => {
      dialog.show(() => createComponent(x.DialogSettings, {
        tab: "connection"
      }));
    });
  };
  /**
   * Close the popover and open Settings on the connection (LLM) tab to connect a provider.
   * @returns {void}
   */
  const handleConnectProvider = () => {
    close("provider");
    // Pulling/adding models and connecting providers all happen in Settings →
    // LLM → サーバー・プロバイダ now (no separate modal).
    void import("./dialog-settings.js").then(x => {
      dialog.show(() => createComponent(x.DialogSettings, {
        tab: "connection"
      }));
    });
  };
  const language = useLanguage();
  // Vanilla Popover (was the original third-party popover): controlled open, click-toggle
  // trigger, Esc/outside dismissal + flip positioning handled by the component.
  // The dismiss reason (escape/outside) arrives via onDismiss; select/manage
  // reasons are set on `store` by the handlers below before they close.
  /**
   * Forward escape/select dismissals to the caller's onClose.
   * @param {string} dismiss - The dismiss reason.
   * @returns {void}
   */
  const onClose = dismiss => {
    if (dismiss === "escape" || dismiss === "select") {
      props.onClose?.(dismiss);
    }
  };
  /**
   * Build the popover body (sr-only title + ModelList with search-bar actions)
   * while open; returns undefined when closed.
   * @returns {Array|undefined} The body nodes, or undefined when closed.
   */
  // Presence-gated content thunk: re-evaluated by the Popover's body insert()
  // only while open (the established insert() exception). The sr-only title and
  // the ModelList are rebuilt per open, matching the original content remount.
  const renderBody = () => {
    if (!store.open) return undefined;
    const title = document.createElement("h2");
    title.className = "sr-only";
    title.textContent = language.t("dialog.model.select.title");
    return [title, createComponent(ModelList, {
                get provider() {
                  return props.provider;
                },
                get model() {
                  return props.model;
                },
                onSelect: () => {
                  close("select");
                  onClose("select");
                },
                "class": "p-1",
                get action() {
                  // Compiled _tmpl$2: the two tooltip-wrapped icon buttons in
                  // the search bar. Rebuilt on each List render, matching the
                  // compiled IIFE.
                  const actions = document.createElement("div");
                  actions.className = "d-flex align-items-center gap-1";
                  // Eager Node children: Tooltip probes `children` more than
                  // once, so a getter would build (and discard) extra
                  // IconButtons. aria-label is read eagerly too — this DOM is
                  // rebuilt per List render, which can run outside any Solid
                  // owner, and a getter prop would leave IconButton's render
                  // effect subscribed to the i18n dict signal with no owner
                  // to dispose it.
                  actions.appendChild(createComponent(Tooltip, {
                    placement: "top",
                    value: "モデルを取得・管理 (設定)",
                    children: createComponent(IconButton, {
                      icon: "plus-small",
                      variant: "ghost",
                      iconSize: "normal",
                      "class": "size-6",
                      "aria-label": "モデルを取得・管理",
                      onClick: handleConnectProvider
                    })
                  }));
                  actions.appendChild(createComponent(Tooltip, {
                    placement: "top",
                    get value() {
                      return language.t("dialog.model.manage");
                    },
                    children: createComponent(IconButton, {
                      icon: "sliders",
                      variant: "ghost",
                      iconSize: "normal",
                      "class": "size-6",
                      "aria-label": language.t("dialog.model.manage"),
                      onClick: handleManage
                    })
                  }));
                  return actions;
                }
              })];
  };
  return createComponent(Popover, {
    get open() {
      return store.open;
    },
    onOpenChange: next => {
      if (next) setStore("dismiss", null);
      setStore("open", next);
    },
    // Esc / outside-click dismissal originates inside the Popover; forward the
    // reason so escape still notifies the caller (matching onCloseAutoFocus).
    onDismiss: reason => {
      setStore("dismiss", reason);
      onClose(reason);
    },
    modal: false,
    placement: "top-start",
    gutter: 4,
    // ModelList autofocuses its own search input — don't steal focus to the panel.
    noAutoFocus: true,
    get triggerAs() {
      return props.triggerAs ?? "div";
    },
    get triggerProps() {
      return props.triggerProps;
    },
    "class": "w-72 h-80 d-flex flex-column p-2 rounded-2 border bg-body-tertiary shadow-md z-50 outline-none overflow-hidden",
    get trigger() {
      return props.children;
    },
    children: renderBody
  });
}
/**
 * Dialog wrapper around ModelList: a full model picker with a header action to
 * connect a provider and a footer link to manage models in Settings.
 * @param {Object} props - Component props.
 * @param {string} props.provider - Optional provider id to scope the list.
 * @param {Object} props.model - Optional model store passed to ModelList.
 * @returns {Node} The Dialog element.
 */
export const DialogSelectModel = props => {
  const dialog = useDialog();
  const language = useLanguage();
  const provider = () => {
    void import("./dialog-settings.js").then(x => {
      dialog.show(() => createComponent(x.DialogSettings, {
        tab: "connection"
      }));
    });
  };
  const manage = () => {
    void import("./dialog-settings.js").then(x => {
      dialog.show(() => createComponent(x.DialogSettings, {
        tab: "connection"
      }));
    });
  };
  // bs/Dialog is vanilla and probes `action`/`children` several times
  // (truthy + typeof/instanceof/Array checks), so unmemoized getters here
  // built whole spare ModelList/Button trees per probe and threw them away.
  let actionEl;
  let bodyEls;
  return createComponent(Dialog, {
    get title() {
      return language.t("dialog.model.select.title");
    },
    get action() {
      return (actionEl ??= createComponent(Button, {
        "class": "h-7 -my-1 fw-medium",
        icon: "plus-small",
        tabIndex: -1,
        onClick: provider,
        get children() {
          return language.t("command.provider.connect");
        }
      }));
    },
    get children() {
      return (bodyEls ??= [createComponent(ModelList, {
        get provider() {
          return props.provider;
        },
        get model() {
          return props.model;
        },
        onSelect: () => dialog.close()
      }), createComponent(Button, {
        variant: "ghost",
        "class": "ml-3 mt-5 mb-6 text-body self-start",
        onClick: manage,
        get children() {
          return language.t("dialog.model.manage");
        }
      })]);
    }
  });
};
