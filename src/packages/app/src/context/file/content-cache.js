const MAX_FILE_CONTENT_ENTRIES = 40;
const MAX_FILE_CONTENT_BYTES = 20 * 1024 * 1024;
const lru = new Map();
let total = 0;
export function approxBytes(content) {
  const patchBytes = content.patch?.hunks.reduce((sum, hunk) => {
    return sum + hunk.lines.reduce((lineSum, line) => lineSum + line.length, 0);
  }, 0) ?? 0;
  return (content.content.length + (content.diff?.length ?? 0) + patchBytes) * 2;
}
function setBytes(path, nextBytes) {
  const prev = lru.get(path);
  if (prev !== undefined) total -= prev;
  lru.delete(path);
  lru.set(path, nextBytes);
  total += nextBytes;
}
function touch(path, bytes) {
  const prev = lru.get(path);
  if (prev === undefined && bytes === undefined) return;
  setBytes(path, bytes ?? prev ?? 0);
}
function remove(path) {
  const prev = lru.get(path);
  if (prev === undefined) return;
  lru.delete(path);
  total -= prev;
}
function reset() {
  lru.clear();
  total = 0;
}
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
export function resetFileContentLru() {
  reset();
}
export function setFileContentBytes(path, bytes) {
  setBytes(path, bytes);
}
export function removeFileContentBytes(path) {
  remove(path);
}
export function touchFileContent(path, bytes) {
  touch(path, bytes);
}
export function getFileContentBytesTotal() {
  return total;
}
export function getFileContentEntryCount() {
  return lru.size;
}
export function hasFileContent(path) {
  return lru.has(path);
}