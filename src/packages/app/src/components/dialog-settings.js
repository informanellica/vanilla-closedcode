import { createComponent, createEffect, createMemo } from "../lib/reactivity.js";
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

  const el = (tag, options = {}, children = []) => {
    const node = document.createElement(tag);
    if (options.class) node.className = options.class;
    if (options.attrs) {
      for (const [k, v] of Object.entries(options.attrs)) node.setAttribute(k, v);
    }
    children.forEach(ch => {
      if (typeof ch === "string") node.appendChild(document.createTextNode(ch));
      else if (ch instanceof Node) node.appendChild(ch);
    });
    return node;
  };

  // App name / "V{version}" / "build {buildId}" block pinned to the bottom of
  // the tab list; the texts are signal-backed, so connect them via effects.
  const buildInfo = () => {
    const appName = el("span");
    createEffect(() => { appName.textContent = language.t("app.name.desktop"); });

    const version = el("span", { class: "small fw-normal" }, ["V"]);
    const versionVal = document.createTextNode("");
    createEffect(() => { versionVal.textContent = platform.version ?? ""; });
    version.appendChild(versionVal);

    const build = el("span", { class: "small fw-normal text-secondary" }, ["build "]);
    const buildVal = document.createTextNode("");
    createEffect(() => { buildVal.textContent = platform.buildId ?? ""; });
    build.appendChild(buildVal);

    return el("div", { class: "d-flex flex-column gap-1 pl-1 py-1 small fw-medium text-secondary" }, [appName, version, build]);
  };

  const tabsList = () => {
    const sectionTitle = createComponent(Tabs.SectionTitle, {
      get children() { return language.t("settings.section.desktop"); }
    });
    const generalTrigger = createComponent(Tabs.Trigger, {
      value: "general",
      get children() {
        return [
          createComponent(Icon, { name: "sliders" }),
          createMemo(() => language.t("settings.tab.general"))
        ];
      }
    });
    const shortcutsTrigger = createComponent(Tabs.Trigger, {
      value: "shortcuts",
      get children() {
        return [
          createComponent(Icon, { name: "keyboard" }),
          createMemo(() => language.t("settings.tab.shortcuts"))
        ];
      }
    });
    const llmSection = createComponent(Tabs.SectionTitle, {
      get children() { return "LLM"; }
    });
    const connectionTrigger = createComponent(Tabs.Trigger, {
      value: "connection",
      get children() {
        return [
          createComponent(Icon, { name: "server" }),
          createMemo(() => "サーバー・プロバイダ")
        ];
      }
    });

    const desktopGroup = el("div", { class: "d-flex flex-column gap-1.5" }, [
      sectionTitle,
      el("div", { class: "d-flex flex-column gap-1.5 w-100" }, [generalTrigger, shortcutsTrigger])
    ]);
    const llmGroup = el("div", { class: "d-flex flex-column gap-1.5" }, [
      llmSection,
      el("div", { class: "d-flex flex-column gap-1.5 w-100" }, [connectionTrigger])
    ]);
    const sections = el("div", { class: "d-flex flex-column gap-3 w-100 pt-3" }, [
      el("div", { class: "d-flex flex-column gap-3" }, [desktopGroup, llmGroup])
    ]);

    return el("div", { class: "d-flex flex-column justify-content-between h-100 w-100" }, [sections, buildInfo()]);
  };

  const tabsContent = () => [
    createComponent(Tabs.Content, {
      value: "general",
      class: "no-scrollbar",
      get children() { return createComponent(SettingsGeneral, {}); }
    }),
    createComponent(Tabs.Content, {
      value: "shortcuts",
      class: "no-scrollbar",
      get children() { return createComponent(SettingsKeybinds, {}); }
    }),
    createComponent(Tabs.Content, {
      value: "connection",
      class: "no-scrollbar",
      get children() {
        // LLM server/provider manager. It renders the connected providers,
        // the add form, model pull (per provider, in the edit form) and the
        // model-visibility list internally — all consolidated here.
        return createComponent(SettingsProviders, {});
      }
    })
  ];

  return createComponent(Dialog, {
    size: "x-large",
    transition: true,
    get children() {
      return createComponent(Tabs, {
        orientation: "vertical",
        variant: "settings",
        get defaultValue() { return props?.tab || "general"; },
        class: "h-full settings-dialog",
        get children() {
          return [
            createComponent(Tabs.List, {
              get children() { return tabsList(); }
            }),
            ...tabsContent()
          ];
        }
      });
    }
  });
};
