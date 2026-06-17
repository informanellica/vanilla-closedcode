/** @file Resolves CLOSEDCODE_* environment variables into the typed `Flag` feature-flag object consumed across core. */
import { Config } from "effect";
import { InstallationChannel } from "../installation/version.js";
/**
 * Tests whether an environment variable is set to an affirmative value.
 * @param {string} key - Name of the environment variable to read.
 * @returns {boolean} True when the value (case-insensitive) is "true" or "1".
 */
function truthy(key) {
  const value = process.env[key]?.toLowerCase();
  return value === "true" || value === "1";
}
/**
 * Tests whether an environment variable is set to a negative value.
 * @param {string} key - Name of the environment variable to read.
 * @returns {boolean} True when the value (case-insensitive) is "false" or "0".
 */
function falsy(key) {
  const value = process.env[key]?.toLowerCase();
  return value === "false" || value === "0";
}

// Channels that default to the new effect-httpapi server backend. The legacy
// Express backend remains the default for stable (`prod`/`latest`) installs.
const HTTPAPI_DEFAULT_ON_CHANNELS = new Set(["dev", "beta", "local"]);
/**
 * Parses an environment variable as a positive integer.
 * @param {string} key - Name of the environment variable to read.
 * @returns {number} The parsed positive integer, or undefined when unset or not a positive integer.
 */
function number(key) {
  const value = process.env[key];
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}
const CLOSEDCODE_EXPERIMENTAL = truthy("CLOSEDCODE_EXPERIMENTAL");
const CLOSEDCODE_DISABLE_CLAUDE_CODE = truthy("CLOSEDCODE_DISABLE_CLAUDE_CODE");
const CLOSEDCODE_DISABLE_CLAUDE_CODE_SKILLS = CLOSEDCODE_DISABLE_CLAUDE_CODE || truthy("CLOSEDCODE_DISABLE_CLAUDE_CODE_SKILLS");
const copy = process.env["CLOSEDCODE_EXPERIMENTAL_DISABLE_COPY_ON_SELECT"];
/**
 * Centralized feature-flag and configuration object derived from CLOSEDCODE_* environment variables.
 * Most entries are resolved at module load; getter properties are evaluated on access so that
 * env vars set later at runtime (by tests, the CLI, or external tooling) are observed.
 * @type {Object}
 */
