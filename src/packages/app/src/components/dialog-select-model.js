import { Popover as Kobalte } from "@kobalte/core/popover";
import { createComponent, createMemo, createRoot, getOwner, mergeProps, runWithOwner } from "solid-js";
import { createStore } from "solid-js/store";
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
const isFree = (provider, cost) => provider === "opencode" && (!cost || cost.input === 0);
function isLocalProvider(options) {
  const baseURL = options?.["baseURL"];
  if (typeof baseURL !== "string" || !baseURL) return false;
  return isLocalURL(baseURL);
}
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
export function ModelSelectorPopover(props) {
  const [store, setStore] = createStore({
    open: false,
    dismiss: null
  });
  const dialog = useDialog();
  const close = dismiss => {
    setStore("dismiss", dismiss);
    setStore("open", false);
  };
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
  // Kobalte Popover stays a Solid component tree (presence-gated Portal /
  // Content need Solid's lifecycle); only the search-action DOM is vanilla.
  return createComponent(Kobalte, {
    get open() {
      return store.open;
    },
    onOpenChange: next => {
      if (next) setStore("dismiss", null);
      setStore("open", next);
    },
    modal: false,
    placement: "top-start",
    gutter: 4,
    get children() {
      return [createComponent(Kobalte.Trigger, mergeProps({
        get as() {
          return props.triggerAs ?? "div";
        }
      }, () => props.triggerProps, {
        get children() {
          return props.children;
        }
      })), createComponent(Kobalte.Portal, {
        get children() {
          return createComponent(Kobalte.Content, {
            "class": "w-72 h-80 d-flex flex-column p-2 rounded-2 border bg-body-tertiary shadow-md z-50 outline-none overflow-hidden",
            onEscapeKeyDown: event => {
              close("escape");
              event.preventDefault();
              event.stopPropagation();
            },
            onPointerDownOutside: () => close("outside"),
            onFocusOutside: () => close("outside"),
            onCloseAutoFocus: event => {
              const dismiss = store.dismiss;
              if (dismiss === "outside") event.preventDefault();
              if (dismiss === "escape" || dismiss === "select") {
                event.preventDefault();
                props.onClose?.(dismiss);
              }
              setStore("dismiss", null);
            },
            get children() {
              return [createComponent(Kobalte.Title, {
                "class": "sr-only",
                get children() {
                  return language.t("dialog.model.select.title");
                }
              }), createComponent(ModelList, {
                get provider() {
                  return props.provider;
                },
                get model() {
                  return props.model;
                },
                onSelect: () => close("select"),
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
            }
          });
        }
      })];
    }
  });
}
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
