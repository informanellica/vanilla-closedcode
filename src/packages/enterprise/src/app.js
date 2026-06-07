import { createComponent as _$createComponent } from "solid-js/web";
import { Router } from "@solidjs/router";
import { FileRoutes } from "@solidjs/start/router";
import { Font } from "ui/font";
import { MetaProvider } from "@solidjs/meta";
import { MarkedProvider } from "ui/context/marked";
import { DialogProvider } from "ui/context/dialog";
import { I18nProvider } from "ui/context";
import { dict as uiEn } from "ui/i18n/en";
import { dict as uiZh } from "ui/i18n/zh";
import { createEffect, createMemo, Suspense } from "solid-js";
import { getRequestEvent } from "solid-js/web";
import "./app.css";
import { Favicon } from "ui/favicon";
function resolveTemplate(text, params) {
  if (!params) return text;
  return text.replace(/{{\s*([^}]+?)\s*}}/g, (_, rawKey) => {
    const key = String(rawKey);
    const value = params[key];
    return value === undefined ? "" : String(value);
  });
}
function detectLocaleFromHeader(header) {
  if (!header) return;
  for (const item of header.split(",")) {
    const value = item.trim().split(";")[0]?.toLowerCase();
    if (!value) continue;
    if (value.startsWith("zh")) return "zh";
    if (value.startsWith("en")) return "en";
  }
}
function detectLocale() {
  const event = getRequestEvent();
  const header = event?.request.headers.get("accept-language");
  const headerLocale = detectLocaleFromHeader(header);
  if (headerLocale) return headerLocale;
  if (typeof document === "object") {
    const value = document.documentElement.lang?.toLowerCase() ?? "";
    if (value.startsWith("zh")) return "zh";
    if (value.startsWith("en")) return "en";
  }
  if (typeof navigator === "object") {
    const languages = navigator.languages?.length ? navigator.languages : [navigator.language];
    for (const language of languages) {
      if (!language) continue;
      if (language.toLowerCase().startsWith("zh")) return "zh";
    }
  }
  return "en";
}
function UiI18nBridge(props) {
  const locale = createMemo(() => detectLocale());
  const zh = uiZh;
  const t = (key, params) => {
    const value = locale() === "zh" ? zh[key] ?? uiEn[key] : uiEn[key];
    const text = value ?? String(key);
    return resolveTemplate(text, params);
  };
  createEffect(() => {
    if (typeof document !== "object") return;
    document.documentElement.lang = locale();
  });
  return _$createComponent(I18nProvider, {
    value: {
      locale,
      t
    },
    get children() {
      return props.children;
    }
  });
}
export default function App() {
  return _$createComponent(Router, {
    root: props => _$createComponent(MetaProvider, {
      get children() {
        return _$createComponent(DialogProvider, {
          get children() {
            return _$createComponent(MarkedProvider, {
              get children() {
                return [_$createComponent(Favicon, {}), _$createComponent(Font, {}), _$createComponent(UiI18nBridge, {
                  get children() {
                    return _$createComponent(Suspense, {
                      get children() {
                        return props.children;
                      }
                    });
                  }
                })];
              }
            });
          }
        });
      }
    }),
    get children() {
      return _$createComponent(FileRoutes, {});
    }
  });
}