/** @file URL-safe base64 encode/decode plus content hashing and lightweight checksum helpers. */

/**
 * Encode a string to URL-safe base64 (with `+`/`/` replaced by `-`/`_` and padding stripped).
 * @param {string} value - The UTF-8 string to encode.
 * @returns {string} The URL-safe base64 representation.
 */
export function base64Encode(value) {
  const bytes = new TextEncoder().encode(value);
  const binary = Array.from(bytes, b => String.fromCharCode(b)).join("");
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}
/**
 * Decode a URL-safe base64 string (as produced by base64Encode) back to its UTF-8 string.
 * @param {string} value - The URL-safe base64 string to decode.
 * @returns {string} The decoded UTF-8 string.
 */
export function base64Decode(value) {
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
/**
 * Compute a hex-encoded cryptographic digest of a string using the Web Crypto API.
 * @param {string} content - The content to hash.
 * @param {string} algorithm - The digest algorithm name (default "SHA-256").
 * @returns {Promise<string>} A promise resolving to the lowercase hex digest.
 */
export async function hash(content, algorithm = "SHA-256") {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest(algorithm, data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
  return hashHex;
}
/**
 * Compute a fast, non-cryptographic FNV-1a checksum encoded in base36.
 * @param {string} content - The content to checksum.
 * @returns {string|undefined} The base36 checksum, or undefined when content is empty/falsy.
 */
export function checksum(content) {
  if (!content) return undefined;
  let hash = 0x811c9dc5;
  for (let i = 0; i < content.length; i++) {
    hash ^= content.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}
/**
 * Compute a checksum that, for large content, samples fixed-size windows at several offsets
 * (start, 25%, 50%, 75%, end) and combines them with the total length to cheaply detect changes.
 * Falls back to a full checksum when content is at or below the limit.
 * @param {string} content - The content to checksum.
 * @param {number} limit - Length threshold above which sampling is used (default 500000).
 * @returns {string|undefined} The combined checksum string, or undefined when content is empty/falsy.
 */
export function sampledChecksum(content, limit = 500_000) {
  if (!content) return undefined;
  if (content.length <= limit) return checksum(content);
  const size = 4096;
  const points = [0, Math.floor(content.length * 0.25), Math.floor(content.length * 0.5), Math.floor(content.length * 0.75), content.length - size];
  const hashes = points.map(point => {
    const start = Math.max(0, Math.min(content.length - size, point - Math.floor(size / 2)));
    return checksum(content.slice(start, start + size)) ?? "";
  }).join(":");
  return `${content.length}:${hashes}`;
}