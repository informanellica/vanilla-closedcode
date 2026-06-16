/** @file Helpers for detecting network connectivity and proxy configuration. */

/**
 * Report whether the runtime appears to be online.
 * Falls back to `true` when no navigator/`onLine` signal is available (e.g. plain Node).
 * @returns {boolean} True if online or connectivity cannot be determined.
 */
export function online() {
  const nav = globalThis.navigator;
  if (!nav || typeof nav.onLine !== "boolean") return true;
  return nav.onLine;
}
/**
 * Report whether an HTTP/HTTPS proxy is configured via environment variables.
 * @returns {boolean} True if any of HTTP_PROXY/HTTPS_PROXY (upper or lower case) is set.
 */
export function proxied() {
  return !!(process.env.HTTP_PROXY || process.env.HTTPS_PROXY || process.env.http_proxy || process.env.https_proxy);
}