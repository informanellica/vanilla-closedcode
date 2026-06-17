/** @file Cross-platform string helpers for extracting filename, directory, and extension from a path, plus text truncation. */

/**
 * Extracts the final path segment (filename) from a path string.
 * Trailing slashes/backslashes are stripped before splitting on either separator.
 * @param {string} path - The path to extract the filename from.
 * @returns {string} The last path segment, or an empty string if the path is falsy.
 */
export function getFilename(path) {
  if (!path) return "";
  const trimmed = path.replace(/[/\\]+$/, "");
  const parts = trimmed.split(/[/\\]/);
  return parts[parts.length - 1] ?? "";
}
/**
 * Returns the directory portion of a path, with a trailing slash.
 * Trailing separators are stripped first; segments are rejoined with forward slashes.
 * @param {string} path - The path to extract the directory from.
 * @returns {string} The directory portion ending with "/", or an empty string if the path is falsy.
 */
export function getDirectory(path) {
  if (!path) return "";
  const trimmed = path.replace(/[/\\]+$/, "");
  const parts = trimmed.split(/[/\\]/);
  return parts.slice(0, parts.length - 1).join("/") + "/";
}
/**
 * Returns the file extension of a path (the substring after the last dot).
 * Note: if there is no dot, the whole path is returned.
 * @param {string} path - The path to extract the extension from.
 * @returns {string} The portion after the last dot, or an empty string if the path is falsy.
 */
export function getFileExtension(path) {
  if (!path) return "";
  const parts = path.split(".");
  return parts[parts.length - 1];
}
/**
 * Returns the filename of a path, truncated to a maximum length while preserving the extension.
 * When truncated, an ellipsis is inserted between the truncated base name and the extension.
 * @param {string} path - The path whose filename is truncated.
 * @param {number} maxLength - Maximum length of the returned filename. Defaults to 20.
 * @returns {string} The filename unchanged if short enough, otherwise a truncated form with an ellipsis.
 */
export function getFilenameTruncated(path, maxLength = 20) {
  const filename = getFilename(path);
  if (filename.length <= maxLength) return filename;
  const lastDot = filename.lastIndexOf(".");
  const ext = lastDot <= 0 ? "" : filename.slice(lastDot);
  const available = maxLength - ext.length - 1; // -1 for ellipsis
  if (available <= 0) return filename.slice(0, maxLength - 1) + "…";
  return filename.slice(0, available) + "…" + ext;
}
/**
 * Truncates text to a maximum length by removing characters from the middle and inserting an ellipsis.
 * @param {string} text - The text to truncate.
 * @param {number} maxLength - Maximum length of the returned text. Defaults to 20.
 * @returns {string} The text unchanged if short enough, otherwise its start and end joined by an ellipsis.
 */
export function truncateMiddle(text, maxLength = 20) {
  if (text.length <= maxLength) return text;
  const available = maxLength - 1; // -1 for ellipsis
  const start = Math.ceil(available / 2);
  const end = Math.floor(available / 2);
  return text.slice(0, start) + "…" + text.slice(-end);
}