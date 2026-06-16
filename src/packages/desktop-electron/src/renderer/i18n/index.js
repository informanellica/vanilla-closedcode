/** @file Renderer i18n entry point: detects the active locale, merges desktop + app translation dictionaries per locale, and exposes the `t()` translator plus `initI18n()` to hydrate the locale from persisted store settings. */
import * as i18n from "@/lib/primitives/i18n.js";
import { dict as desktopEn } from "./en.js";
import { dict as desktopZh } from "./zh.js";
import { dict as desktopZht } from "./zht.js";
import { dict as desktopKo } from "./ko.js";
import { dict as desktopDe } from "./de.js";
import { dict as desktopEs } from "./es.js";
import { dict as desktopFr } from "./fr.js";
import { dict as desktopDa } from "./da.js";
import { dict as desktopJa } from "./ja.js";
import { dict as desktopPl } from "./pl.js";
import { dict as desktopRu } from "./ru.js";
import { dict as desktopAr } from "./ar.js";
import { dict as desktopNo } from "./no.js";
import { dict as desktopBr } from "./br.js";
import { dict as desktopBs } from "./bs.js";
import { dict as appEn } from "@/i18n/en.js";
import { dict as appZh } from "@/i18n/zh.js";
import { dict as appZht } from "@/i18n/zht.js";
import { dict as appKo } from "@/i18n/ko.js";
import { dict as appDe } from "@/i18n/de.js";
import { dict as appEs } from "@/i18n/es.js";
import { dict as appFr } from "@/i18n/fr.js";
import { dict as appDa } from "@/i18n/da.js";
import { dict as appJa } from "@/i18n/ja.js";
import { dict as appPl } from "@/i18n/pl.js";
import { dict as appRu } from "@/i18n/ru.js";
import { dict as appAr } from "@/i18n/ar.js";
import { dict as appNo } from "@/i18n/no.js";
import { dict as appBr } from "@/i18n/br.js";
import { dict as appBs } from "@/i18n/bs.js";
/**
 * Set of locale codes the renderer supports. Used to validate stored/requested values.
 * @type {Array<string>}
 */
const LOCALES = ["en", "zh", "zht", "ko", "de", "es", "fr", "da", "ja", "pl", "ru", "bs", "ar", "no", "br"];

/**
 * Detect the preferred locale from the browser's `navigator.languages`/`navigator.language`.
 * Maps each candidate language tag to one of the supported locale codes, falling back to "en".
 * @returns {string} A supported locale code (defaults to "en").
 */
function detectLocale() {
  if (typeof navigator !== "object") return "en";
  const languages = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const language of languages) {
    if (!language) continue;
    if (language.toLowerCase().startsWith("en")) return "en";
    if (language.toLowerCase().startsWith("zh")) {
      if (language.toLowerCase().includes("hant")) return "zht";
      return "zh";
    }
    if (language.toLowerCase().startsWith("ko")) return "ko";
    if (language.toLowerCase().startsWith("de")) return "de";
    if (language.toLowerCase().startsWith("es")) return "es";
    if (language.toLowerCase().startsWith("fr")) return "fr";
    if (language.toLowerCase().startsWith("da")) return "da";
    if (language.toLowerCase().startsWith("ja")) return "ja";
    if (language.toLowerCase().startsWith("pl")) return "pl";
    if (language.toLowerCase().startsWith("ru")) return "ru";
    if (language.toLowerCase().startsWith("ar")) return "ar";
    if (language.toLowerCase().startsWith("no") || language.toLowerCase().startsWith("nb") || language.toLowerCase().startsWith("nn")) return "no";
    if (language.toLowerCase().startsWith("pt")) return "br";
    if (language.toLowerCase().startsWith("bs")) return "bs";
  }
  return "en";
}
/**
 * Validate that a value is a string naming one of the supported locales.
 * @param {*} value - Candidate locale value.
 * @returns {string} The locale code if supported, otherwise null.
 */
function parseLocale(value) {
  if (!value) return null;
  if (typeof value !== "string") return null;
  if (LOCALES.includes(value)) return value;
  return null;
}

/**
 * Coerce a value to a plain (non-array) object record, or null if it is not one.
 * @param {*} value - Candidate value.
 * @returns {Object} The object if it is a plain non-array object, otherwise null.
 */
function parseRecord(value) {
  if (!value || typeof value !== "object") return null;
  if (Array.isArray(value)) return null;
  return value;
}
/**
 * Normalize a value read from the persisted store: if it is a JSON string, parse it;
 * otherwise return it unchanged. Parse failures fall back to the raw string.
 * @param {*} value - Raw stored value (often a string or JSON string).
 * @returns {*} The parsed value, or the original value when not parseable JSON.
 */
