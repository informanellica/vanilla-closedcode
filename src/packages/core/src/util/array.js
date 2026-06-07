export function findLast(items, predicate) {
  for (let i = items.length - 1; i >= 0; i -= 1) {
    const item = items[i];
    if (predicate(item, i, items)) return item;
  }
  return undefined;
}