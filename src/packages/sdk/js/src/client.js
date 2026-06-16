/**
 * @file SDK HTTP client factory. Builds an {@link OpencodeClient} that talks to a
 * running closedcode server, injecting the active directory as a request header /
 * query parameter so server-side resolution stays scoped to the caller's project.
 * @module sdk/client
 */

export * from "./gen/types.gen.js";
import { createClient } from "./gen/client/client.gen.js";
import { OpencodeClient } from "./gen/sdk.gen.js";
export { OpencodeClient };

/**
 * Return `value` unless it is just an (encoded) restatement of `fallback`, in
 * which case the canonical `fallback` is preferred.
 * @param {string|null|undefined} value - Candidate value (e.g. from a header).
 * @param {string|undefined} fallback - Canonical directory value to compare against.
 * @returns {string|undefined} The resolved value, or undefined when none is set.
 */
function pick(value, fallback) {
  if (!value) return;
  if (!fallback) return value;
  if (value === fallback) return fallback;
  if (value === encodeURIComponent(fallback)) return fallback;
  return value;
}
/**
 * Move the `x-closedcode-directory` hint onto the URL as a `directory` query
 * parameter for GET/HEAD requests (which cannot carry a body), then strip the
 * header so it is not sent twice.
 * @param {Request} request - The outgoing fetch request.
 * @param {string|undefined} directory - Fallback directory when the header is absent.
 * @returns {Request} The original request, or a rewritten copy carrying the directory.
 */
function rewrite(request, directory) {
  if (request.method !== "GET" && request.method !== "HEAD") return request;
  const value = pick(request.headers.get("x-closedcode-directory"), directory);
  if (!value) return request;
  const url = new URL(request.url);
  if (!url.searchParams.has("directory")) {
    url.searchParams.set("directory", value);
  }
  const next = new Request(url, request);
  next.headers.delete("x-closedcode-directory");
  return next;
}
/**
 * Create a typed client for a running closedcode server.
 * @param {Object} [config] - Client configuration.
 * @param {string} [config.baseUrl] - Base URL of the closedcode server.
 * @param {Function} [config.fetch] - Custom fetch implementation; defaults to global fetch with timeouts disabled.
 * @param {string} [config.directory] - Project directory to scope requests to; sent as the `x-closedcode-directory` header / `directory` query parameter.
 * @param {Object} [config.headers] - Additional headers to send with every request.
 * @returns {OpencodeClient} A configured client instance.
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
  const client = createClient(config);
  client.interceptors.request.use(request => rewrite(request, config?.directory));
  return new OpencodeClient({
    client
  });
}