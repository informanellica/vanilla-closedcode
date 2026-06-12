import { NamedError } from "core/util/error";
import { errorFormat } from "#util/error.js";
function isTaggedError(error, tag) {
  return typeof error === "object" && error !== null && "_tag" in error && error._tag === tag;
}
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
export function FormatUnknownError(input) {
  return errorFormat(input);
}