/** @file Full-screen fatal-error page: formats an error (including init-error chains and nested causes) and offers restart, crash-report, and update actions. */
import { TextField } from "@/bs/text-field.js";
import * as Sentry from "@sentry/browser";
import { Logo } from "@/vendor/ui/components/logo.js";
import { Button } from "@/bs/button.js";
import { createComponent, createRenderEffect, createSignal } from "../lib/reactivity.js";
import { createStore } from "../lib/store.js";
import { usePlatform } from "@/context/platform.js";
import { useLanguage } from "@/context/language.js";
import { Icon } from "@/bs/icon.js";
const CHAIN_SEPARATOR = "\n" + "─".repeat(40) + "\n";
/**
 * Type guard for a config-validation issue object ({ message, path }).
 * @param {*} value - Candidate value to test.
 * @returns {boolean} True when value has a string message and a string-array path.
 */
function isIssue(value) {
  if (!value || typeof value !== "object") return false;
  if (!("message" in value) || !("path" in value)) return false;
  const message = value.message;
  const path = value.path;
  if (typeof message !== "string") return false;
  if (!Array.isArray(path)) return false;
  return path.every(part => typeof part === "string");
}
/**
 * Type guard for a structured init error ({ name, data }) produced by the backend.
 * @param {*} error - Candidate error value.
 * @returns {boolean} True when error has a `name` and an object `data`.
 */
function isInitError(error) {
  return typeof error === "object" && error !== null && "name" in error && "data" in error && typeof error.data === "object";
}
/**
 * JSON-stringify a value with circular-reference protection and BigInt support.
 * @param {*} value - Value to serialize.
 * @param {string} circular - Placeholder substituted for circular references.
 * @returns {string} Pretty-printed JSON, or String(value) when serialization yields undefined.
 */
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
/**
 * Format a single structured init error into a localized, human-readable message,
 * branching on the error name (MCPFailed, APIError, ConfigInvalidError, etc.).
 * @param {Object} error - The init error ({ name, data }).
 * @param {Function} t - Localization function (key, params) returning a string.
 * @returns {string} The localized message for this error.
 */
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
/**
 * Recursively format an error and its cause chain into a single text block,
 * handling init errors, Error instances (with stacks), strings, and arbitrary
 * values, with separators and "caused by" headers between chained causes.
 * @param {*} error - The error to format (any shape).
 * @param {Function} t - Localization function (key, params) returning a string.
 * @param {number} depth - Current recursion depth (0 for the top-level error).
 * @param {string} parentMessage - Message of the parent error, used to suppress duplicate cause text.
 * @returns {string} The formatted error chain text.
 */
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
/**
 * Format an error (and its full cause chain) into displayable text.
 * @param {*} error - The error to format.
 * @param {Function} t - Localization function (key, params) returning a string.
 * @returns {string} The formatted error text.
 */
function formatError(error, t) {
  return formatErrorChain(error, t, 0);
}

/**
 * Build a detached element from a compact, static HTML string.
 * @param {string} html - Static markup (no dynamic interpolation).
 * @returns {Element} The first element of the parsed markup.
 */
// Build a detached element from compact HTML (no inter-element whitespace,
// matching the compiled Solid template). Static markup only — error/translated
// strings are always assigned via textContent, never interpolated.
function template(html) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;
  return wrapper.firstElementChild;
}

/**
 * Full-screen error page component. Renders the brand logo, a title/description,
 * the formatted error details in a read-only copyable field, and action buttons
 * (restart, report to Sentry when enabled, check/install update when supported),
 * plus Discord/GitHub report links and the app version. All text stays live
 * across locale changes via render effects.
 * @param {Object} props - Component props.
 * @param {*} props.error - The error to display and (optionally) report.
 * @returns {Element} The error page root element.
 */
