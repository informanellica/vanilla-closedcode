/** @file UUID generator: uses crypto.randomUUID when available with a Math.random fallback. */
/**
 * Generate a pseudo-random hex string fallback id (used when crypto.randomUUID is unavailable).
 * @returns {string} A short random hexadecimal string.
 */
const fallback = () => Math.random().toString(16).slice(2);
/**
 * Generate a UUID, preferring crypto.randomUUID and falling back to a random hex string
 * when crypto is unavailable, the context is insecure, or randomUUID throws.
 * @returns {string} A UUID (or fallback id).
 */
export function uuid() {
  const c = globalThis.crypto;
  if (!c || typeof c.randomUUID !== "function") return fallback();
  if (typeof globalThis.isSecureContext === "boolean" && !globalThis.isSecureContext) return fallback();
  try {
    return c.randomUUID();
  } catch {
    return fallback();
  }
}