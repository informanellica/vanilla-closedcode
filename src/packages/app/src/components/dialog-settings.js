import { template as _$template } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { memo as _$memo } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<div class="d-flex flex-column justify-content-between h-100 w-100"><div class="d-flex flex-column gap-3 w-100 pt-3"><div class="d-flex flex-column gap-3"><div class="d-flex flex-column gap-1.5"><div class="d-flex flex-column gap-1.5 w-100"></div></div><div class="d-flex flex-column gap-1.5"><div class="d-flex flex-column gap-1.5 w-100"></div></div></div></div><div class="d-flex flex-column gap-1 pl-1 py-1 small fw-medium text-secondary"><span></span><span class="small fw-normal">V</span><span class="small fw-normal text-secondary">build `);
import { Dialog } from "@/bs/dialog.js";
import { Tabs } from "@/bs/tabs.js";
import { Icon } from "@/bs/icon.js";
import { useLanguage } from "@/context/language.js";
import { usePlatform } from "@/context/platform.js";
import { SettingsGeneral } from "./settings-general.js";
import { SettingsKeybinds } from "./settings-keybinds.js";
import { SettingsServer } from "./settings-server.js";
import { SettingsProviders } from "./settings-providers.js";
import { SettingsModels } from "./settings-models.js";
export const DialogSettings = props => {
  const language = useLanguage();
  const platform = usePlatform();
  return _$createComponent(Dialog, {
    size: "x-large",
    transition: true,
    get children() {
      return _$createComponent(Tabs, {
        orientation: "vertical",
        variant: "settings",
        get defaultValue() {
          return props?.tab || "general";
        },
        "class": "h-full settings-dialog",
        get children() {
          return [_$createComponent(Tabs.List, {
            get children() {
              var _el$ = _tmpl$(),
                _el$2 = _el$.firstChild,
                _el$3 = _el$2.firstChild,
                _el$4 = _el$3.firstChild,
                _el$5 = _el$4.firstChild,
                _el$6 = _el$4.nextSibling,
                _el$7 = _el$6.firstChild,
                _el$8 = _el$2.nextSibling,
                _el$9 = _el$8.firstChild,
                _el$0 = _el$9.nextSibling,
                _el$1 = _el$0.firstChild,
                _elBuild = _el$0.nextSibling;
              _$insert(_el$4, _$createComponent(Tabs.SectionTitle, {
                get children() {
                  return language.t("settings.section.desktop");
                }
              }), _el$5);
              _$insert(_el$5, _$createComponent(Tabs.Trigger, {
                value: "general",
                get children() {
                  return [_$createComponent(Icon, {
                    name: "sliders"
                  }), _$memo(() => language.t("settings.tab.general"))];
                }
              }), null);
              _$insert(_el$5, _$createComponent(Tabs.Trigger, {
                value: "shortcuts",
                get children() {
                  return [_$createComponent(Icon, {
                    name: "keyboard"
                  }), _$memo(() => language.t("settings.tab.shortcuts"))];
                }
              }), null);
              _$insert(_el$6, _$createComponent(Tabs.SectionTitle, {
                get children() {
                  return "LLM";
                }
              }), _el$7);
              _$insert(_el$7, _$createComponent(Tabs.Trigger, {
                value: "connection",
                get children() {
                  return [_$createComponent(Icon, {
                    name: "server"
                  }), _$memo(() => "サーバー・プロバイダ")];
                }
              }), null);
              _$insert(_el$9, () => language.t("app.name.desktop"));
              _$insert(_el$0, () => platform.version, null);
              _$insert(_elBuild, () => platform.buildId, null);
              return _el$;
            }
          }), _$createComponent(Tabs.Content, {
            value: "general",
            "class": "no-scrollbar",
            get children() {
              return _$createComponent(SettingsGeneral, {});
            }
          }), _$createComponent(Tabs.Content, {
            value: "shortcuts",
            "class": "no-scrollbar",
            get children() {
              return _$createComponent(SettingsKeybinds, {});
            }
          }), _$createComponent(Tabs.Content, {
            value: "connection",
            "class": "no-scrollbar",
            get children() {
              // LLM server/provider manager. It renders the connected providers,
              // the add form, model pull (per provider, in the edit form) and the
              // model-visibility list internally — all consolidated here.
              return _$createComponent(SettingsProviders, {});
            }
          })];
        }
      });
    }
  });
};