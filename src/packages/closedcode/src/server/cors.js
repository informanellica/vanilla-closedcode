/** @file CORS origin allow-list check for the server: permits localhost, the renderer scheme, and configured origins. */
/**
 * Determine whether a request Origin is allowed by CORS.
 * Always allows a missing origin, http://localhost:* and http://127.0.0.1:* ports,
 * and the vcc://renderer scheme; otherwise allows it only if listed in opts.cors.
 * @param {string} input - The request Origin header value (may be empty/undefined).
 * @param {Object} opts - Options object; opts.cors is an array of explicitly allowed origins.
 * @returns {boolean} True if the origin is allowed, false otherwise.
 */
export function isAllowedCorsOrigin(input, opts) {
  if (!input) return true;
  if (input.startsWith("http://localhost:")) return true;
  if (input.startsWith("http://127.0.0.1:")) return true;
  if (input.startsWith("vcc://renderer")) return true;
  return opts?.cors?.includes(input) ?? false;
}