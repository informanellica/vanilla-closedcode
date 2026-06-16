/** @file Predicate helpers for classifying message file parts (attached vs. inline, image vs. file). */

/**
 * Whether a file part is an attached upload carried as an inline data URL.
 * @param {Object} part - A message file part with a `url` field.
 * @returns {boolean} True when the part's URL is a `data:` URI.
 */
export function attached(part) {
  return part.url.startsWith("data:");
}
/**
 * Whether a file part is an inline reference (a non-attached file with a known source text span).
 * @param {Object} part - A message file part with `url` and optional `source.text` offsets.
 * @returns {boolean} True when the part is not attached and has both source text start and end offsets.
 */
export function inline(part) {
  if (attached(part)) return false;
  return part.source?.text?.start !== undefined && part.source?.text?.end !== undefined;
}
/**
 * Classify a file part by its MIME type.
 * @param {Object} part - A message file part with a `mime` field.
 * @returns {string} "image" for image MIME types, otherwise "file".
 */
export function kind(part) {
  return part.mime.startsWith("image/") ? "image" : "file";
}