import { createComponent as _$createComponent } from "solid-js/web";
import { createContext, useContext } from "solid-js";
import { dict as en } from "../i18n/en.js";
function resolveTemplate(text, params) {
  if (!params) return text;
  return text.replace(/{{\s*([^}]+?)\s*}}/g, (_, rawKey) => {
    const key = String(rawKey);
    const value = params[key];
    return value === undefined ? "" : String(value);
  });
}
const fallback = {
  locale: () => "en",
  t: (key, params) => {
    const value = en[key] ?? String(key);
    return resolveTemplate(value, params);
  }
};
const Context = createContext(fallback);
export function I18nProvider(props) {
  return _$createComponent(Context.Provider, {
    get value() {
      return props.value;
    },
    get children() {
      return props.children;
    }
  });
}
export function useI18n() {
  return useContext(Context);
}