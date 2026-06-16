/**
 * @file Top-level CLI error formatting. Maps known tagged/named error shapes
 * (CliError, MCP, account, provider, config, UI-cancelled) to user-friendly
 * messages, with a generic fallback formatter for everything else.
 */
import { NamedError } from "core/util/error";
import { errorFormat } from "#util/error.js";
/**
 * Test whether a value is a tagged error carrying the given _tag.
 * @param {*} error - The value to inspect.
 * @param {string} tag - The expected _tag value.
 * @returns {boolean} True if error is an object with a matching _tag.
 */
function isTaggedError(error, tag) {
  return typeof error === "object" && error !== null && "_tag" in error && error._tag === tag;
}
/**
 * Format a recognized CLI/domain error into a user-facing message string.
 * Sets process.exitCode for CliError; returns undefined for unrecognized errors.
 * @param {*} input - The thrown/raised error value.
 * @returns {string} A formatted message, or undefined when the error type is not handled here.
 */
export function FormatError(input) {
  // CliError: domain failure surfaced from an effectCmd handler via fail("...")
  if (isTaggedError(input, "CliError")) {
    const data = input;
    if (data.exitCode != null) process.exitCode = data.exitCode;
    return data.message ?? "";
  }

  // MCPFailed: { name: string }
  if (NamedError.hasName(input, "MCPFailed")) {
    return `MCP server "${input.data?.name}" failed. Note, closedcode does not support MCP authentication yet.`;
  }

  // AccountServiceError, AccountTransportError: TaggedErrorClass
  if (isTaggedError(input, "AccountServiceError") || isTaggedError(input, "AccountTransportError")) {
    return input.message ?? "";
  }

  // ProviderModelNotFoundError: { providerID: string, modelID: string, suggestions?: string[] }
  if (NamedError.hasName(input, "ProviderModelNotFoundError")) {
    const data = input.data;
    const suggestions = Array.isArray(data?.suggestions) ? data.suggestions : [];
    return [`Model not found: ${data?.providerID}/${data?.modelID}`, ...(suggestions.length ? ["Did you mean: " + suggestions.join(", ")] : []), `Try: \`closedcode models\` to list available models`, `Or check your config (closedcode.json) provider/model names`].join("\n");
  }

  // ProviderInitError: { providerID: string }
  if (NamedError.hasName(input, "ProviderInitError")) {
    return `Failed to initialize provider "${input.data?.providerID}". Check credentials and configuration.`;
  }

  // ConfigJsonError: { path: string, message?: string }
  if (NamedError.hasName(input, "ConfigJsonError")) {
    const data = input.data;
    return `Config file at ${data?.path} is not valid JSON(C)` + (data?.message ? `: ${data.message}` : "");
  }

  // ConfigDirectoryTypoError: { dir: string, path: string, suggestion: string }
  if (NamedError.hasName(input, "ConfigDirectoryTypoError")) {
    const data = input.data;
    return `Directory "${data?.dir}" in ${data?.path} is not valid. Rename the directory to "${data?.suggestion}" or remove it. This is a common typo.`;
  }

  // ConfigFrontmatterError: { message: string }
  if (NamedError.hasName(input, "ConfigFrontmatterError")) {
    return input.data?.message ?? "";
  }

  // ConfigInvalidError: { path?: string, message?: string, issues?: Array<{ message: string, path: string[] }> }
  if (NamedError.hasName(input, "ConfigInvalidError")) {
    const data = input.data;
    const path = data?.path;
    const message = data?.message;
    const issues = Array.isArray(data?.issues) ? data.issues : [];
    return [`Configuration is invalid${path && path !== "config" ? ` at ${path}` : ""}` + (message ? `: ${message}` : ""), ...issues.map(issue => "↳ " + issue.message + " " + issue.path.join("."))].join("\n");
  }

  // UICancelledError: void (no data)
  if (NamedError.hasName(input, "UICancelledError")) {
    return "";
  }
}
/**
 * Generic fallback formatter for unrecognized errors.
 * @param {*} input - The error value to format.
 * @returns {string} A best-effort formatted error string.
 */
export function FormatUnknownError(input) {
  return errorFormat(input);
}