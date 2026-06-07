import { template as _$template } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<div class="d-flex flex-column align-items-center justify-content-center py-12 text-center"><span class="fw-normal text-secondary">`),
  _tmpl$2 = /*#__PURE__*/_$template(`<span class="fw-normal text-body-emphasis mt-1">&quot;<!>&quot;`),
  _tmpl$3 = /*#__PURE__*/_$template(`<div class="d-flex flex-column h-full overflow-y-auto no-scrollbar px-4 pb-10 sm:px-10 sm:pb-10"><div class="sticky top-0 z-10 bg-[linear-gradient(to_bottom,var(--surface-stronger-non-alpha)_calc(100%_-_24px),transparent)]"><div class="d-flex flex-column gap-4 pt-6 pb-6 max-w-[720px]"><h2 class="fs-6 fw-medium text-body-emphasis"></h2><div class="d-flex align-items-center gap-2 px-3 h-9 rounded-3 bg-body-tertiary"></div></div></div><div class="d-flex flex-column gap-8 max-w-[720px]">`),
  _tmpl$4 = /*#__PURE__*/_$template(`<div class="d-flex flex-column gap-1"><div class="d-flex align-items-center gap-2 pb-2"><span class="fw-medium text-body-emphasis">`),
  _tmpl$5 = /*#__PURE__*/_$template(`<div class="d-flex align-items-center justify-content-between gap-4 p-4 rounded-3 bg-body-tertiary"><div class=min-w-0><span class="fw-normal text-body-emphasis truncate block"></span></div><div class=flex-shrink-0>`);
import { useFilteredList } from "@/lib/hooks.js";
import { ProviderIcon } from "@/vendor/ui/components/provider-icon.js";
import { Switch } from "@/bs/switch.js";
import { Icon } from "@/bs/icon.js";
import { IconButton } from "@/bs/icon-button.js";
import { TextField } from "@/bs/text-field.js";
import { For, Show } from "solid-js";
import { useLanguage } from "@/context/language.js";
import { useModels } from "@/context/models.js";
import { popularProviders } from "@/hooks/use-providers.js";
import { SettingsList } from "./settings-list.js";
const ListLoadingState = props => {
  return (() => {
    var _el$ = _tmpl$(),
      _el$2 = _el$.firstChild;
    _$insert(_el$2, () => props.label);
    return _el$;
  })();
};
const ListEmptyState = props => {
  return (() => {
    var _el$3 = _tmpl$(),
      _el$4 = _el$3.firstChild;
    _$insert(_el$4, () => props.message);
    _$insert(_el$3, _$createComponent(Show, {
      get when() {
        return props.filter;
      },
      get children() {
        var _el$5 = _tmpl$2(),
          _el$6 = _el$5.firstChild,
          _el$8 = _el$6.nextSibling,
          _el$7 = _el$8.nextSibling;
        _$insert(_el$5, () => props.filter, _el$8);
        return _el$5;
      }
    }), null);
    return _el$3;
  })();
};
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
  return (() => {
    var _el$9 = _tmpl$3(),
      _el$0 = _el$9.firstChild,
      _el$1 = _el$0.firstChild,
      _el$10 = _el$1.firstChild,
      _el$11 = _el$10.nextSibling,
      _el$12 = _el$0.nextSibling;
    _$insert(_el$10, () => language.t("settings.models.title"));
    _$insert(_el$11, _$createComponent(Icon, {
      name: "magnifying-glass",
      "class": "text-secondary flex-shrink-0"
    }), null);
    _$insert(_el$11, _$createComponent(TextField, {
      variant: "ghost",
      type: "text",
      get value() {
        return list.filter();
      },
      get onChange() {
        return list.onInput;
      },
      get placeholder() {
        return language.t("dialog.model.search.placeholder");
      },
      spellcheck: false,
      autocorrect: "off",
      autocomplete: "off",
      autocapitalize: "off",
      "class": "flex-1"
    }), null);
    _$insert(_el$11, _$createComponent(Show, {
      get when() {
        return list.filter();
      },
      get children() {
        return _$createComponent(IconButton, {
          icon: "circle-x",
          variant: "ghost",
          get onClick() {
            return list.clear;
          }
        });
      }
    }), null);
    _$insert(_el$12, _$createComponent(Show, {
      get when() {
        return !list.grouped.loading;
      },
      get fallback() {
        return _$createComponent(ListLoadingState, {
          get label() {
            return `${language.t("common.loading")}${language.t("common.loading.ellipsis")}`;
          }
        });
      },
      get children() {
        return _$createComponent(Show, {
          get when() {
            return list.flat().length > 0;
          },
          get fallback() {
            return _$createComponent(ListEmptyState, {
              get message() {
                return language.t("dialog.model.empty");
              },
              get filter() {
                return list.filter();
              }
            });
          },
          get children() {
            return _$createComponent(For, {
              get each() {
                return list.grouped.latest;
              },
              children: group => (() => {
                var _el$13 = _tmpl$4(),
                  _el$14 = _el$13.firstChild,
                  _el$15 = _el$14.firstChild;
                _$insert(_el$14, _$createComponent(ProviderIcon, {
                  get id() {
                    return group.category;
                  },
                  "class": "size-5 shrink-0 text-secondary"
                }), _el$15);
                _$insert(_el$15, () => group.items[0].provider.name);
                _$insert(_el$13, _$createComponent(SettingsList, {
                  get children() {
                    return _$createComponent(For, {
                      get each() {
                        return group.items;
                      },
                      children: item => {
                        const key = {
                          providerID: item.provider.id,
                          modelID: item.id
                        };
                        return (() => {
                          var _el$16 = _tmpl$5(),
                            _el$17 = _el$16.firstChild,
                            _el$18 = _el$17.firstChild,
                            _el$19 = _el$17.nextSibling;
                          _$insert(_el$18, () => item.name);
                          _$insert(_el$19, _$createComponent(Switch, {
                            get checked() {
                              return models.visible(key);
                            },
                            onChange: checked => {
                              models.setVisibility(key, checked);
                            },
                            hideLabel: true,
                            get children() {
                              return item.name;
                            }
                          }));
                          return _el$16;
                        })();
                      }
                    });
                  }
                }), null);
                return _el$13;
              })()
            });
          }
        });
      }
    }));
    return _el$9;
  })();
};