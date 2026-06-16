/** @file Normalizes a workspace directory path into a stable storage/lookup key. */

/**
 * Test whether a string is a bare Windows drive designator like "C:".
 * @param {string} value - Candidate string.
 * @returns {boolean} True when the value is exactly two chars: a letter followed by ":".
 */
const isDrive = value => {
  if (value.length !== 2) return false;
  const code = value.charCodeAt(0);
  return value[1] === ":" && (code >= 65 && code <= 90 || code >= 97 && code <= 122);
};
/**
 * Remove all trailing forward slashes from a string.
 * @param {string} value - Input string.
 * @returns {string} The input without any trailing "/" characters.
 */
const trimTrailingSlashes = value => {
  for (let i = value.length - 1; i >= 0; i--) {
    if (value[i] !== "/") return value.slice(0, i + 1);
  }
  return "";
};
/**
 * Detect whether a path looks like a Windows path (drive-letter or UNC prefix).
 * @param {string} value - Candidate path.
 * @returns {boolean} True for "X:..." drive paths or "\\\\" UNC paths.
 */
const isWindowsPath = value => !!value && (value[1] === ":" || value.startsWith("\\\\"));

/**
 * Normalize a directory path to a canonical key: backslashes become forward
 * slashes (on Windows paths), trailing slashes are trimmed, and a bare drive is
 * given a trailing slash. Absent paths pass through unchanged so callers stay
 * string-safe during transient route navigation.
 * @param {string} path - Path to normalize (may be falsy).
 * @returns {string} The normalized key, or the original falsy value when no path is given.
 */
export const pathKey = path => {
  // Tolerate an absent path: route-param-driven workspaces (terminal, layout, …)
  // briefly re-run with `params.dir === undefined` while navigating to the
  // no-project home ("/") before their owner is disposed. Without this guard
  // isWindowsPath(undefined) / value.length threw, breaking the whole flush so the
  // home route never rendered (the Home button appeared dead).
  if (!path) return path;
  const value = isWindowsPath(path) ? path.replaceAll("\\", "/") : path;
  const trimmed = trimTrailingSlashes(value);
  if (!trimmed && value.startsWith("/")) return "/";
  if (isDrive(trimmed)) return `${trimmed}/`;
  return trimmed;
};