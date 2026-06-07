import { template as _$template } from "solid-js/web";
import { mergeProps as _$mergeProps } from "solid-js/web";
import { memo as _$memo } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<div class="w-100 d-flex align-items-center gap-x-2 fw-normal"><span class=truncate>`),
  _tmpl$2 = /*#__PURE__*/_$template(`<div class="d-flex align-items-center gap-1">`);
import { Popover as Kobalte } from "@kobalte/core/popover";
import { createMemo, Show } from "solid-js";
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
  const models = createMemo(() => model.list().filter(m => model.visible({
    modelID: m.id,
    providerID: m.provider.id
  })).filter(m => props.provider ? m.provider.id === props.provider : true).filter(m => isLocalProvider(m.provider.options) || isLocalProvider({
    baseURL: m.api.url
  })));
  return _$createComponent(List, {
    get ["class"]() {
      return `flex-1 min-h-0 [&_[data-slot=list-scroll]]:flex-1 [&_[data-slot=list-scroll]]:min-h-0 ${props.class ?? ""}`;
    },
    get search() {
      return {
        placeholder: language.t("dialog.model.search.placeholder"),
        autofocus: true,
        action: props.action
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
    itemWrapper: (item, node) => _$createComponent(Tooltip, {
      "class": "w-full",
      placement: "right-start",
      gutter: 12,
      get value() {
        return _$createComponent(ModelTooltip, {
          model: item,
          get latest() {
            return item.latest;
          },
          get free() {
            return isFree(item.provider.id, item.cost);
          }
        });
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
    children: i => (() => {
      var _el$ = _tmpl$(),
        _el$2 = _el$.firstChild;
      _$insert(_el$2, () => i.name);
      _$insert(_el$, _$createComponent(Show, {
        get when() {
          return isFree(i.provider.id, i.cost);
        },
        get children() {
          return _$createComponent(Tag, {
            get children() {
              return language.t("model.tag.free");
            }
          });
        }
      }), null);
      _$insert(_el$, _$createComponent(Show, {
        get when() {
          return i.latest;
        },
        get children() {
          return _$createComponent(Tag, {
            get children() {
              return language.t("model.tag.latest");
            }
          });
        }
      }), null);
      return _el$;
    })()
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
      dialog.show(() => _$createComponent(x.DialogSettings, {
        tab: "connection"
      }));
    });
  };
  const handleConnectProvider = () => {
    close("provider");
    // Pulling/adding models and connecting providers all happen in Settings →
    // LLM → サーバー・プロバイダ now (no separate modal).
    void import("./dialog-settings.js").then(x => {
      dialog.show(() => _$createComponent(x.DialogSettings, {
        tab: "connection"
      }));
    });
  };
  const language = useLanguage();
  return _$createComponent(Kobalte, {
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
      return [_$createComponent(Kobalte.Trigger, _$mergeProps({
        get as() {
          return props.triggerAs ?? "div";
        }
      }, () => props.triggerProps, {
        get children() {
          return props.children;
        }
      })), _$createComponent(Kobalte.Portal, {
        get children() {
          return _$createComponent(Kobalte.Content, {
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
              return [_$createComponent(Kobalte.Title, {
                "class": "sr-only",
                get children() {
                  return language.t("dialog.model.select.title");
                }
              }), _$createComponent(ModelList, {
                get provider() {
                  return props.provider;
                },
                get model() {
                  return props.model;
                },
                onSelect: () => close("select"),
                "class": "p-1",
                get action() {
                  return (() => {
                    var _el$3 = _tmpl$2();
                    _$insert(_el$3, _$createComponent(Tooltip, {
                      placement: "top",
                      value: "モデルを取得・管理 (設定)",
                      get children() {
                        return _$createComponent(IconButton, {
                          icon: "plus-small",
                          variant: "ghost",
                          iconSize: "normal",
                          "class": "size-6",
                          "aria-label": "モデルを取得・管理",
                          onClick: handleConnectProvider
                        });
                      }
                    }), null);
                    _$insert(_el$3, _$createComponent(Tooltip, {
                      placement: "top",
                      get value() {
                        return language.t("dialog.model.manage");
                      },
                      get children() {
                        return _$createComponent(IconButton, {
                          icon: "sliders",
                          variant: "ghost",
                          iconSize: "normal",
                          "class": "size-6",
                          get ["aria-label"]() {
                            return language.t("dialog.model.manage");
                          },
                          onClick: handleManage
                        });
                      }
                    }), null);
                    return _el$3;
                  })();
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
      dialog.show(() => _$createComponent(x.DialogSettings, {
        tab: "connection"
      }));
    });
  };
  const manage = () => {
    void import("./dialog-settings.js").then(x => {
      dialog.show(() => _$createComponent(x.DialogSettings, {
        tab: "connection"
      }));
    });
  };
  return _$createComponent(Dialog, {
    get title() {
      return language.t("dialog.model.select.title");
    },
    get action() {
      return _$createComponent(Button, {
        "class": "h-7 -my-1 fw-medium",
        icon: "plus-small",
        tabIndex: -1,
        onClick: provider,
        get children() {
          return language.t("command.provider.connect");
        }
      });
    },
    get children() {
      return [_$createComponent(ModelList, {
        get provider() {
          return props.provider;
        },
        get model() {
          return props.model;
        },
        onSelect: () => dialog.close()
      }), _$createComponent(Button, {
        variant: "ghost",
        "class": "ml-3 mt-5 mb-6 text-body self-start",
        onClick: manage,
        get children() {
          return language.t("dialog.model.manage");
        }
      })];
    }
  });
};