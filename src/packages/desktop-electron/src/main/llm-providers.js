/** @file Main-process LLM provider registry (Ollama + generic OpenAI-compatible) for listing, pulling, deleting models and querying model capabilities. */
// LLM provider registry for model management (list installed models / pull).
//
// Extensibility: add a new provider by adding an entry keyed by its "kind".
// Each entry implements `listModels(baseURL)` and optionally `pull(...)`. The
// UI is capability-driven (it shows a pull control only when `pull` exists), so
// nothing hard-codes Ollama. `baseURL` is the OpenAI-compatible URL the user
// configured (e.g. http://host:11434/v1 — local or a remote box like a DGX
// Spark); each provider derives whatever native endpoint it needs from it.
//
// Calls run in the main (Node) process so they work for remote hosts without
// browser CORS restrictions and can stream pull progress back over IPC.

/**
 * Reduce a base URL to its scheme + host root (dropping any path), defaulting to http://.
 * @param {string} baseURL - The configured provider base URL (may omit the scheme).
 * @returns {string} The "scheme://host" root.
 */
function hostRoot(baseURL) {
  const u = new URL(/^https?:\/\//.test(baseURL) ? baseURL : "http://" + baseURL);
  return u.protocol + "//" + u.host;
}

/**
 * Fetch a URL and parse the response body as JSON, throwing on a non-OK status.
 * @param {string} url - The request URL.
 * @param {Object} init - Optional fetch init options (method, headers, body).
 * @returns {Promise<Object>} The parsed JSON response.
 * @throws {Error} When the HTTP response status is not OK.
 */
async function fetchJson(url, init) {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error("HTTP " + res.status + " " + res.statusText);
  return res.json();
}

/**
 * Provider entry for an Ollama server. Talks to Ollama's native /api/* endpoints
 * and supports streaming `pull` of new models.
 * @type {Object}
 */
const ollama = {
  kind: "ollama",
  label: "Ollama",
  // Ollama's native API (…/api/*), separate from the OpenAI-compatible /v1.
  /**
   * List models installed on the Ollama server (GET /api/tags).
   * @param {string} baseURL - The provider base URL.
   * @returns {Promise<Array>} Array of {id, name, size} model descriptors.
   */
  async listModels(baseURL) {
    const data = await fetchJson(hostRoot(baseURL) + "/api/tags");
    return (data.models || []).map(m => ({ id: m.name, name: m.name, size: m.size }));
  },
  // `ollama pull` over the API, streaming NDJSON progress to onProgress.
  /**
   * Pull (download) a model on the Ollama server, streaming progress events.
   * @param {string} baseURL - The provider base URL.
   * @param {string} model - The model name to pull.
   * @param {Function} onProgress - Called with each parsed NDJSON progress object.
   * @returns {Promise<void>} Resolves when the stream ends.
   * @throws {Error} When the request fails or the stream reports an error.
   */
  async pull(baseURL, model, onProgress) {
    const res = await fetch(hostRoot(baseURL) + "/api/pull", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: model, stream: true }),
    });
    if (!res.ok || !res.body) throw new Error("HTTP " + res.status + " " + res.statusText);
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        try {
          const obj = JSON.parse(line);
          onProgress(obj);
          if (obj.error) throw new Error(obj.error);
        } catch (e) {
          if (e instanceof SyntaxError) continue;
          throw e;
        }
      }
    }
  },
};

// Fallback for any OpenAI-compatible server (LM Studio / vLLM / llama.cpp / …):
// list via GET /v1/models. No standardized pull, so no `pull` here.
/**
 * Fallback provider entry for any OpenAI-compatible server (LM Studio, vLLM,
 * llama.cpp, etc.). Lists models via GET /v1/models; offers no `pull`.
 * @type {Object}
 */
const openaiCompatible = {
  kind: "openai-compatible",
  label: "OpenAI互換",
  /**
   * List models advertised by an OpenAI-compatible server (GET .../models).
   * @param {string} baseURL - The provider base URL (typically ending in /v1).
   * @returns {Promise<Array>} Array of {id, name} model descriptors.
   */
  async listModels(baseURL) {
    const root = baseURL.replace(/\/+$/, "");
    const data = await fetchJson(root + "/models");
    return (data.data || data.models || []).map(m => ({ id: m.id || m.name, name: m.id || m.name }));
  },
};

const REGISTRY = { ollama };

/**
 * Resolve the provider entry for a kind, falling back to the OpenAI-compatible provider.
 * @param {string} kind - The provider kind key (e.g. "ollama").
 * @returns {Object} The matching provider entry, or the OpenAI-compatible fallback.
 */
export function getProvider(kind) {
  return REGISTRY[kind] || openaiCompatible;
}

/**
 * Report whether the provider for a kind supports pulling (downloading) models.
 * @param {string} kind - The provider kind key.
 * @returns {boolean} True when the provider implements `pull`.
 */
export function providerCanPull(kind) {
  return typeof getProvider(kind).pull === "function";
}

/**
 * Whether a model accepts image (vision) input. Uses Ollama's /api/show, which
 * advertises a `capabilities` array (e.g. ["completion","tools","vision"]).
 * Returns true (vision), false (explicitly no vision), or null when capability
 * info is unavailable (non-Ollama server, unreachable, or older Ollama) — in
 * which case callers should NOT block, since we cannot be sure.
 */
/**
 * Ollama `/api/ps`: the currently loaded models with their resident size and
 * the portion resident in VRAM. size_vram/size is the GPU placement ratio
 * (the rest is on CPU/RAM). Returns null when unavailable (non-Ollama, etc.).
 * @param {string} baseURL - The provider base URL.
 * @returns {Promise<Array>} Array of {name, size, sizeVram} loaded-model stats, or null when unavailable.
 */
export async function ollamaPs(baseURL) {
  try {
    const data = await fetchJson(hostRoot(baseURL) + "/api/ps");
    return (data.models || []).map(m => ({
      name: m.name,
      size: m.size,
      sizeVram: m.size_vram,
    }));
  } catch {
    return null;
  }
}

/**
 * Delete (ollama rm) a model from an Ollama server: DELETE /api/delete {name}.
 * Throws on a non-OK response so the UI can surface the failure.
 * @param {string} baseURL - The provider base URL.
 * @param {string} model - The model name to delete.
 * @returns {Promise<boolean>} True when the model is deleted.
 * @throws {Error} When the HTTP response status is not OK.
 */
export async function ollamaDelete(baseURL, model) {
  const res = await fetch(hostRoot(baseURL) + "/api/delete", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: model }),
  });
  if (!res.ok) throw new Error("HTTP " + res.status + " " + res.statusText);
  return true;
}

/**
 * Determine whether a model accepts image (vision) input, via Ollama's /api/show.
 * @param {string} baseURL - The provider base URL.
 * @param {string} model - The model name to query.
 * @returns {Promise<boolean>} True/false for vision support, or null when capability info is unavailable.
 */
export async function modelSupportsVision(baseURL, model) {
  try {
    const data = await fetchJson(hostRoot(baseURL) + "/api/show", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model }),
    });
    if (!Array.isArray(data.capabilities)) return null;
    return data.capabilities.includes("vision");
  } catch {
    return null;
  }
}
