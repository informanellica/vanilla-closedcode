/** @file Parses a `#message-<id>` URL hash into the bare message id. */

/**
 * Extracts a message id from a URL hash of the form `#message-<id>` (leading `#` optional).
 * @param {string} hash - The location hash to parse.
 * @returns {string} The message id, or undefined when the hash does not match.
 */
export const messageIdFromHash = hash => {
  const value = hash.startsWith("#") ? hash.slice(1) : hash;
  const match = value.match(/^message-(.+)$/);
  if (!match) return;
  return match[1];
};