/** @file Discovers the model list exposed by a local LLM server (Ollama / LM Studio / OpenAI-compatible). */

/**
 * Fetch a URL, preferring the Electron main-process bridge when available so the request can bypass renderer CORS.
 * @param {string} url - The endpoint to request.
 * @param {Object} headers - Request headers as a plain key/value map.
 * @returns {Promise<Object>} Resolves to a response shape with `ok`, `status`, `statusText` and `body` (raw text).
 */
async function doFetch(url, headers) {
  const bridge = typeof window !== "undefined" ? window.api?.fetchLocalLLM : undefined;
  if (bridge) return bridge(url, headers);
  const res = await fetch(url, {
    headers
  });
  const body = await res.text();
  return {
    ok: res.ok,
    status: res.status,
    statusText: res.statusText,
    body
  };
}
/**
 * Discover available model IDs from a local LLM server by probing the OpenAI `/models` endpoint and the Ollama `/api/tags` endpoint.
 * @param {Object} args - Request arguments: `baseURL` (string), `headers` (Array of {key, value}) and `apiKey` (string).
 * @returns {Promise<Array>} Resolves to a sorted, de-duplicated array of model id strings.
 * @throws {Error} When the base URL is invalid or no endpoint yields any models.
 */
export async function fetchLocalModels(args) {
  const baseURL = args.baseURL.trim().replace(/\/+$/, "");
  if (!baseURL || !/^https?:\/\//.test(baseURL)) {
    throw new Error("Invalid base URL");
  }
  const requestHeaders = {};
  for (const h of args.headers) {
    const k = h.key.trim();
    const v = h.value.trim();
    if (k && v) requestHeaders[k] = v;
  }
  const apiKey = args.apiKey.trim();
  if (apiKey && !apiKey.match(/^\{env:[^}]+\}$/) && !requestHeaders["Authorization"]) {
    requestHeaders["Authorization"] = `Bearer ${apiKey}`;
  }
  const candidates = [{
    url: `${baseURL}/models`,
    pick: json => {
      if (json && typeof json === "object" && "data" in json && Array.isArray(json.data)) {
        return json.data.map(m => typeof m?.id === "string" ? m.id : undefined).filter(id => !!id);
      }
      return undefined;
    }
  }, {
    url: `${baseURL.replace(/\/v1$/, "")}/api/tags`,
    pick: json => {
      if (json && typeof json === "object" && "models" in json && Array.isArray(json.models)) {
        return json.models.map(m => {
          if (typeof m?.name === "string") return m.name;
          if (typeof m?.model === "string") return m.model;
          return undefined;
        }).filter(id => !!id);
      }
      return undefined;
    }
  }];
  const errors = [];
  for (const c of candidates) {
    try {
      const res = await doFetch(c.url, requestHeaders);
      if (!res.ok) {
        errors.push(`${c.url} → ${res.status} ${res.statusText}`);
        continue;
      }
      let json;
      try {
        json = JSON.parse(res.body);
      } catch {
        errors.push(`${c.url} → invalid JSON`);
        continue;
      }
      const ids = c.pick(json);
      if (ids && ids.length > 0) return Array.from(new Set(ids)).sort();
      errors.push(`${c.url} → no models in response`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`${c.url} → ${message}`);
    }
  }
  throw new Error(`No models discovered. Tried:\n${errors.join("\n")}`);
}