/** @file Helpers for proxying HTTP/WebSocket requests: strip hop-by-hop/internal headers and translate URLs/protocols for upstream forwarding. */
/**
 * Set of hop-by-hop header names that must not be forwarded to an upstream target.
 * @type {Set<string>}
 */
const hop = new Set(["connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "proxy-connection", "te", "trailer", "transfer-encoding", "upgrade", "host"]);
/**
 * Remove hop-by-hop and internal routing headers from a Headers object in place.
 * Strips the hop-by-hop set plus accept-encoding and the x-closedcode/x-opencode directory/workspace headers.
 * @param {Headers} out - The Headers object to mutate.
 * @returns {void}
 */
function sanitize(out) {
  for (const key of hop) out.delete(key);
  out.delete("accept-encoding");
  out.delete("x-closedcode-directory");
  out.delete("x-closedcode-workspace");
  out.delete("x-opencode-directory");
  out.delete("x-opencode-workspace");
}
/**
 * Build a sanitized Headers object suitable for forwarding to an upstream target.
 * Accepts either a Request (uses its headers) or a Headers/plain-object header source,
 * removes hop-by-hop/internal headers, then applies any `extra` overrides.
 * @param {Request|Headers|Object} input - A Request, a Headers instance, or a plain key/value header object.
 * @param {Request|Headers|Object} extra - Optional additional headers to set after sanitization.
 * @returns {Headers} The sanitized (and optionally augmented) Headers object.
 */
export function headers(input, extra) {
  const raw = input instanceof Request ? input.headers : input;
  const out = new Headers(raw instanceof Headers ? raw : Object.entries(raw));
  sanitize(out);
  if (!extra) return out;
  for (const [key, value] of new Headers(extra).entries()) {
    out.set(key, value);
  }
  return out;
}
/**
 * Parse the requested WebSocket subprotocols from the sec-websocket-protocol header.
 * @param {Request|Object} input - A Request, or a plain object exposing the "sec-websocket-protocol" header.
 * @returns {Array} An array of trimmed, non-empty protocol names (empty when the header is absent).
 */
export function websocketProtocols(input) {
  const value = input instanceof Request ? input.headers.get("sec-websocket-protocol") : input["sec-websocket-protocol"];
  if (!value) return [];
  return value.split(",").map(item => item.trim()).filter(Boolean);
}
/**
 * Convert an http(s) URL into its WebSocket (ws/wss) equivalent for proxying.
 * @param {string} url - The source URL (typically http: or https:).
 * @returns {string} The URL string with the protocol mapped to ws: or wss: as appropriate.
 */
export function websocketTargetURL(url) {
  const next = new URL(url);
  if (next.protocol === "http:") next.protocol = "ws:";
  if (next.protocol === "https:") next.protocol = "wss:";
  return next.toString();
}
export * as ProxyUtil from "./proxy-util.js";