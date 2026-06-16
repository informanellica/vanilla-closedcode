/**
 * @file v2 SDK HTTP client factory. Like {@link module:sdk/client} but also threads
 * an experimental workspace id alongside the project directory onto outgoing
 * requests, and rejects responses that indicate an incompatible server version.
 * @module sdk/v2/client
 */

export * from "./gen/types.gen.js";
import { createClient } from "./gen/client/client.gen.js";
import { OpencodeClient } from "./gen/sdk.gen.js";
export { OpencodeClient };

/**
 * Return `value` unless it is merely an (optionally encoded) restatement of
 * `fallback`, in which case the canonical `fallback` is preferred.
 * @param {string|null|undefined} value - Candidate value (e.g. from a header).
 * @param {string|undefined} fallback - Canonical value to compare against.
 * @param {Function} [encode] - Optional encoder (`(input: string) => string`) used when comparing against `fallback`.
 * @returns {string|undefined} The resolved value, or undefined when none is set.
 */
function pick(value, fallback, encode) {
  if (!value) return;
  if (!fallback) return value;
  if (value === fallback) return fallback;
  if (encode && value === encode(fallback)) return fallback;
  return value;
}
/**
 * Move the `x-closedcode-directory` / `x-closedcode-workspace` hints onto the URL
 * as `directory` / `workspace` query parameters for GET/HEAD requests, then strip
 * the headers so they are not sent twice.
 * @param {Request} request - The outgoing fetch request.
 * @param {{directory: string, workspace: string}} values - Fallback directory and workspace (both optional) used when the corresponding header is absent.
 * @returns {Request} The original request, or a rewritten copy carrying the hints.
 */
function rewrite(request, values) {
  if (request.method !== "GET" && request.method !== "HEAD") return request;
  const url = new URL(request.url);
  let changed = false;
  for (const [name, key] of [["x-closedcode-directory", "directory"], ["x-closedcode-workspace", "workspace"]]) {
    const value = pick(request.headers.get(name), key === "directory" ? values.directory : values.workspace, key === "directory" ? encodeURIComponent : undefined);
    if (!value) continue;
    if (!url.searchParams.has(key)) {
      url.searchParams.set(key, value);
    }
    changed = true;
  }
  if (!changed) return request;
  const next = new Request(url, request);
  next.headers.delete("x-closedcode-directory");
  next.headers.delete("x-closedcode-workspace");
  return next;
}
/**
 * Create a typed v2 client for a running closedcode server.
 * @param {Object} [config] - Client configuration.
 * @param {string} [config.baseUrl] - Base URL of the closedcode server.
 * @param {Function} [config.fetch] - Custom fetch implementation; defaults to global fetch with timeouts disabled.
 * @param {string} [config.directory] - Project directory to scope requests to; sent as the `x-closedcode-directory` header / `directory` query parameter.
 * @param {string} [config.experimental_workspaceID] - Experimental workspace id; sent as the `x-closedcode-workspace` header / `workspace` query parameter.
 * @param {Object} [config.headers] - Additional headers to send with every request.
 * @returns {OpencodeClient} A configured client instance that rejects responses from incompatible server versions.
 */
export function createClosedcodeClient(config) {
  if (!config?.fetch) {
    const customFetch = req => {
      req.timeout = false;
      return fetch(req);
    };
    config = {
      ...config,
      fetch: customFetch
    };
  }
  if (config?.directory) {
    config.headers = {
      ...config.headers,
      "x-closedcode-directory": encodeURIComponent(config.directory)
    };
  }
  if (config?.experimental_workspaceID) {
    config.headers = {
      ...config.headers,
      "x-closedcode-workspace": config.experimental_workspaceID
    };
  }
  const client = createClient(config);
  client.interceptors.request.use(request => rewrite(request, {
    directory: config?.directory,
    workspace: config?.experimental_workspaceID
  }));
  client.interceptors.response.use(response => {
    const contentType = response.headers.get("content-type");
    if (contentType === "text/html") throw new Error("Request is not supported by this version of ClosedCode Server (Server responded with text/html)");
    return response;
  });
  return new OpencodeClient({
    client
  });
}