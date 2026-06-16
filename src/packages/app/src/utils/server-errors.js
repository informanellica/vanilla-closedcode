/** @file Turns server/SDK error objects into readable, optionally localized messages. */

/**
 * Translate a key when a translator is available, otherwise return fallback text.
 * @param {Function} translator - Translation function called with key and vars; may be undefined.
 * @param {string} key - The translation key to resolve.
 * @param {string} text - Fallback text used when no translator or no translation exists.
 * @param {Object} vars - Optional interpolation variables passed to the translator.
 * @returns {string} The translated string, or the fallback text.
 */
function tr(translator, key, text, vars) {
  if (!translator) return text;
  const out = translator(key, vars);
  if (!out || out === key) return text;
  return out;
}
/**
 * Reduce any server error into a human-readable, optionally localized message.
 * @param {*} error - The error to format: an Error, a string, or a structured SDK error object.
 * @param {Function} translate - Optional translation function for localized messages.
 * @param {string} fallback - Optional fallback message when the error carries no usable text.
 * @returns {string} A readable error message.
 */
export function formatServerError(error, translate, fallback) {
  if (isConfigInvalidErrorLike(error)) return parseReadableConfigInvalidError(error, translate);
  if (isProviderModelNotFoundErrorLike(error)) return parseReadableProviderModelNotFoundError(error, translate);
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  if (fallback) return fallback;
  return tr(translate, "error.chain.unknown", "Unknown error");
}
/**
 * Detect a ConfigInvalidError-shaped object carrying a data payload.
 * @param {*} error - The value to test.
 * @returns {boolean} True when the value looks like a ConfigInvalidError with data.
 */
function isConfigInvalidErrorLike(error) {
  if (typeof error !== "object" || error === null) return false;
  const o = error;
  return o.name === "ConfigInvalidError" && typeof o.data === "object" && o.data !== null;
}
/**
 * Detect a ProviderModelNotFoundError-shaped object carrying a data payload.
 * @param {*} error - The value to test.
 * @returns {boolean} True when the value looks like a ProviderModelNotFoundError with data.
 */
function isProviderModelNotFoundErrorLike(error) {
  if (typeof error !== "object" || error === null) return false;
  const o = error;
  return o.name === "ProviderModelNotFoundError" && typeof o.data === "object" && o.data !== null;
}
/**
 * Build a readable message from a ConfigInvalidError, listing its validation issues.
 * @param {Object} errorInput - The ConfigInvalidError-like object with a data payload (path, message, issues).
 * @param {Function} translator - Optional translation function for localized messages.
 * @returns {string} A readable description naming the config file and its problems.
 */
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
/**
 * Build a readable message from a ProviderModelNotFoundError, including any suggestions.
 * @param {Object} errorInput - The ProviderModelNotFoundError-like object with a data payload (providerID, modelID, suggestions).
 * @param {Function} translator - Optional translation function for localized messages.
 * @returns {string} A multi-line message naming the missing provider/model and guidance.
 */
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