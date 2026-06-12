// The app consolidated the vendor contexts into @/lib/context.js and mounts the
// I18nProvider from there (app.js UiI18nBridge wraps the language context).
// Re-export the i18n context from that single source so vendor UI components
// consume the SAME context instance the app provides — a parallel createContext
// here would silently serve the built-in English fallback dictionary instead of
// the live locale/t bridge (no error is thrown because the context has a
// default value).
export { I18nProvider, useI18n } from "@/lib/context.js";
