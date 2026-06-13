import * as i18n from "../lib/primitives/i18n.js";
import { createEffect, createMemo, createResource } from "solid-js";
import { createStore } from "solid-js/store";
import { createSimpleContext } from "@/vendor/ui/context/index.js";
import { Persist, persisted } from "@/utils/persist.js";
import { dict as en } from "@/i18n/en.js";
import { dict as uiEn } from "@/i18n/ui/en.js";
function cookie(locale) {
  return `vcc_locale=${encodeURIComponent(locale)}; Path=/; Max-Age=31536000; SameSite=Lax`;
}
const LOCALES = ["en", "zh", "zht", "ko", "de", "es", "fr", "da", "ja", "pl", "ru", "bs", "ar", "no", "br", "th", "tr"];
const INTL = {
  en: "en",
  zh: "zh-Hans",
  zht: "zh-Hant",
  ko: "ko",
  de: "de",
  es: "es",
  fr: "fr",
  da: "da",
  ja: "ja",
  pl: "pl",
  ru: "ru",
  ar: "ar",
  no: "nb-NO",
  br: "pt-BR",
  th: "th",
  bs: "bs",
  tr: "tr"
};
const LABEL_KEY = {
  en: "language.en",
  zh: "language.zh",
  zht: "language.zht",
  ko: "language.ko",
  de: "language.de",
  es: "language.es",
  fr: "language.fr",
  da: "language.da",
  ja: "language.ja",
  pl: "language.pl",
  ru: "language.ru",
  ar: "language.ar",
  no: "language.no",
  br: "language.br",
  th: "language.th",
  bs: "language.bs",
  tr: "language.tr"
};
const base = i18n.flatten({
  ...en,
  ...uiEn
});
const dicts = new Map([["en", base]]);
const merge = (app, ui) => Promise.all([app, ui]).then(([a, b]) => ({
  ...base,
  ...i18n.flatten({
    ...a.dict,
    ...b.dict
  })
}));
const loaders = {
  zh: () => merge(import("@/i18n/zh.js"), import("@/i18n/ui/zh.js")),
  zht: () => merge(import("@/i18n/zht.js"), import("@/i18n/ui/zht.js")),
  ko: () => merge(import("@/i18n/ko.js"), import("@/i18n/ui/ko.js")),
  de: () => merge(import("@/i18n/de.js"), import("@/i18n/ui/de.js")),
  es: () => merge(import("@/i18n/es.js"), import("@/i18n/ui/es.js")),
  fr: () => merge(import("@/i18n/fr.js"), import("@/i18n/ui/fr.js")),
  da: () => merge(import("@/i18n/da.js"), import("@/i18n/ui/da.js")),
  ja: () => merge(import("@/i18n/ja.js"), import("@/i18n/ui/ja.js")),
  pl: () => merge(import("@/i18n/pl.js"), import("@/i18n/ui/pl.js")),
  ru: () => merge(import("@/i18n/ru.js"), import("@/i18n/ui/ru.js")),
  ar: () => merge(import("@/i18n/ar.js"), import("@/i18n/ui/ar.js")),
  no: () => merge(import("@/i18n/no.js"), import("@/i18n/ui/no.js")),
  br: () => merge(import("@/i18n/br.js"), import("@/i18n/ui/br.js")),
  th: () => merge(import("@/i18n/th.js"), import("@/i18n/ui/th.js")),
  bs: () => merge(import("@/i18n/bs.js"), import("@/i18n/ui/bs.js")),
  tr: () => merge(import("@/i18n/tr.js"), import("@/i18n/ui/tr.js"))
};
function loadDict(locale) {
  const hit = dicts.get(locale);
  if (hit) return Promise.resolve(hit);
  if (locale === "en") return Promise.resolve(base);
  const load = loaders[locale];
  return load().then(next => {
    dicts.set(locale, next);
    return next;
  });
}
export function loadLocaleDict(locale) {
  return loadDict(locale).then(() => undefined);
}
const localeMatchers = [{
  locale: "en",
  match: language => language.startsWith("en")
}, {
  locale: "zht",
  match: language => language.startsWith("zh") && language.includes("hant")
}, {
  locale: "zh",
  match: language => language.startsWith("zh")
}, {
  locale: "ko",
  match: language => language.startsWith("ko")
}, {
  locale: "de",
  match: language => language.startsWith("de")
}, {
  locale: "es",
  match: language => language.startsWith("es")
}, {
  locale: "fr",
  match: language => language.startsWith("fr")
}, {
  locale: "da",
  match: language => language.startsWith("da")
}, {
  locale: "ja",
  match: language => language.startsWith("ja")
}, {
  locale: "pl",
  match: language => language.startsWith("pl")
}, {
  locale: "ru",
  match: language => language.startsWith("ru")
}, {
  locale: "ar",
  match: language => language.startsWith("ar")
}, {
  locale: "no",
  match: language => language.startsWith("no") || language.startsWith("nb") || language.startsWith("nn")
}, {
  locale: "br",
  match: language => language.startsWith("pt")
}, {
  locale: "th",
  match: language => language.startsWith("th")
}, {
  locale: "bs",
  match: language => language.startsWith("bs")
}, {
  locale: "tr",
  match: language => language.startsWith("tr")
}];
function detectLocale() {
  if (typeof navigator !== "object") return "en";
  const languages = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const language of languages) {
    if (!language) continue;
    const normalized = language.toLowerCase();
    const match = localeMatchers.find(entry => entry.match(normalized));
    if (match) return match.locale;
  }
  return "en";
}
export function normalizeLocale(value) {
  return LOCALES.includes(value) ? value : "en";
}
function readStoredLocale() {
  if (typeof localStorage !== "object") return;
  try {
    const raw = localStorage.getItem("closedcode.global.dat:language");
    if (!raw) return;
    const next = JSON.parse(raw);
    if (typeof next?.locale !== "string") return;
    return normalizeLocale(next.locale);
  } catch {
    return;
  }
}
const warm = readStoredLocale() ?? detectLocale();
if (warm !== "en") void loadDict(warm);
export const {
  use: useLanguage,
  provider: LanguageProvider
} = createSimpleContext({
  name: "Language",
  init: props => {
    const initial = props.locale ?? readStoredLocale() ?? detectLocale();
    const [store, setStore, _, ready] = persisted(Persist.global("language", ["language.v1"]), createStore({
      locale: initial
    }));
    const locale = createMemo(() => normalizeLocale(store.locale));
    const intl = createMemo(() => INTL[locale()]);
    const [dict] = createResource(locale, loadDict, {
      initialValue: dicts.get(initial) ?? base
    });
    const t = i18n.translator(() => dict() ?? base, i18n.resolveTemplate);
    const label = value => t(LABEL_KEY[value]);
    createEffect(() => {
      if (typeof document !== "object") return;
      document.documentElement.lang = locale();
      document.cookie = cookie(locale());
    });
    return {
      ready,
      locale,
      intl,
      locales: LOCALES,
      label,
      t,
      setLocale(next) {
        setStore("locale", normalizeLocale(next));
      }
    };
  }
});