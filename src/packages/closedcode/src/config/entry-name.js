/** @file Derives a config entry name from a file path relative to known search roots. */
import path from "path";
/**
 * Return the portion of a (forward-slash-normalized) path that follows the first
 * matching search root, or `undefined` when no root matches.
 * @param {string} filePath - The file path to inspect (Windows or POSIX separators).
 * @param {Array<string>} searchRoots - Root substrings to match against, in priority order.
 * @returns {string|undefined} The path slice after the matched root, or `undefined`.
 */
function sliceAfterMatch(filePath, searchRoots) {
  const normalizedPath = filePath.replaceAll("\\", "/");
  for (const searchRoot of searchRoots) {
    const index = normalizedPath.indexOf(searchRoot);
    if (index === -1) continue;
    return normalizedPath.slice(index + searchRoot.length);
  }
}
/**
 * Compute the config entry name for a file: the path after a matching search
 * root (or the basename when none match), with its extension stripped.
 * @param {string} filePath - The config file path.
 * @param {Array<string>} searchRoots - Root substrings used to make the name relative.
 * @returns {string} The extension-less entry name.
 */
export function configEntryNameFromPath(filePath, searchRoots) {
  const candidate = sliceAfterMatch(filePath, searchRoots) ?? path.basename(filePath);
  const ext = path.extname(candidate);
  return ext.length ? candidate.slice(0, -ext.length) : candidate;
}