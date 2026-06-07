function tr(translator, key, text, vars) {
  if (!translator) return text;
  const out = translator(key, vars);
  if (!out || out === key) return text;
  return out;
}
export function formatServerError(error, translate, fallback) {
  if (isConfigInvalidErrorLike(error)) return parseReadableConfigInvalidError(error, translate);
  if (isProviderModelNotFoundErrorLike(error)) return parseReadableProviderModelNotFoundError(error, translate);
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  if (fallback) return fallback;
  return tr(translate, "error.chain.unknown", "Unknown error");
}
function isConfigInvalidErrorLike(error) {
  if (typeof error !== "object" || error === null) return false;
  const o = error;
  return o.name === "ConfigInvalidError" && typeof o.data === "object" && o.data !== null;
}
function isProviderModelNotFoundErrorLike(error) {
  if (typeof error !== "object" || error === null) return false;
  const o = error;
  return o.name === "ProviderModelNotFoundError" && typeof o.data === "object" && o.data !== null;
}
export function parseReadableConfigInvalidError(errorInput, translator) {
  const file = errorInput.data.path && errorInput.data.path !== "config" ? errorInput.data.path : "config";
  const detail = errorInput.data.message?.trim() ?? "";
  const issues = (errorInput.data.issues ?? []).map(issue => {
    const msg = issue.message.trim();
    if (!issue.path.length) return msg;
    return `${issue.path.join(".")}: ${msg}`;
  }).filter(Boolean);
  const msg = issues.length ? issues.join("\n") : detail;
  if (!msg) return tr(translator, "error.chain.configInvalid", `Config file at ${file} is invalid`, {
    path: file
  });
  return tr(translator, "error.chain.configInvalidWithMessage", `Config file at ${file} is invalid: ${msg}`, {
    path: file,
    message: msg
  });
}
function parseReadableProviderModelNotFoundError(errorInput, translator) {
  const p = errorInput.data.providerID.trim();
  const m = errorInput.data.modelID.trim();
  const list = (errorInput.data.suggestions ?? []).map(v => v.trim()).filter(Boolean);
  const body = tr(translator, "error.chain.modelNotFound", `Model not found: ${p}/${m}`, {
    provider: p,
    model: m
  });
  const tail = tr(translator, "error.chain.checkConfig", "Check your config (closedcode.json) provider/model names");
  if (list.length) {
    const suggestions = list.slice(0, 5).join(", ");
    return [body, tr(translator, "error.chain.didYouMean", `Did you mean: ${suggestions}`, {
      suggestions
    }), tail].join("\n");
  }
  return [body, tail].join("\n");
}