export const Flag = {
  OTEL_EXPORTER_OTLP_ENDPOINT: process.env["OTEL_EXPORTER_OTLP_ENDPOINT"],
  OTEL_EXPORTER_OTLP_HEADERS: process.env["OTEL_EXPORTER_OTLP_HEADERS"],
  CLOSEDCODE_AUTO_SHARE: truthy("CLOSEDCODE_AUTO_SHARE"),
  CLOSEDCODE_AUTO_HEAP_SNAPSHOT: truthy("CLOSEDCODE_AUTO_HEAP_SNAPSHOT"),
  CLOSEDCODE_GIT_BASH_PATH: process.env["CLOSEDCODE_GIT_BASH_PATH"],
  CLOSEDCODE_CONFIG: process.env["CLOSEDCODE_CONFIG"],
  CLOSEDCODE_CONFIG_CONTENT: process.env["CLOSEDCODE_CONFIG_CONTENT"],
  CLOSEDCODE_DISABLE_AUTOUPDATE: truthy("CLOSEDCODE_DISABLE_AUTOUPDATE"),
  CLOSEDCODE_ALWAYS_NOTIFY_UPDATE: truthy("CLOSEDCODE_ALWAYS_NOTIFY_UPDATE"),
  CLOSEDCODE_DISABLE_PRUNE: truthy("CLOSEDCODE_DISABLE_PRUNE"),
  CLOSEDCODE_DISABLE_TERMINAL_TITLE: truthy("CLOSEDCODE_DISABLE_TERMINAL_TITLE"),
  CLOSEDCODE_SHOW_TTFD: truthy("CLOSEDCODE_SHOW_TTFD"),
  CLOSEDCODE_PERMISSION: process.env["CLOSEDCODE_PERMISSION"],
  CLOSEDCODE_DISABLE_DEFAULT_PLUGINS: truthy("CLOSEDCODE_DISABLE_DEFAULT_PLUGINS"),
  CLOSEDCODE_DISABLE_LSP_DOWNLOAD: truthy("CLOSEDCODE_DISABLE_LSP_DOWNLOAD"),
  CLOSEDCODE_ENABLE_EXPERIMENTAL_MODELS: truthy("CLOSEDCODE_ENABLE_EXPERIMENTAL_MODELS"),
  CLOSEDCODE_DISABLE_AUTOCOMPACT: truthy("CLOSEDCODE_DISABLE_AUTOCOMPACT"),
  CLOSEDCODE_DISABLE_MODELS_FETCH: truthy("CLOSEDCODE_DISABLE_MODELS_FETCH"),
  CLOSEDCODE_DISABLE_MOUSE: truthy("CLOSEDCODE_DISABLE_MOUSE"),
  CLOSEDCODE_DISABLE_CLAUDE_CODE,
  CLOSEDCODE_DISABLE_CLAUDE_CODE_PROMPT: CLOSEDCODE_DISABLE_CLAUDE_CODE || truthy("CLOSEDCODE_DISABLE_CLAUDE_CODE_PROMPT"),
  CLOSEDCODE_DISABLE_CLAUDE_CODE_SKILLS,
  CLOSEDCODE_DISABLE_EXTERNAL_SKILLS: truthy("CLOSEDCODE_DISABLE_EXTERNAL_SKILLS"),
  CLOSEDCODE_FAKE_VCS: process.env["CLOSEDCODE_FAKE_VCS"],
  CLOSEDCODE_SERVER_PASSWORD: process.env["CLOSEDCODE_SERVER_PASSWORD"],
  CLOSEDCODE_SERVER_USERNAME: process.env["CLOSEDCODE_SERVER_USERNAME"],
  CLOSEDCODE_ENABLE_QUESTION_TOOL: truthy("CLOSEDCODE_ENABLE_QUESTION_TOOL"),
  // Experimental
  CLOSEDCODE_EXPERIMENTAL,
  CLOSEDCODE_EXPERIMENTAL_FILEWATCHER: Config.boolean("CLOSEDCODE_EXPERIMENTAL_FILEWATCHER").pipe(Config.withDefault(false)),
  CLOSEDCODE_EXPERIMENTAL_DISABLE_FILEWATCHER: Config.boolean("CLOSEDCODE_EXPERIMENTAL_DISABLE_FILEWATCHER").pipe(Config.withDefault(false)),
  CLOSEDCODE_EXPERIMENTAL_ICON_DISCOVERY: CLOSEDCODE_EXPERIMENTAL || truthy("CLOSEDCODE_EXPERIMENTAL_ICON_DISCOVERY"),
  CLOSEDCODE_EXPERIMENTAL_DISABLE_COPY_ON_SELECT: copy === undefined ? process.platform === "win32" : truthy("CLOSEDCODE_EXPERIMENTAL_DISABLE_COPY_ON_SELECT"),
  CLOSEDCODE_ENABLE_EXA: truthy("CLOSEDCODE_ENABLE_EXA") || CLOSEDCODE_EXPERIMENTAL || truthy("CLOSEDCODE_EXPERIMENTAL_EXA"),
  CLOSEDCODE_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS: number("CLOSEDCODE_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS"),
  CLOSEDCODE_EXPERIMENTAL_OUTPUT_TOKEN_MAX: number("CLOSEDCODE_EXPERIMENTAL_OUTPUT_TOKEN_MAX"),
  CLOSEDCODE_EXPERIMENTAL_OXFMT: CLOSEDCODE_EXPERIMENTAL || truthy("CLOSEDCODE_EXPERIMENTAL_OXFMT"),
  CLOSEDCODE_EXPERIMENTAL_LSP_TY: truthy("CLOSEDCODE_EXPERIMENTAL_LSP_TY"),
  CLOSEDCODE_EXPERIMENTAL_LSP_TOOL: CLOSEDCODE_EXPERIMENTAL || truthy("CLOSEDCODE_EXPERIMENTAL_LSP_TOOL"),
  CLOSEDCODE_EXPERIMENTAL_PLAN_MODE: CLOSEDCODE_EXPERIMENTAL || truthy("CLOSEDCODE_EXPERIMENTAL_PLAN_MODE"),
  CLOSEDCODE_EXPERIMENTAL_MARKDOWN: !falsy("CLOSEDCODE_EXPERIMENTAL_MARKDOWN"),
  CLOSEDCODE_MODELS_URL: process.env["CLOSEDCODE_MODELS_URL"],
  CLOSEDCODE_MODELS_PATH: process.env["CLOSEDCODE_MODELS_PATH"],
  CLOSEDCODE_DISABLE_EMBEDDED_WEB_UI: truthy("CLOSEDCODE_DISABLE_EMBEDDED_WEB_UI"),
  CLOSEDCODE_DB: process.env["CLOSEDCODE_DB"],
  CLOSEDCODE_DISABLE_CHANNEL_DB: truthy("CLOSEDCODE_DISABLE_CHANNEL_DB"),
  CLOSEDCODE_SKIP_MIGRATIONS: truthy("CLOSEDCODE_SKIP_MIGRATIONS"),
  CLOSEDCODE_STRICT_CONFIG_DEPS: truthy("CLOSEDCODE_STRICT_CONFIG_DEPS"),
  CLOSEDCODE_WORKSPACE_ID: process.env["CLOSEDCODE_WORKSPACE_ID"],
  // Defaults to true on dev/beta/local channels so internal users exercise the
  // new effect-httpapi server backend. Stable (`prod`/`latest`) installs stay
  // on the legacy Express backend until the rollout is complete. An explicit env
  // var ("true"/"1" or "false"/"0") always wins, providing an opt-in for
  // stable users and an escape hatch for dev/beta users.
  CLOSEDCODE_EXPERIMENTAL_HTTPAPI: truthy("CLOSEDCODE_EXPERIMENTAL_HTTPAPI") || !falsy("CLOSEDCODE_EXPERIMENTAL_HTTPAPI") && HTTPAPI_DEFAULT_ON_CHANNELS.has(InstallationChannel),
  CLOSEDCODE_EXPERIMENTAL_WORKSPACES: CLOSEDCODE_EXPERIMENTAL || truthy("CLOSEDCODE_EXPERIMENTAL_WORKSPACES"),
  CLOSEDCODE_EXPERIMENTAL_EVENT_SYSTEM: CLOSEDCODE_EXPERIMENTAL || truthy("CLOSEDCODE_EXPERIMENTAL_EVENT_SYSTEM"),
  // Evaluated at access time (not module load) because tests, the CLI, and
  // external tooling set these env vars at runtime.
  get CLOSEDCODE_DISABLE_PROJECT_CONFIG() {
    return truthy("CLOSEDCODE_DISABLE_PROJECT_CONFIG");
  },
  get CLOSEDCODE_TUI_CONFIG() {
    return process.env["CLOSEDCODE_TUI_CONFIG"];
  },
  get CLOSEDCODE_CONFIG_DIR() {
    return process.env["CLOSEDCODE_CONFIG_DIR"];
  },
  get CLOSEDCODE_PURE() {
    return truthy("CLOSEDCODE_PURE");
  },
  get CLOSEDCODE_PLUGIN_META_FILE() {
    return process.env["CLOSEDCODE_PLUGIN_META_FILE"];
  },
  get CLOSEDCODE_CLIENT() {
    return process.env["CLOSEDCODE_CLIENT"] ?? "cli";
  }
};