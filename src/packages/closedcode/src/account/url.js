/** @file Helper for normalizing account/auth server URLs. */

/**
 * Normalize a server URL by stripping query string, hash fragment, and any trailing slashes.
 * @param {string} input - The raw server URL to normalize.
 * @returns {string} The origin alone when no path remains, otherwise origin plus the cleaned pathname.
 */
export const normalizeServerUrl = input => {
  const url = new URL(input);
  url.search = "";
  url.hash = "";
  const pathname = url.pathname.replace(/\/+$/, "");
  return pathname.length === 0 ? url.origin : `${url.origin}${pathname}`;
};