function parseStored(value) {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

/**
 * Resolve a stored value to a supported locale code. Accepts either a direct locale
 * string or a record containing a `locale` field.
 * @param {*} value - A locale string or a record with a `locale` property.
 * @returns {string} A supported locale code, or null if none can be resolved.
 */
function pickLocale(value) {
  const direct = parseLocale(value);
  if (direct) return direct;
  const record = parseRecord(value);
  if (!record) return null;
  return parseLocale(record.locale);
}
/**
 * Flattened English dictionary (app + desktop strings merged) used as the base layer
 * onto which non-English locale overrides are applied.
 * @type {Object}
 */
const base = i18n.flatten({
  ...appEn,
  ...desktopEn
});

/**
 * Build the flattened translation dictionary for a locale by layering that locale's
 * app and desktop strings over the English `base`. Returns `base` for "en", and
 * falls back to Korean for any unrecognized locale.
 * @param {string} locale - A supported locale code.
 * @returns {Object} The flattened key/value translation dictionary for the locale.
 */
function build(locale) {
  if (locale === "en") return base;
  if (locale === "zh") return {
    ...base,
    ...i18n.flatten(appZh),
    ...i18n.flatten(desktopZh)
  };
  if (locale === "zht") return {
    ...base,
    ...i18n.flatten(appZht),
    ...i18n.flatten(desktopZht)
  };
  if (locale === "de") return {
    ...base,
    ...i18n.flatten(appDe),
    ...i18n.flatten(desktopDe)
  };
  if (locale === "es") return {
    ...base,
    ...i18n.flatten(appEs),
    ...i18n.flatten(desktopEs)
  };
  if (locale === "fr") return {
    ...base,
    ...i18n.flatten(appFr),
    ...i18n.flatten(desktopFr)
  };
  if (locale === "da") return {
    ...base,
    ...i18n.flatten(appDa),
    ...i18n.flatten(desktopDa)
  };
  if (locale === "ja") return {
    ...base,
    ...i18n.flatten(appJa),
    ...i18n.flatten(desktopJa)
  };
  if (locale === "pl") return {
    ...base,
    ...i18n.flatten(appPl),
    ...i18n.flatten(desktopPl)
  };
  if (locale === "ru") return {
    ...base,
    ...i18n.flatten(appRu),
    ...i18n.flatten(desktopRu)
  };
  if (locale === "ar") return {
    ...base,
    ...i18n.flatten(appAr),
    ...i18n.flatten(desktopAr)
  };
  if (locale === "no") return {
    ...base,
    ...i18n.flatten(appNo),
    ...i18n.flatten(desktopNo)
  };
  if (locale === "br") return {
    ...base,
    ...i18n.flatten(appBr),
    ...i18n.flatten(desktopBr)
  };
  if (locale === "bs") return {
    ...base,
    ...i18n.flatten(appBs),
    ...i18n.flatten(desktopBs)
  };
  return {
    ...base,
    ...i18n.flatten(appKo),
    ...i18n.flatten(desktopKo)
  };
}
/**
 * Mutable module-level i18n state.
 * @type {Object}
 * @property {string} locale - The currently active locale code.
 * @property {Object} dict - The active flattened translation dictionary.
 * @property {Promise} init - Cached promise from `initI18n()`, or undefined before first call.
 */
const state = {
  locale: detectLocale(),
  dict: base,
  init: undefined
};
state.dict = build(state.locale);

/**
 * Bound translator that resolves keys against the current `state.dict` and interpolates templates.
 * @type {Function}
 */
const translate = i18n.translator(() => state.dict, i18n.resolveTemplate);

/**
 * Translate a message key against the active locale dictionary.
 * @param {string} key - Dotted message id (e.g. "desktop.menu.restart").
 * @param {Object} params - Optional values interpolated into `{{var}}` placeholders.
 * @returns {string} The localized, interpolated string.
 */
export function t(key, params) {
  return translate(key, params);
}

/**
 * Hydrate the active locale from the persisted store ("closedcode.global.dat" with a
 * legacy "opencode.global.dat" fallback), rebuilding `state.dict` accordingly. The work
 * is performed once and the resulting promise is cached/reused on subsequent calls.
 * @returns {Promise<string>} Resolves to the locale code that was applied.
 */
export function initI18n() {
  const cached = state.init;
  if (cached) return cached;
  const promise = (async () => {
    const raw = (await window.api.storeGet("closedcode.global.dat", "language").catch(() => null)) ?? (await window.api.storeGet("opencode.global.dat", "language").catch(() => null));
    const value = parseStored(raw);
    const next = pickLocale(value) ?? state.locale;
    state.locale = next;
    state.dict = build(next);
    return next;
  })().catch(() => state.locale);
  state.init = promise;
  return promise;
}