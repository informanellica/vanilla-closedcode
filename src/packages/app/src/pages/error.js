import { template as _$template } from "solid-js/web";
import { delegateEvents as _$delegateEvents } from "solid-js/web";
import { memo as _$memo } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<div class="relative flex-1 h-screen w-screen min-h-0 d-flex flex-column align-items-center justify-content-center bg-body font-sans"><div class="w-2/3 max-w-3xl d-flex flex-column align-items-center justify-content-center gap-8"><div class="d-flex flex-column align-items-center gap-2 text-center"><h1 class="text-lg font-medium text-body-emphasis"></h1><p class="text-sm text-secondary"></p></div><div class="d-flex flex-row align-items-center justify-content-center gap-3 flex-wrap max-w-64"></div><div class="d-flex flex-column align-items-center gap-2"><div class="d-flex align-items-center justify-content-center gap-1"><button type=button class="d-flex align-items-center text-primary gap-1"><div>`),
  _tmpl$2 = /*#__PURE__*/_$template(`<p class="text-xs text-danger text-center max-w-2xl">`),
  _tmpl$3 = /*#__PURE__*/_$template(`<p class="text-xs text-secondary">`),
  _tmpl$4 = /*#__PURE__*/_$template(`<button type=button class="d-flex align-items-center text-primary gap-1"><div>`);
import { TextField } from "@/bs/text-field.js";
import * as Sentry from "@sentry/solid";
import { Logo } from "@/vendor/ui/components/logo.js";
import { Button } from "@/bs/button.js";
import { createSignal, Show } from "solid-js";
import { createStore } from "solid-js/store";
import { usePlatform } from "@/context/platform.js";
import { useLanguage } from "@/context/language.js";
import { Icon } from "@/bs/icon.js";
const CHAIN_SEPARATOR = "\n" + "─".repeat(40) + "\n";
function isIssue(value) {
  if (!value || typeof value !== "object") return false;
  if (!("message" in value) || !("path" in value)) return false;
  const message = value.message;
  const path = value.path;
  if (typeof message !== "string") return false;
  if (!Array.isArray(path)) return false;
  return path.every(part => typeof part === "string");
}
function isInitError(error) {
  return typeof error === "object" && error !== null && "name" in error && "data" in error && typeof error.data === "object";
}
function safeJson(value, circular) {
  const seen = new WeakSet();
  const json = JSON.stringify(value, (_key, val) => {
    if (typeof val === "bigint") return val.toString();
    if (typeof val === "object" && val) {
      if (seen.has(val)) return circular;
      seen.add(val);
    }
    return val;
  }, 2);
  return json ?? String(value);
}
function formatInitError(error, t) {
  const data = error.data;
  const json = value => safeJson(value, t("error.page.circular"));
  switch (error.name) {
    case "MCPFailed":
      {
        const name = typeof data.name === "string" ? data.name : "";
        return t("error.chain.mcpFailed", {
          name
        });
      }
    case "ProviderAuthError":
      {
        const providerID = typeof data.providerID === "string" ? data.providerID : t("common.unknown");
        const message = typeof data.message === "string" ? data.message : json(data.message);
        return t("error.chain.providerAuthFailed", {
          provider: providerID,
          message
        });
      }
    case "APIError":
      {
        const message = typeof data.message === "string" ? data.message : t("error.chain.apiError");
        const lines = [message];
        if (typeof data.statusCode === "number") {
          lines.push(t("error.chain.status", {
            status: data.statusCode
          }));
        }
        if (typeof data.isRetryable === "boolean") {
          lines.push(t("error.chain.retryable", {
            retryable: data.isRetryable
          }));
        }
        if (typeof data.responseBody === "string" && data.responseBody) {
          lines.push(t("error.chain.responseBody", {
            body: data.responseBody
          }));
        }
        return lines.join("\n");
      }
    case "ProviderModelNotFoundError":
      {
        const {
          providerID,
          modelID,
          suggestions
        } = data;
        const suggestionsLine = Array.isArray(suggestions) && suggestions.length ? [t("error.chain.didYouMean", {
          suggestions: suggestions.join(", ")
        })] : [];
        return [t("error.chain.modelNotFound", {
          provider: providerID,
          model: modelID
        }), ...suggestionsLine, t("error.chain.checkConfig")].join("\n");
      }
    case "ProviderInitError":
      {
        const providerID = typeof data.providerID === "string" ? data.providerID : t("common.unknown");
        return t("error.chain.providerInitFailed", {
          provider: providerID
        });
      }
    case "ConfigJsonError":
      {
        const path = typeof data.path === "string" ? data.path : json(data.path);
        const message = typeof data.message === "string" ? data.message : "";
        if (message) return t("error.chain.configJsonInvalidWithMessage", {
          path,
          message
        });
        return t("error.chain.configJsonInvalid", {
          path
        });
      }
    case "ConfigDirectoryTypoError":
      {
        const path = typeof data.path === "string" ? data.path : json(data.path);
        const dir = typeof data.dir === "string" ? data.dir : json(data.dir);
        const suggestion = typeof data.suggestion === "string" ? data.suggestion : json(data.suggestion);
        return t("error.chain.configDirectoryTypo", {
          dir,
          path,
          suggestion
        });
      }
    case "ConfigFrontmatterError":
      {
        const path = typeof data.path === "string" ? data.path : json(data.path);
        const message = typeof data.message === "string" ? data.message : json(data.message);
        return t("error.chain.configFrontmatterError", {
          path,
          message
        });
      }
    case "ConfigInvalidError":
      {
        const issues = Array.isArray(data.issues) ? data.issues.filter(isIssue).map(issue => "↳ " + issue.message + " " + issue.path.join(".")) : [];
        const message = typeof data.message === "string" ? data.message : "";
        const path = typeof data.path === "string" ? data.path : json(data.path);
        const line = message ? t("error.chain.configInvalidWithMessage", {
          path,
          message
        }) : t("error.chain.configInvalid", {
          path
        });
        return [line, ...issues].join("\n");
      }
    case "UnknownError":
      return typeof data.message === "string" ? data.message : json(data);
    default:
      if (typeof data.message === "string") return data.message;
      return json(data);
  }
}
function formatErrorChain(error, t, depth = 0, parentMessage) {
  const json = value => safeJson(value, t("error.page.circular"));
  if (!error) return t("error.chain.unknown");
  if (isInitError(error)) {
    const message = formatInitError(error, t);
    if (depth > 0 && parentMessage === message) return "";
    const indent = depth > 0 ? `\n${CHAIN_SEPARATOR}${t("error.chain.causedBy")}\n` : "";
    return indent + `${error.name}\n${message}`;
  }
  if (error instanceof Error) {
    const isDuplicate = depth > 0 && parentMessage === error.message;
    const parts = [];
    const indent = depth > 0 ? `\n${CHAIN_SEPARATOR}${t("error.chain.causedBy")}\n` : "";
    const header = `${error.name}${error.message ? `: ${error.message}` : ""}`;
    const stack = error.stack?.trim();
    if (stack) {
      const startsWithHeader = stack.startsWith(header);
      if (isDuplicate && startsWithHeader) {
        const trace = stack.split("\n").slice(1).join("\n").trim();
        if (trace) {
          parts.push(indent + trace);
        }
      }
      if (isDuplicate && !startsWithHeader) {
        parts.push(indent + stack);
      }
      if (!isDuplicate && startsWithHeader) {
        parts.push(indent + stack);
      }
      if (!isDuplicate && !startsWithHeader) {
        parts.push(indent + `${header}\n${stack}`);
      }
    }
    if (!stack && !isDuplicate) {
      parts.push(indent + header);
    }
    if (error.cause) {
      const causeResult = formatErrorChain(error.cause, t, depth + 1, error.message);
      if (causeResult) {
        parts.push(causeResult);
      }
    }
    return parts.join("\n\n");
  }
  if (typeof error === "string") {
    if (depth > 0 && parentMessage === error) return "";
    const indent = depth > 0 ? `\n${CHAIN_SEPARATOR}${t("error.chain.causedBy")}\n` : "";
    return indent + error;
  }
  const indent = depth > 0 ? `\n${CHAIN_SEPARATOR}${t("error.chain.causedBy")}\n` : "";
  return indent + json(error);
}
function formatError(error, t) {
  return formatErrorChain(error, t, 0);
}
export const ErrorPage = props => {
  const platform = usePlatform();
  const language = useLanguage();
  const [store, setStore] = createStore({
    checking: false,
    version: undefined,
    actionError: undefined
  });
  async function checkForUpdates() {
    if (!platform.checkUpdate) return;
    setStore("checking", true);
    await platform.checkUpdate().then(result => {
      setStore("actionError", undefined);
      if (result.updateAvailable && result.version) setStore("version", result.version);
    }).catch(err => {
      setStore("actionError", formatError(err, language.t));
    }).finally(() => {
      setStore("checking", false);
    });
  }
  async function installUpdate() {
    if (!platform.updateAndRestart) return;
    await platform.updateAndRestart().then(() => setStore("actionError", undefined)).catch(err => {
      setStore("actionError", formatError(err, language.t));
    });
  }
  return (() => {
    var _el$ = _tmpl$(),
      _el$2 = _el$.firstChild,
      _el$3 = _el$2.firstChild,
      _el$4 = _el$3.firstChild,
      _el$5 = _el$4.nextSibling,
      _el$6 = _el$3.nextSibling,
      _el$7 = _el$6.nextSibling,
      _el$8 = _el$7.firstChild,
      _el$9 = _el$8.firstChild,
      _el$0 = _el$9.firstChild;
    _$insert(_el$2, _$createComponent(Logo, {
      "class": "w-58.5 opacity-12 shrink-0"
    }), _el$3);
    _$insert(_el$4, () => language.t("error.page.title"));
    _$insert(_el$5, () => language.t("error.page.description"));
    _$insert(_el$2, _$createComponent(TextField, {
      get value() {
        return formatError(props.error, language.t);
      },
      readOnly: true,
      copyable: true,
      multiline: true,
      "class": "max-h-96 w-full font-mono text-xs no-scrollbar",
      get label() {
        return language.t("error.page.details.label");
      },
      hideLabel: true
    }), _el$6);
    _$insert(_el$6, _$createComponent(Button, {
      size: "large",
      get onClick() {
        return platform.restart;
      },
      get children() {
        return language.t("error.page.action.restart");
      }
    }), null);
    _$insert(_el$6, _$createComponent(Show, {
      when: Sentry.isEnabled(),
      children: _ => {
        const [reported, setReported] = createSignal(false);
        return _$createComponent(Button, {
          size: "large",
          get disabled() {
            return reported();
          },
          onClick: () => {
            Sentry.captureException(props.error);
            setReported(true);
          },
          get children() {
            return language.t(reported() ? "error.page.action.reported" : "error.page.action.report");
          }
        });
      }
    }), null);
    _$insert(_el$6, _$createComponent(Show, {
      get when() {
        return platform.checkUpdate;
      },
      get children() {
        return _$createComponent(Show, {
          get when() {
            return store.version;
          },
          get fallback() {
            return _$createComponent(Button, {
              size: "large",
              variant: "ghost",
              onClick: checkForUpdates,
              get disabled() {
                return store.checking;
              },
              get children() {
                return _$memo(() => !!store.checking)() ? language.t("error.page.action.checking") : language.t("error.page.action.checkUpdates");
              }
            });
          },
          get children() {
            return _$createComponent(Button, {
              size: "large",
              onClick: installUpdate,
              get children() {
                return language.t("error.page.action.updateTo", {
                  version: store.version ?? ""
                });
              }
            });
          }
        });
      }
    }), null);
    _$insert(_el$2, _$createComponent(Show, {
      get when() {
        return store.actionError;
      },
      children: message => (() => {
        var _el$1 = _tmpl$2();
        _$insert(_el$1, message);
        return _el$1;
      })()
    }), _el$7);
    _$insert(_el$8, () => language.t("error.page.report.prefix"), _el$9);
    _el$9.$$click = () => platform.openLink("https://discord.gg/6bvnqcH3");
    _$insert(_el$0, () => language.t("error.page.report.discord"));
    _$insert(_el$9, _$createComponent(Icon, {
      name: "discord",
      "class": "text-primary"
    }), null);
    var _el$11 = _tmpl$4(),
      _el$12 = _el$11.firstChild;
    _el$11.$$click = () => platform.openLink("https://github.com/informanellica/vanilla-closedcode/issues/new");
    _$insert(_el$12, () => language.t("error.page.report.github"));
    _$insert(_el$11, _$createComponent(Icon, {
      name: "github",
      "class": "text-primary"
    }), null);
    _$insert(_el$8, _el$11, null);
    _$insert(_el$8, () => language.t("error.page.report.separator"), _el$11);
    _$insert(_el$7, _$createComponent(Show, {
      get when() {
        return platform.version;
      },
      children: version => (() => {
        var _el$10 = _tmpl$3();
        _$insert(_el$10, () => language.t("error.page.version", {
          version: version()
        }));
        return _el$10;
      })()
    }), null);
    return _el$;
  })();
};
_$delegateEvents(["click"]);