/** @file Small array helper utilities. */
/**
 * Returns the last element for which the predicate is truthy, scanning from the end.
 * @param {Array} items - The array to search.
 * @param {Function} predicate - Called as (item, index, items); the search stops at the first truthy result from the end.
 * @returns {*} The matching element, or undefined when none match.
 */
export function findLast(items, predicate) {
  for (let i = items.length - 1; i >= 0; i -= 1) {
    const item = items[i];
    if (predicate(item, i, items)) return item;
  }
  return undefined;
}