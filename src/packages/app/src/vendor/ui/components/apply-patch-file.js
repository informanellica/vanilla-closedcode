/** @file Normalizes raw apply-patch payloads into structured per-file diff entries for rendering. */
import { normalize } from "./session-diff.js";
/**
 * Narrows an arbitrary value to a known patch operation kind.
 * @param {*} value - Candidate operation type.
 * @returns {string} The value when it is "add", "update", "delete", or "move"; otherwise undefined.
 */
function kind(value) {
  if (value === "add" || value === "update" || value === "delete" || value === "move") return value;
}
/**
 * Maps a patch operation type to a diff status string.
 * @param {string} type - Operation type ("add", "delete", or other).
 * @returns {string} "added", "deleted", or "modified".
 */
function status(type) {
  if (type === "add") return "added";
  if (type === "delete") return "deleted";
  return "modified";
}
/**
 * Validates and normalizes a single raw patch payload into a structured file entry.
 * @param {Object} raw - Raw patch object with fields such as type, filePath, patch/diff, before, after, additions, deletions, movePath.
 * @returns {Object} A normalized entry with filePath, relativePath, type, additions, deletions, movePath, and a normalized diff view; or undefined when the input is invalid or carries no content.
 */
export function patchFile(raw) {
  if (!raw || typeof raw !== "object") return;
  const value = raw;
  const type = kind(value.type);
  const filePath = typeof value.filePath === "string" ? value.filePath : undefined;
  const relativePath = typeof value.relativePath === "string" ? value.relativePath : filePath;
  const patch = typeof value.patch === "string" ? value.patch : typeof value.diff === "string" ? value.diff : undefined;
  const before = typeof value.before === "string" ? value.before : undefined;
  const after = typeof value.after === "string" ? value.after : undefined;
  if (!type || !filePath || !relativePath) return;
  if (!patch && before === undefined && after === undefined) return;
  const additions = typeof value.additions === "number" ? value.additions : 0;
  const deletions = typeof value.deletions === "number" ? value.deletions : 0;
  const movePath = typeof value.movePath === "string" ? value.movePath : undefined;
  return {
    filePath,
    relativePath,
    type,
    additions,
    deletions,
    movePath,
    view: normalize({
      file: relativePath,
      patch,
      before,
      after,
      additions,
      deletions,
      status: status(type)
    })
  };
}
/**
 * Normalizes an array of raw patch payloads, dropping any invalid entries.
 * @param {Array} raw - Array of raw patch objects.
 * @returns {Array} Array of normalized file entries produced by patchFile.
 */
export function patchFiles(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map(patchFile).filter(file => !!file);
}