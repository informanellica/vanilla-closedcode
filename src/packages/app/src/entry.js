// @refresh reload

import * as Sentry from "@sentry/browser";
import { createComponent } from "solid-js";
import { render } from "solid-js/web";
import { AppBaseProviders, AppInterface } from "@/app.js";
import { PlatformProvider } from "@/context/platform.js";
import { dict as en } from "@/i18n/en.js";
import { dict as zh } from "@/i18n/zh.js";
import { handleNotificationClick } from "@/utils/notification-click.js";
import { env } from "@/lib/env.js";
import pkg from "../package.json" with { type: "json" };
import { ServerConnection } from "./context/server.js";
const DEFAULT_SERVER_URL_KEY = "closedcode.settings.dat:defaultServerUrl";
const getLocale = () => {
  if (typeof navigator !== "object") return "en";
  const languages = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const language of languages) {
    if (!language) continue;
    if (language.toLowerCase().startsWith("zh")) return "zh";
  }
  return "en";
};
const getRootNotFoundError = () => {
  const key = "error.dev.rootNotFound";
  const locale = getLocale();
  return locale === "zh" ? zh[key] ?? en[key] : en[key];
};
const getStorage = key => {
  if (typeof localStorage === "undefined") return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const setStorage = (key, value) => {
  if (typeof localStorage === "undefined") return;
  try {
    if (value !== null) {
      localStorage.setItem(key, value);
      return;
    }
    localStorage.removeItem(key);
  } catch {
    return;
  }
};
const readDefaultServerUrl = () => getStorage(DEFAULT_SERVER_URL_KEY);
const writeDefaultServerUrl = url => setStorage(DEFAULT_SERVER_URL_KEY, url);
const notify = async (title, description, href) => {
  if (!("Notification" in window)) return;
  const permission = Notification.permission === "default" ? await Notification.requestPermission().catch(() => "denied") : Notification.permission;
  if (permission !== "granted") return;
  const inView = document.visibilityState === "visible" && document.hasFocus();
  if (inView) return;
  const notification = new Notification(title, {
    body: description ?? ""
  });
  notification.onclick = () => {
    handleNotificationClick(href);
    notification.close();
  };
};
const openLink = url => {
  window.open(url, "_blank");
};
const back = () => {
  window.history.back();
};
const forward = () => {
  window.history.forward();
};
const restart = async () => {
  window.location.reload();
};
const root = document.getElementById("root");
if (!(root instanceof HTMLElement) && env("DEV")) {
  throw new Error(getRootNotFoundError());
}
const getCurrentUrl = () => {
  if (env("DEV")) return `http://${env("VITE_CLOSEDCODE_SERVER_HOST") ?? "localhost"}:${env("VITE_CLOSEDCODE_SERVER_PORT") ?? "4096"}`;
  return location.origin;
};
const getDefaultUrl = () => {
  const lsDefault = readDefaultServerUrl();
  if (lsDefault) return lsDefault;
  return getCurrentUrl();
};
const platform = {
  platform: "web",
  version: pkg.version,
  buildId: env("VITE_BUILD_ID") ?? "dev",
  openLink,
  back,
  forward,
  restart,
  notify,
  getDefaultServer: async () => {
    const stored = readDefaultServerUrl();
    return stored ? ServerConnection.Key.make(stored) : null;
  },
  setDefaultServer: writeDefaultServerUrl
};
if (env("VITE_SENTRY_DSN")) {
  Sentry.init({
    dsn: env("VITE_SENTRY_DSN"),
    environment: env("VITE_SENTRY_ENVIRONMENT") ?? env("MODE"),
    release: env("VITE_SENTRY_RELEASE") ?? `web@${pkg.version}`,
    initialScope: {
      tags: {
        platform: "web"
      }
    },
    integrations: integrations => {
      return integrations.filter(i => i.name !== "Breadcrumbs" && !(env("CLOSEDCODE_CHANNEL") === "prod" && i.name === "GlobalHandlers"));
    }
  });
}
if (root instanceof HTMLElement) {
  const server = {
    type: "http",
    http: {
      url: getCurrentUrl()
    }
  };
  render(() => createComponent(PlatformProvider, {
    value: platform,
    get children() {
      return createComponent(AppBaseProviders, {
        get children() {
          return createComponent(AppInterface, {
            get defaultServer() {
              return ServerConnection.Key.make(getDefaultUrl());
            },
            servers: [server],
            disableHealthCheck: true
          });
        }
      });
    }
  }), root);
}