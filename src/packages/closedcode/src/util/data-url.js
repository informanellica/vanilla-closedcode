/** @file Decodes `data:` URLs to their textual payload, handling both base64 and percent-encoded bodies. */

/**
 * Decodes a `data:` URL into its textual payload.
 *
 * Supports base64-encoded bodies (when the header contains `;base64`) and
 * percent-encoded bodies (decoded via decodeURIComponent).
 *
 * @param {string} url - A `data:` URL string
 * @returns {string} The decoded UTF-8 text, or an empty string if there is no comma separator
 */
export function decodeDataUrl(url) {
  const idx = url.indexOf(",");
  if (idx === -1) return "";
  const head = url.slice(0, idx);
  const body = url.slice(idx + 1);
  if (head.includes(";base64")) return Buffer.from(body, "base64").toString("utf8");
  return decodeURIComponent(body);
}