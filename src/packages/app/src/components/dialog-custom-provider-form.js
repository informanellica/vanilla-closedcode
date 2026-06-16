/** @file Validation and row-factory helpers for the custom (OpenAI-compatible) provider form. */

/**
 * Regular expression for a valid custom provider id (lowercase alphanumeric
 * start, then alphanumerics, hyphens, or underscores).
 * @type {RegExp}
 */
const PROVIDER_ID = /^[a-z0-9][a-z0-9-_]*$/;

/**
 * The npm package id used as the AI SDK adapter for custom providers.
 * @type {string}
 */
const OPENAI_COMPATIBLE = "@ai-sdk/openai-compatible";

/**
 * Validates a custom provider form and, when valid, produces the provider
 * config to persist. Computes per-field errors (id format/required/exists,
 * name, base URL) and per-row errors for models and headers; empty placeholder
 * rows are ignored.
 * @param {Object} input - The validation input: `form` (`{providerID, name,
 *   baseURL, apiKey, models, headers}`), `t` (translation function used for
 *   error messages), `disabledProviders` (array of ids treated as
 *   non-conflicting), and `existingProviderIDs` (Set of already-used ids).
 * @returns {Object} A result `{err, models, headers}` always, plus a `result`
 *   object (the provider id/name/key and config) when validation passes.
 */
export function validateCustomProvider(input) {
  const providerID = input.form.providerID.trim();
  const name = input.form.name.trim();
  const baseURL = input.form.baseURL.trim();
  const apiKey = input.form.apiKey.trim();
  const env = apiKey.match(/^\{env:([^}]+)\}$/)?.[1]?.trim();
  const key = apiKey && !env ? apiKey : undefined;
  const idError = !providerID ? input.t("provider.custom.error.providerID.required") : !PROVIDER_ID.test(providerID) ? input.t("provider.custom.error.providerID.format") : undefined;
  const nameError = !name ? input.t("provider.custom.error.name.required") : undefined;
  const urlError = !baseURL ? input.t("provider.custom.error.baseURL.required") : !/^https?:\/\//.test(baseURL) ? input.t("provider.custom.error.baseURL.format") : undefined;
  const disabled = input.disabledProviders.includes(providerID);
  const existsError = idError ? undefined : input.existingProviderIDs.has(providerID) && !disabled ? input.t("provider.custom.error.providerID.exists") : undefined;
  const seenModels = new Set();
  const models = input.form.models.map(m => {
    const id = m.id.trim();
    const name = m.name.trim();
    // A fully-empty row (no id and no name) is just a placeholder — ignore it
    // (no error, dropped from config) so it never blocks saving.
    if (!id && !name) return {};
    const idError = !id ? input.t("provider.custom.error.required") : seenModels.has(id) ? input.t("provider.custom.error.duplicate") : (() => {
      seenModels.add(id);
      return undefined;
    })();
    const nameError = !name ? input.t("provider.custom.error.required") : undefined;
    return {
      id: idError,
      name: nameError
    };
  });
  const modelsValid = models.every(m => !m.id && !m.name);
  const modelConfig = Object.fromEntries(input.form.models.filter(m => m.id.trim() || m.name.trim()).map(m => [m.id.trim(), {
    name: m.name.trim()
  }]));
  const seenHeaders = new Set();
  const headers = input.form.headers.map(h => {
    const key = h.key.trim();
    const value = h.value.trim();
    if (!key && !value) return {};
    const keyError = !key ? input.t("provider.custom.error.required") : seenHeaders.has(key.toLowerCase()) ? input.t("provider.custom.error.duplicate") : (() => {
      seenHeaders.add(key.toLowerCase());
      return undefined;
    })();
    const valueError = !value ? input.t("provider.custom.error.required") : undefined;
    return {
      key: keyError,
      value: valueError
    };
  });
  const headersValid = headers.every(h => !h.key && !h.value);
  const headerConfig = Object.fromEntries(input.form.headers.map(h => ({
    key: h.key.trim(),
    value: h.value.trim()
  })).filter(h => !!h.key && !!h.value).map(h => [h.key, h.value]));
  const err = {
    providerID: idError ?? existsError,
    name: nameError,
    baseURL: urlError
  };
  const ok = !idError && !existsError && !nameError && !urlError && modelsValid && headersValid;
  if (!ok) return {
    err,
    models,
    headers
  };
  return {
    err,
    models,
    headers,
    result: {
      providerID,
      name,
      key,
      config: {
        npm: OPENAI_COMPATIBLE,
        name,
        ...(env ? {
          env: [env]
        } : {}),
        options: {
          baseURL,
          ...(Object.keys(headerConfig).length ? {
            headers: headerConfig
          } : {})
        },
        models: modelConfig
      }
    }
  };
}
let row = 0;

/**
 * Generates a unique, stable key for a form row.
 * @returns {string} A unique row id like "row-0".
 */
const nextRow = () => `row-${row++}`;

/**
 * Factory for a blank model row in the custom provider form.
 * @returns {Object} A new model row `{row, id, name, origId, origName, err}`.
 */
export const modelRow = () => ({
  row: nextRow(),
  id: "",
  name: "",
  // The id / name as they exist on the server (empty origId = a brand-new row
  // not yet pulled). Used to decide the row action: add / apply / delete, and
  // to detect edits (id or name changed).
  origId: "",
  origName: "",
  err: {}
});
/**
 * Factory for a blank custom-header row in the custom provider form.
 * @returns {Object} A new header row `{row, key, value, err}`.
 */
export const headerRow = () => ({
  row: nextRow(),
  key: "",
  value: "",
  err: {}
});