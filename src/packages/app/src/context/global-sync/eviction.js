/** @file Heuristics for choosing which per-directory stores to evict and whether a directory store may be disposed. */
/**
 * Select directory store keys to evict, prioritising those past their idle TTL and trimming overflow above the cap.
 * Pinned directories are excluded; remaining directories are sorted oldest-access first.
 * @param {Object} input - Eviction inputs: {stores: Array, max: number, pins: Set, state: Map, now: number, ttl: number}.
 * @returns {Array} Directory keys selected for eviction, oldest-access first.
 */
export function pickDirectoriesToEvict(input) {
  const overflow = Math.max(0, input.stores.length - input.max);
  let pendingOverflow = overflow;
  const sorted = input.stores.filter(dir => !input.pins.has(dir)).slice().sort((a, b) => (input.state.get(a)?.lastAccessAt ?? 0) - (input.state.get(b)?.lastAccessAt ?? 0));
  const output = [];
  for (const dir of sorted) {
    const last = input.state.get(dir)?.lastAccessAt ?? 0;
    const idle = input.now - last >= input.ttl;
    if (!idle && pendingOverflow <= 0) continue;
    output.push(dir);
    if (pendingOverflow > 0) pendingOverflow -= 1;
  }
  return output;
}
/**
 * Decide whether a directory store can be safely disposed right now.
 * Returns false if the directory is missing, has no store, is pinned, booting, or still loading sessions.
 * @param {Object} input - Disposal guards: {directory: *, hasStore: boolean, pinned: boolean, booting: boolean, loadingSessions: boolean}.
 * @returns {boolean} True when the directory store is eligible for disposal.
 */
export function canDisposeDirectory(input) {
  if (!input.directory) return false;
  if (!input.hasStore) return false;
  if (input.pinned) return false;
  if (input.booting) return false;
  if (input.loadingSessions) return false;
  return true;
}