export const ErrorPage = props => {
  const platform = usePlatform();
  const language = useLanguage();
  const [store, setStore] = createStore({
    checking: false,
    version: undefined,
    actionError: undefined
  });
  /**
   * Query the platform for an available update, recording the new version or any error in the store.
   * @returns {Promise<void>}
   */
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
  /**
   * Install the pending update and restart the app, recording any error in the store.
   * @returns {Promise<void>}
   */
  async function installUpdate() {
    if (!platform.updateAndRestart) return;
    await platform.updateAndRestart().then(() => setStore("actionError", undefined)).catch(err => {
      setStore("actionError", formatError(err, language.t));
    });
  }

  // Static skeleton. The `display: contents` slots host reactive sections
  // without introducing extra flex items, so gaps/wrapping match the original
  // flat children list.
  const root = template(`<div class="relative flex-1 h-screen w-screen min-h-0 d-flex flex-column align-items-center justify-content-center bg-body font-sans"><div class="w-2/3 max-w-3xl d-flex flex-column align-items-center justify-content-center gap-8" data-slot="main"><div class="d-flex flex-column align-items-center gap-2 text-center"><h1 class="text-lg font-medium text-body-emphasis" data-slot="title"></h1><p class="text-sm text-secondary" data-slot="description"></p></div><div style="display: contents" data-slot="details"></div><div class="d-flex flex-row align-items-center justify-content-center gap-3 flex-wrap max-w-64"><div style="display: contents" data-slot="action-restart"></div><div style="display: contents" data-slot="action-report"></div><div style="display: contents" data-slot="action-update"></div></div><div style="display: contents" data-slot="action-error"></div><div class="d-flex flex-column align-items-center gap-2"><div class="d-flex align-items-center justify-content-center gap-1" data-slot="report-row"><button type="button" class="d-flex align-items-center text-primary gap-1" data-slot="discord"><div data-slot="discord-label"></div></button><button type="button" class="d-flex align-items-center text-primary gap-1" data-slot="github"><div data-slot="github-label"></div></button></div><div style="display: contents" data-slot="version"></div></div></div></div>`);
  const main = root.querySelector('[data-slot="main"]');
  const titleEl = root.querySelector('[data-slot="title"]');
  const descriptionEl = root.querySelector('[data-slot="description"]');
  const detailsSlot = root.querySelector('[data-slot="details"]');
  const restartSlot = root.querySelector('[data-slot="action-restart"]');
  const reportSlot = root.querySelector('[data-slot="action-report"]');
  const updateSlot = root.querySelector('[data-slot="action-update"]');
  const actionErrorSlot = root.querySelector('[data-slot="action-error"]');
  const reportRow = root.querySelector('[data-slot="report-row"]');
  const discordBtn = root.querySelector('[data-slot="discord"]');
  const discordLabel = root.querySelector('[data-slot="discord-label"]');
  const githubBtn = root.querySelector('[data-slot="github"]');
  const githubLabel = root.querySelector('[data-slot="github-label"]');
  const versionSlot = root.querySelector('[data-slot="version"]');

  // Brand watermark before the title block.
  main.insertBefore(createComponent(Logo, {
    "class": "w-58.5 opacity-12 shrink-0"
  }), main.firstElementChild);

  // Render-effects mirror the compiled insert() timing (synchronous on first
  // run) and keep every translated string live: at boot the locale dictionary
  // may resolve after this page is already shown.
  createRenderEffect(() => {
    titleEl.textContent = language.t("error.page.title");
  });
  createRenderEffect(() => {
    descriptionEl.textContent = language.t("error.page.description");
  });

  // Error details. The vanilla TextField reads its props once, so rebuild it
  // when the locale dictionary changes to keep value/label translated.
  createRenderEffect(() => {
    detailsSlot.replaceChildren(createComponent(TextField, {
      value: formatError(props.error, language.t),
      readOnly: true,
      copyable: true,
      multiline: true,
      "class": "max-h-96 w-full font-mono text-xs no-scrollbar",
      label: language.t("error.page.details.label"),
      hideLabel: true
    }));
  });

  // Restart action. The vanilla Button renders its children once — rebuild on
  // locale change.
  createRenderEffect(() => {
    const label = language.t("error.page.action.restart");
    restartSlot.replaceChildren(createComponent(Button, {
      size: "large",
      onClick: platform.restart,
      children: label
    }));
  });

  // Crash reporting (Show when Sentry.isEnabled() — static condition, like the
  // original's non-getter `when`). The reported flag lives outside the effect
  // so rebuilds keep its state, matching the original render-prop scope.
  if (Sentry.isEnabled()) {
    const [reported, setReported] = createSignal(false);
    createRenderEffect(() => {
      const label = language.t(reported() ? "error.page.action.reported" : "error.page.action.report");
      reportSlot.replaceChildren(createComponent(Button, {
        size: "large",
        disabled: reported(),
        onClick: () => {
          Sentry.captureException(props.error);
          setReported(true);
        },
        children: label
      }));
    });
  }

  // Update actions (Show when platform.checkUpdate — platform is a plain
  // context value, so the condition is static). Inner state (version/checking)
  // is reactive: rebuild the button when it or the locale changes.
  if (platform.checkUpdate) {
    createRenderEffect(() => {
      if (store.version) {
        updateSlot.replaceChildren(createComponent(Button, {
          size: "large",
          onClick: installUpdate,
          children: language.t("error.page.action.updateTo", {
            version: store.version ?? ""
          })
        }));
        return;
      }
      updateSlot.replaceChildren(createComponent(Button, {
        size: "large",
        variant: "ghost",
        onClick: checkForUpdates,
        disabled: store.checking,
        children: store.checking ? language.t("error.page.action.checking") : language.t("error.page.action.checkUpdates")
      }));
    });
  }

  // Error from the update actions (Show when store.actionError).
  createRenderEffect(() => {
    const message = store.actionError;
    if (!message) {
      actionErrorSlot.replaceChildren();
      return;
    }
    const el = template(`<p class="text-xs text-danger text-center max-w-2xl"></p>`);
    el.textContent = message;
    actionErrorSlot.replaceChildren(el);
  });

  // Report links row: [prefix text, discord button, separator text, github
  // button] — same order the compiled inserts produced. The labels are plain
  // text nodes, exactly like the original anonymous flex items.
  const prefixText = document.createTextNode("");
  reportRow.insertBefore(prefixText, discordBtn);
  const separatorText = document.createTextNode("");
  reportRow.insertBefore(separatorText, githubBtn);
  createRenderEffect(() => {
    prefixText.textContent = language.t("error.page.report.prefix");
  });
  createRenderEffect(() => {
    separatorText.textContent = language.t("error.page.report.separator");
  });
  createRenderEffect(() => {
    discordLabel.textContent = language.t("error.page.report.discord");
  });
  createRenderEffect(() => {
    githubLabel.textContent = language.t("error.page.report.github");
  });
  discordBtn.addEventListener("click", () => platform.openLink("https://discord.gg/6bvnqcH3"));
  githubBtn.addEventListener("click", () => platform.openLink("https://github.com/informanellica/vanilla-closedcode/issues/new"));
  discordBtn.appendChild(createComponent(Icon, {
    name: "discord",
    "class": "text-primary"
  }));
  githubBtn.appendChild(createComponent(Icon, {
    name: "github",
    "class": "text-primary"
  }));

  // App version (Show when platform.version — static value, live translation).
  createRenderEffect(() => {
    if (!platform.version) {
      versionSlot.replaceChildren();
      return;
    }
    const el = template(`<p class="text-xs text-secondary"></p>`);
    el.textContent = language.t("error.page.version", {
      version: platform.version
    });
    versionSlot.replaceChildren(el);
  });

  return root;
};
