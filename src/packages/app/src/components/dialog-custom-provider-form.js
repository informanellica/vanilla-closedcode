const PROVIDER_ID = /^[a-z0-9][a-z0-9-_]*$/;
const OPENAI_COMPATIBLE = "@ai-sdk/openai-compatible";
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
const nextRow = () => `row-${row++}`;
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
export const headerRow = () => ({
  row: nextRow(),
  key: "",
  value: "",
  err: {}
});