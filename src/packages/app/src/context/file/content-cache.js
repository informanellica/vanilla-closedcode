/** @file LRU byte-accounting cache for loaded file contents (tracks size/entry budgets and drives eviction). */
const MAX_FILE_CONTENT_ENTRIES = 40;
const MAX_FILE_CONTENT_BYTES = 20 * 1024 * 1024;
const lru = new Map();
let total = 0;
/**
 * Estimate the in-memory byte footprint of a loaded file content record.
 * @param {Object} content - File content record with `content` text and optional `diff` string and `patch.hunks`.
 * @returns {number} Approximate byte size (UTF-16 weighted) of the content, diff and patch hunks.
 */
export function approxBytes(content) {
  const patchBytes = content.patch?.hunks.reduce((sum, hunk) => {
    return sum + hunk.lines.reduce((lineSum, line) => lineSum + line.length, 0);
  }, 0) ?? 0;
  return (content.content.length + (content.diff?.length ?? 0) + patchBytes) * 2;
}
/**
 * Record a path's byte size and move it to the most-recently-used position, adjusting the running total.
 * @param {string} path - File path key.
 * @param {number} nextBytes - Byte size to associate with the path.
 * @returns {void}
 */
function setBytes(path, nextBytes) {
  const prev = lru.get(path);
  if (prev !== undefined) total -= prev;
  lru.delete(path);
  lru.set(path, nextBytes);
  total += nextBytes;
}
/**
 * Mark a path as recently used, optionally updating its byte size; no-op for unknown paths with no size given.
 * @param {string} path - File path key.
 * @param {number} bytes - Optional new byte size; falls back to the existing size or 0.
 * @returns {void}
 */
function touch(path, bytes) {
  const prev = lru.get(path);
  if (prev === undefined && bytes === undefined) return;
  setBytes(path, bytes ?? prev ?? 0);
}
/**
 * Remove a path from the cache and subtract its bytes from the running total.
 * @param {string} path - File path key to remove.
 * @returns {void}
 */
function remove(path) {
  const prev = lru.get(path);
  if (prev === undefined) return;
  lru.delete(path);
  total -= prev;
}
/**
 * Clear all cache entries and reset the byte total to zero.
 * @returns {void}
 */
function reset() {
  lru.clear();
  total = 0;
}
/**
 * Evict least-recently-used entries until both the entry-count and byte budgets are satisfied.
 * Entries in the `keep` set are preserved (touched) and skipped.
 * @param {Set} keep - Set of paths that must not be evicted.
 * @param {Function} evict - Callback invoked with each evicted path to release its content.
 * @returns {void}
 */
export function evictContentLru(keep, evict) {
  const set = keep ?? new Set();
  while (lru.size > MAX_FILE_CONTENT_ENTRIES || total > MAX_FILE_CONTENT_BYTES) {
    const path = lru.keys().next().value;
    if (!path) return;
    if (set.has(path)) {
      touch(path);
      if (lru.size <= set.size) return;
      continue;
    }
    remove(path);
    evict(path);
  }
}
/**
 * Public wrapper to clear the entire file-content LRU cache.
 * @returns {void}
 */
export function resetFileContentLru() {
  reset();
}
/**
 * Public wrapper to set the byte size for a path and mark it most-recently-used.
 * @param {string} path - File path key.
 * @param {number} bytes - Byte size to associate with the path.
 * @returns {void}
 */
export function setFileContentBytes(path, bytes) {
  setBytes(path, bytes);
}
/**
 * Public wrapper to remove a path from the cache.
 * @param {string} path - File path key to remove.
 * @returns {void}
 */
export function removeFileContentBytes(path) {
  remove(path);
}
/**
 * Public wrapper to mark a path most-recently-used, optionally updating its size.
 * @param {string} path - File path key.
 * @param {number} bytes - Optional new byte size.
 * @returns {void}
 */
export function touchFileContent(path, bytes) {
  touch(path, bytes);
}
/**
 * Get the total estimated bytes currently tracked across all cached files.
 * @returns {number} Running byte total.
 */
export function getFileContentBytesTotal() {
  return total;
}
/**
 * Get the number of files currently tracked in the cache.
 * @returns {number} Entry count.
 */
export function getFileContentEntryCount() {
  return lru.size;
}
/**
 * Check whether a path is currently tracked in the cache.
 * @param {string} path - File path key.
 * @returns {boolean} True if the path has a cache entry.
 */
export function hasFileContent(path) {
  return lru.has(path);
}